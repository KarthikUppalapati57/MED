-- Acceptance test for 20260721000021_invoice_anomaly_review_workflow.sql

BEGIN;

DO $$
DECLARE
  v_trigger text;
BEGIN
  FOR v_trigger IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.invoices'::regclass
      AND tgname IN ('trg_invoices_webhook', 'trg_invoices_webhook_insert', 'trg_invoices_webhook_update')
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DISABLE TRIGGER %I', v_trigger);
  END LOOP;
END $$;
CREATE TEMP TABLE iarw_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON iarw_ids TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_vendor uuid;
  v_invoice uuid;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_user, 'authenticated', 'authenticated', 'iarw-user@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'IARW Tenant', 'iarw-tenant-' || substr(v_tenant::text, 1, 8), v_user);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'IARW Org', 'iarw-org-' || substr(v_org::text, 1, 8), v_user);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'IARW Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'IARW Location');

  INSERT INTO public.profiles (
    id, email, full_name, role, status, organization_id, tenant_id,
    brand_id, location_id, invoice_approval_limit, has_unlimited_approval
  ) VALUES (
    v_user, 'iarw-user@example.test', 'IARW User', 'location_manager', 'active',
    v_org, v_tenant, v_brand, v_location, 100000, true
  ) ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    tenant_id = EXCLUDED.tenant_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_user, 'location_manager')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vendors (organization_id, name, autopay_enabled)
  VALUES (v_org, 'IARW Vendor', false)
  RETURNING id INTO v_vendor;

  ALTER TABLE public.invoices DISABLE TRIGGER normalize_invoice_ap_state;
  ALTER TABLE public.invoices DISABLE TRIGGER enforce_invoice_approval_authorization;

  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, 'IARW Vendor', 'IARW-DESYNC-1',
    100, 'approved', 'processing', 'unpaid', v_user, 'manual_upload'
  ) RETURNING id INTO v_invoice;

  ALTER TABLE public.invoices ENABLE TRIGGER enforce_invoice_approval_authorization;
  ALTER TABLE public.invoices ENABLE TRIGGER normalize_invoice_ap_state;

  INSERT INTO iarw_ids VALUES ('user', v_user), ('invoice', v_invoice);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_production_anomalies'
      AND column_name = 'latest_review_decision'
  ) THEN
    RAISE EXCEPTION 'invoice_production_anomalies.latest_review_decision column is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_production_anomalies'
      AND column_name = 'latest_reviewed_at'
  ) THEN
    RAISE EXCEPTION 'invoice_production_anomalies.latest_reviewed_at column is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.invoice_production_anomalies
    WHERE id = (SELECT value FROM iarw_ids WHERE key = 'invoice')
      AND anomaly_type = 'approved_status_ap_status_desync'
  ) THEN
    RAISE EXCEPTION 'anomaly view did not surface approved/ap_status desync';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM iarw_ids WHERE key = 'user'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM iarw_ids WHERE key = 'user'), 'role', 'authenticated')::text, true);

SELECT public.record_invoice_anomaly_review(
  (SELECT value FROM iarw_ids WHERE key = 'invoice'),
  'approved_status_ap_status_desync',
  'accepted_historical',
  'accepted by rollback acceptance test'
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.invoice_anomaly_reviews
    WHERE invoice_id = (SELECT value FROM iarw_ids WHERE key = 'invoice')
      AND anomaly_type = 'approved_status_ap_status_desync'
      AND decision = 'accepted_historical'
  ) THEN
    RAISE EXCEPTION 'invoice anomaly review decision was not persisted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_production_anomalies
    WHERE id = (SELECT value FROM iarw_ids WHERE key = 'invoice')
  ) THEN
    RAISE EXCEPTION 'accepted historical anomaly still appears in unresolved anomaly view';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE id = (SELECT value FROM iarw_ids WHERE key = 'invoice')
      AND validation_results->'invoice_anomaly_review'->>'decision' = 'accepted_historical'
  ) THEN
    RAISE EXCEPTION 'invoice validation_results did not capture latest anomaly decision';
  END IF;

  RAISE NOTICE 'Invoice anomaly review workflow acceptance assertions passed';
END $$;

ROLLBACK;
