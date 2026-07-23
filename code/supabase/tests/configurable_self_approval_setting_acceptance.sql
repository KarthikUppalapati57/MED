-- Acceptance test for configurable self-approval enforcement.

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

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_vendor uuid;
  v_invoice_allowed uuid;
  v_invoice_blocked uuid;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_user, 'authenticated', 'authenticated', 'self-approval@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Self Approval Tenant', 'self-approval-tenant-' || substr(v_tenant::text, 1, 8), v_user);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Self Approval Org', 'self-approval-org-' || substr(v_org::text, 1, 8), v_user);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Self Approval Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'Self Approval Location');

  INSERT INTO public.profiles (
    id, email, full_name, role, status, organization_id, tenant_id,
    brand_id, location_id, invoice_approval_limit, has_unlimited_approval
  ) VALUES (
    v_user, 'self-approval@example.test', 'Self Approval User', 'location_manager', 'active',
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
  VALUES (v_org, 'Self Approval Vendor', false)
  RETURNING id INTO v_vendor;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.operational_settings (
    organization_id, brand_id, location_id, scope, category, settings, created_by, updated_by
  ) VALUES (
    v_org, v_brand, v_location, 'location', 'payments',
    jsonb_build_object('requireSeparateApprover', false, 'enforceApprovalLimits', false),
    v_user, v_user
  );

  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, 'Self Approval Vendor', 'SELF-APPROVAL-ALLOW',
    25, 'pending_review', 'processing', 'unpaid', v_user, 'manual_upload'
  ) RETURNING id INTO v_invoice_allowed;

  UPDATE public.invoices
     SET status = 'approved', ap_status = 'approved'
   WHERE id = v_invoice_allowed;

  IF NOT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = v_invoice_allowed
      AND status = 'approved'
      AND ap_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'self approval was not allowed while requireSeparateApprover=false';
  END IF;

  UPDATE public.operational_settings
     SET settings = jsonb_build_object('requireSeparateApprover', true, 'enforceApprovalLimits', false),
         updated_at = now()
   WHERE organization_id = v_org
     AND brand_id = v_brand
     AND location_id = v_location
     AND category = 'payments';

  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    v_org, v_brand, v_location, v_vendor, 'Self Approval Vendor', 'SELF-APPROVAL-BLOCK',
    25, 'pending_review', 'processing', 'unpaid', v_user, 'manual_upload'
  ) RETURNING id INTO v_invoice_blocked;

  BEGIN
    UPDATE public.invoices
       SET status = 'approved', ap_status = 'approved'
     WHERE id = v_invoice_blocked;
    RAISE EXCEPTION 'self approval was allowed while requireSeparateApprover=true';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'Invoice submitters cannot approve their own invoices' THEN
        RAISE;
      END IF;
  END;

  RAISE NOTICE 'Configurable self-approval setting acceptance assertions passed';
END $$;

ROLLBACK;
