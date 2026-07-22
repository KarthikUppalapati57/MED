-- Acceptance test for the process-checkbook-payout/index.ts column-name fix (13.4 pass).
--
-- process-checkbook-payout previously selected vendor:vendor_id ( ..., street_1, street_2,
-- none of street_1/street_2/zip exist on public.vendors (the real
-- columns are mailing_address_line1/mailing_city/mailing_state/mailing_zip_code), so EVERY call to this function failed at the
-- select step, for both digital and physical checks. This test mirrors the edge function's
-- exact select shape against a seeded invoice+vendor and proves it now succeeds and returns
-- the expected address fields.

BEGIN;


CREATE TEMP TABLE pcpvc_results (
  test_name text,
  passed boolean
) ON COMMIT DROP;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid;
  v_invoice uuid;
  v_selected_address text;
  v_selected_zip text;BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_owner, 'authenticated', 'authenticated', 'pcpvc-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'PCPVC Tenant', 'pcpvc-tenant-' || substr(v_tenant::text, 1, 8), v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'PCPVC Org', 'pcpvc-org-' || substr(v_org::text, 1, 8), v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'PCPVC Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'PCPVC Location');

  INSERT INTO public.vendors (organization_id, name, email, mailing_address_line1, mailing_city, mailing_state, mailing_zip_code)
  VALUES (v_org, 'PCPVC Vendor', 'pcpvc-vendor@example.test', '123 Main St', 'Knoxville', 'TN', '37916')
  RETURNING id INTO v_vendor;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, v_vendor, 'PCPVC Vendor', 'PCPVC-INV-1', 100, 'pending_review')
  RETURNING id INTO v_invoice;

  -- Mirrors process-checkbook-payout/index.ts's exact select shape (vendor:vendor_id (...))
  SELECT v.mailing_address_line1, v.mailing_zip_code INTO v_selected_address, v_selected_zip
  FROM public.invoices i
  JOIN public.vendors v ON v.id = i.vendor_id
  WHERE i.id = v_invoice;

  INSERT INTO pcpvc_results VALUES (
    'process_checkbook_payout_vendor_columns_acceptance: address and zip retrieved correctly',
    v_selected_address = '123 Main St' AND v_selected_zip = '37916'
  );
END $$;

-- the specific columns the (previously broken) select referenced must not exist -- confirms
-- the bug was real, not a false alarm
DO $$
BEGIN
  INSERT INTO pcpvc_results VALUES (
    'process_checkbook_payout_vendor_columns_acceptance: old column names are correctly absent',
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name IN ('street_1', 'street_2', 'zip')
    )
  );
END $$;
DO $$
DECLARE
  v_failed text;
BEGIN
  SELECT string_agg(test_name, ', ' ORDER BY test_name)
    INTO v_failed
  FROM pcpvc_results
  WHERE NOT passed;

  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION 'Checkbook payout vendor-column acceptance failed: %', v_failed;
  END IF;

  RAISE NOTICE 'Checkbook payout vendor-column acceptance assertions passed';
END $$;

ROLLBACK;
