BEGIN;

DO $$
DECLARE
  v_trigger text;
BEGIN
  FOR v_trigger IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.invoices'::regclass
      AND tgname IN ('trg_invoices_webhook', 'trg_invoices_webhook_insert', 'trg_invoices_webhook_update', 'enforce_invoice_approval_authorization')
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DISABLE TRIGGER %I', v_trigger);
  END LOOP;
END $$;

CREATE TEMP TABLE autopay_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON autopay_ids TO authenticated, service_role;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_org_manager, 'authenticated', 'authenticated', 'autopay-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Autopay Scheduled Tenant', 'autopay-scheduled-tenant-' || substr(v_tenant::text, 1, 8), v_org_manager);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Autopay Scheduled Marker Org', 'autopay-scheduled-' || substr(v_org::text, 1, 8), v_org_manager);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Autopay Scheduled Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'Autopay Scheduled Location');

  INSERT INTO public.profiles (
    id, email, full_name, role, status, organization_id, tenant_id, invoice_approval_limit, has_unlimited_approval
  ) VALUES (
    v_org_manager, 'autopay-org-manager@example.test', 'Autopay Org Manager', 'org_manager', 'active', v_org, v_tenant, 100000, true
  ) ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role,
    has_unlimited_approval = EXCLUDED.has_unlimited_approval;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_org_manager, 'org_manager')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vendors (id, organization_id, name, status, autopay_enabled, default_payment_method)
  VALUES (v_vendor, v_org, 'Autopay Vendor', 'active', true, NULL);

  INSERT INTO autopay_ids VALUES
    ('tenant', v_tenant), ('org', v_org), ('brand', v_brand), ('location', v_location),
    ('org_manager', v_org_manager), ('vendor', v_vendor);
END $$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_org uuid := (SELECT value FROM autopay_ids WHERE key = 'org');
  v_brand uuid := (SELECT value FROM autopay_ids WHERE key = 'brand');
  v_location uuid := (SELECT value FROM autopay_ids WHERE key = 'location');
  v_vendor uuid := (SELECT value FROM autopay_ids WHERE key = 'vendor');
  v_manual_invoice uuid;
  v_autopay_invoice uuid;
  v_schedule_date date := current_date + 3;
  v_manual_count integer;
  v_autopay_count integer;
BEGIN
  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, payment_status, source, due_date
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, 'Autopay Vendor', 'AUTO-MANUAL-001', 10.00,
    'approved', 'approved', 'unpaid', 'manual_upload', v_schedule_date
  ) RETURNING id INTO v_manual_invoice;

  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, payment_status, source, due_date
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, 'Autopay Vendor', 'AUTO-BRANCH-001', 12.00,
    'approved', 'approved', 'unpaid', 'manual_upload', v_schedule_date
  ) RETURNING id INTO v_autopay_invoice;

  UPDATE public.invoices
     SET scheduled_payment_date = v_schedule_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = v_manual_invoice;

  INSERT INTO public.payments (
    organization_id, brand_id, location_id, vendor_id, invoice_id, amount,
    status, payment_method, payment_date
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, v_autopay_invoice, 12.00,
    'pending', 'bank_transfer', v_schedule_date
  );

  UPDATE public.invoices
     SET scheduled_payment_date = v_schedule_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = v_autopay_invoice;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE id = v_autopay_invoice AND payment_status = 'scheduled') THEN
    RAISE EXCEPTION 'autopay invoice still uses unread payment_status=scheduled leak';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE invoice_id = v_autopay_invoice AND status = 'pending' AND payment_method = 'bank_transfer'
  ) THEN
    RAISE EXCEPTION 'autopay payment row was not inserted with constraint-valid status=pending and fallback payment_method=bank_transfer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = v_autopay_invoice
      AND status = 'scheduled'
      AND ap_status = 'scheduled'
      AND scheduled_payment_date = v_schedule_date
      AND payment_status = 'unpaid'
  ) THEN
    RAISE EXCEPTION 'autopay invoice was not marked scheduled through status/ap_status/scheduled_payment_date';
  END IF;

  SELECT count(*) INTO v_manual_count
  FROM public.invoices
  WHERE organization_id = v_org AND status = 'scheduled' AND scheduled_payment_date = v_schedule_date AND id = v_manual_invoice;

  SELECT count(*) INTO v_autopay_count
  FROM public.invoices
  WHERE organization_id = v_org AND status = 'scheduled' AND scheduled_payment_date = v_schedule_date AND id = v_autopay_invoice;

  IF v_manual_count <> 1 OR v_autopay_count <> 1 THEN
    RAISE EXCEPTION 'manual/autopay scheduled invoices did not appear identically in status=scheduled reads: manual %, autopay %', v_manual_count, v_autopay_count;
  END IF;

  RAISE NOTICE 'Autopay scheduled marker acceptance assertions passed';
END $$;

RESET ROLE;

ROLLBACK;