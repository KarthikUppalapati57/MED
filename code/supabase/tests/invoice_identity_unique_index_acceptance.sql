BEGIN;

-- ponytail: isolate the pre-existing unfiltered AFTER-UPDATE invoice webhook in tests.
-- This constraint test does not exercise invoice-processing, and local SQL tests do
-- not provide a webhook endpoint.
ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_vendor_a uuid := gen_random_uuid();
  v_vendor_b uuid := gen_random_uuid();
  v_invoice_a uuid;
  v_duplicate_rejected boolean := false;
  v_null_vendor_first uuid;
  v_null_vendor_second uuid;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'VAL1 Duplicate Identity Org', 'val1-dup-' || substr(v_org::text, 1, 8));

  INSERT INTO public.vendors (id, organization_id, name, status)
  VALUES
    (v_vendor_a, v_org, 'VAL1 Vendor A', 'active'),
    (v_vendor_b, v_org, 'VAL1 Vendor B', 'active');

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, source
  ) VALUES (
    v_org, v_vendor_a, 'VAL1 Vendor A', 'INV-001', 10.00,
    'pending_review', 'processing', 'manual_upload'
  )
  RETURNING id INTO v_invoice_a;

  BEGIN
    INSERT INTO public.invoices (
      organization_id, vendor_id, vendor_name, invoice_number, total_amount,
      status, ap_status, source
    ) VALUES (
      v_org, v_vendor_a, 'VAL1 Vendor A', 'INV-001', 11.00,
      'pending_review', 'processing', 'manual_upload'
    );
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_rejected := true;
  END;

  IF v_duplicate_rejected IS NOT TRUE THEN
    RAISE EXCEPTION 'duplicate active invoice for same org/vendor/invoice_number was not rejected';
  END IF;

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, source
  ) VALUES (
    v_org, v_vendor_b, 'VAL1 Vendor B', 'INV-001', 12.00,
    'pending_review', 'processing', 'manual_upload'
  );

  UPDATE public.invoices
     SET deleted_at = now()
   WHERE id = v_invoice_a;

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, source
  ) VALUES (
    v_org, v_vendor_a, 'VAL1 Vendor A', 'INV-001', 13.00,
    'pending_review', 'processing', 'manual_upload'
  );

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, source
  ) VALUES (
    v_org, NULL, 'Unmatched Vendor', 'INV-NULL-VENDOR', 14.00,
    'pending_review', 'processing', 'manual_upload'
  )
  RETURNING id INTO v_null_vendor_first;

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, source
  ) VALUES (
    v_org, NULL, 'Unmatched Vendor Again', 'INV-NULL-VENDOR', 15.00,
    'pending_review', 'processing', 'manual_upload'
  )
  RETURNING id INTO v_null_vendor_second;

  IF v_null_vendor_first IS NULL OR v_null_vendor_second IS NULL THEN
    RAISE EXCEPTION 'NULL-vendor duplicate invoices were not both inserted';
  END IF;

  RAISE NOTICE 'VAL1 duplicate invoice identity assertions passed';
END $$;

ROLLBACK;