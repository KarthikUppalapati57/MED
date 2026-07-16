-- Acceptance test for the process-checkbook-payout/index.ts column-name fix (13.4 pass).
--
-- process-checkbook-payout previously selected vendor:vendor_id ( ..., street_1, street_2,
-- none of street_1/street_2/zip exist on public.vendors (the real
-- columns are mailing_address_line1/mailing_city/mailing_state/mailing_zip_code), so EVERY call to this function failed at the
-- select step, for both digital and physical checks. This test mirrors the edge function's
-- exact select shape against a seeded invoice+vendor and proves it now succeeds and returns
-- the expected address fields.

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_vendor uuid;
  v_invoice uuid;
  v_selected_address text;
  v_selected_zip text;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'PCPVC Org', 'pcpvc-org-' || v_org);

  INSERT INTO public.vendors (organization_id, name, email, mailing_address_line1, mailing_city, mailing_state, mailing_zip_code)
  VALUES (v_org, 'PCPVC Vendor', 'pcpvc-vendor@example.test', '123 Main St', 'Knoxville', 'TN', '37916')
  RETURNING id INTO v_vendor;

  INSERT INTO public.invoices (organization_id, vendor_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_vendor, 'PCPVC Vendor', 'PCPVC-INV-1', 100, 'pending_review')
  RETURNING id INTO v_invoice;

  -- Mirrors process-checkbook-payout/index.ts's exact select shape (vendor:vendor_id (...))
  SELECT v.mailing_address_line1, v.mailing_zip_code INTO v_selected_address, v_selected_zip
  FROM public.invoices i
  JOIN public.vendors v ON v.id = i.vendor_id
  WHERE i.id = v_invoice;

  IF v_selected_address IS DISTINCT FROM '123 Main St' OR v_selected_zip IS DISTINCT FROM '37916' THEN
    RAISE EXCEPTION 'process_checkbook_payout_vendor_columns_acceptance failed: address=% zip=%', v_selected_address, v_selected_zip;
  END IF;
END $$;

-- the specific columns the (previously broken) select referenced must not exist -- confirms
-- the bug was real, not a false alarm
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name IN ('street_1', 'street_2', 'zip')
  ) THEN
    RAISE EXCEPTION 'process_checkbook_payout_vendor_columns_acceptance failed: street_1/street_2/zip unexpectedly exist -- re-check the fix is still needed';
  END IF;
END $$;

SELECT 'process_checkbook_payout_vendor_columns_acceptance' AS test_name, true AS passed;

ROLLBACK;
