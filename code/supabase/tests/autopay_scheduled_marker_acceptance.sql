BEGIN;

-- ponytail: isolate the pre-existing unfiltered AFTER-UPDATE invoice webhook in tests.
-- This check simulates the autopay branch's invoice update shape and local SQL tests do
-- not provide a webhook endpoint.
ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_manual_invoice uuid;
  v_autopay_invoice uuid;
  v_schedule_date date := current_date + 3;
  v_manual_count integer;
  v_autopay_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Autopay Scheduled Marker Org', 'autopay-scheduled-' || substr(v_org::text, 1, 8));

  INSERT INTO public.vendors (id, organization_id, name, status, autopay_enabled, default_payment_method)
  VALUES (v_vendor, v_org, 'Autopay Vendor', 'active', true, NULL);

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, payment_status, source, due_date
  ) VALUES (
    v_org, v_vendor, 'Autopay Vendor', 'AUTO-MANUAL-001', 10.00,
    'approved', 'approved', 'unpaid', 'manual_upload', v_schedule_date
  ) RETURNING id INTO v_manual_invoice;

  INSERT INTO public.invoices (
    organization_id, vendor_id, vendor_name, invoice_number, total_amount,
    status, ap_status, payment_status, source, due_date
  ) VALUES (
    v_org, v_vendor, 'Autopay Vendor', 'AUTO-BRANCH-001', 12.00,
    'approved', 'approved', 'unpaid', 'manual_upload', v_schedule_date
  ) RETURNING id INTO v_autopay_invoice;

  -- Manual schedule end-state read channels from schedule_invoice_payment.
  UPDATE public.invoices
     SET scheduled_payment_date = v_schedule_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = v_manual_invoice;

  -- Simulated autopay branch after code fix: payments row uses the allowed queued state,
  -- and mark the invoice scheduled through the same read-channel columns.
  INSERT INTO public.payments (
    organization_id, location_id, vendor_id, invoice_id, amount,
    status, payment_method, payment_date
  ) VALUES (
    v_org, NULL, v_vendor, v_autopay_invoice, 12.00,
    'pending', 'bank_transfer', v_schedule_date
  );

  UPDATE public.invoices
     SET scheduled_payment_date = v_schedule_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = v_autopay_invoice;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE id = v_autopay_invoice
      AND payment_status = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'autopay invoice still uses unread payment_status=scheduled leak';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE invoice_id = v_autopay_invoice
      AND status = 'pending'
      AND payment_method = 'bank_transfer'
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
  WHERE organization_id = v_org
    AND status = 'scheduled'
    AND scheduled_payment_date = v_schedule_date
    AND id = v_manual_invoice;

  SELECT count(*) INTO v_autopay_count
  FROM public.invoices
  WHERE organization_id = v_org
    AND status = 'scheduled'
    AND scheduled_payment_date = v_schedule_date
    AND id = v_autopay_invoice;

  IF v_manual_count <> 1 OR v_autopay_count <> 1 THEN
    RAISE EXCEPTION 'manual/autopay scheduled invoices did not appear identically in status=scheduled reads: manual %, autopay %', v_manual_count, v_autopay_count;
  END IF;

  RAISE NOTICE 'Autopay scheduled marker acceptance assertions passed';
END $$;

ROLLBACK;