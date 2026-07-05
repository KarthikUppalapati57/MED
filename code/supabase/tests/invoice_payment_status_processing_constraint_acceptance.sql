BEGIN;

-- ponytail: isolate the pre-existing unfiltered AFTER-UPDATE invoice webhook in tests.
-- This constraint test does not exercise invoice-processing, and local SQL tests do
-- not provide a webhook endpoint.
ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_invoice uuid;
  v_garbage_rejected boolean := false;
  v_scheduled_rejected boolean := false;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Payment Status Constraint Org', 'payment-status-' || substr(v_org::text, 1, 8));

  INSERT INTO public.invoices (
    organization_id, vendor_name, invoice_number, total_amount,
    status, ap_status, payment_status, source
  ) VALUES (
    v_org, 'Payment Status Vendor', 'PSC-001', 10.00,
    'pending_review', 'processing', 'unpaid', 'manual_upload'
  )
  RETURNING id INTO v_invoice;

  UPDATE public.invoices
     SET payment_status = 'processing'
   WHERE id = v_invoice;

  IF (SELECT payment_status FROM public.invoices WHERE id = v_invoice) <> 'processing' THEN
    RAISE EXCEPTION 'payment_status=processing did not persist';
  END IF;

  BEGIN
    UPDATE public.invoices
       SET payment_status = 'not_a_real_status'
     WHERE id = v_invoice;
  EXCEPTION WHEN check_violation THEN
    v_garbage_rejected := true;
  END;

  IF v_garbage_rejected IS NOT TRUE THEN
    RAISE EXCEPTION 'garbage payment_status bypassed invoices_payment_status_check';
  END IF;

  BEGIN
    UPDATE public.invoices
       SET payment_status = 'scheduled'
     WHERE id = v_invoice;
  EXCEPTION WHEN check_violation THEN
    v_scheduled_rejected := true;
  END;

  IF v_scheduled_rejected IS NOT TRUE THEN
    RAISE EXCEPTION 'payment_status=scheduled was allowed, but scheduled is intentionally excluded';
  END IF;

  RAISE NOTICE 'Invoice payment_status processing constraint acceptance assertions passed';
END $$;

ROLLBACK;
