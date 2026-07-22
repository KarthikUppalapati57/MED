-- Fix two issues confirmed by the runtime audit:
-- 1. retry_stuck_integrations referenced a removed integrations.status column.
-- 2. record_invoice_payment inserted completed manual payments without an explicit payout_status.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('retry_stuck_integrations')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry_stuck_integrations');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM cron.schedule(
        'retry_stuck_integrations',
        '*/30 * * * *',
        $cron$
        UPDATE public.integrations
           SET is_active = false,
               metadata = jsonb_set(
                 jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sync_status}', '"failed"', true),
                 '{last_error}',
                 '"Timeout during sync"',
                 true
               ),
               updated_at = now()
         WHERE COALESCE(metadata->>'sync_status', metadata->>'status') = 'syncing'
           AND updated_at < now() - interval '1 hour';
        $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_payment_method TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_existing_payment_id UUID;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF v_invoice.status = 'rejected' OR v_invoice.ap_status = 'rejected' THEN
    RAISE EXCEPTION 'Rejected invoices cannot receive payments';
  END IF;

  SELECT id
    INTO v_existing_payment_id
  FROM public.payments
  WHERE invoice_id = p_invoice_id
    AND transaction_id = p_reference
    AND COALESCE(status, 'pending') NOT IN ('failed', 'cancelled', 'refunded')
  LIMIT 1;

  IF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment reference % has already been recorded for this invoice', p_reference;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot receive another payment';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before recording payment';
  END IF;

  v_remaining := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0));
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount % exceeds remaining balance %', p_amount, v_remaining;
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  v_new_status := CASE
    WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
     SET paid_amount = v_new_paid_amount,
         payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
         status = v_new_status,
         ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
         payment_reference = p_reference,
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id,
    vendor_id,
    vendor_name,
    invoice_number,
    amount,
    payment_method,
    status,
    payout_status,
    transaction_id,
    payment_date,
    payment_account_id,
    organization_id,
    brand_id,
    location_id,
    created_by
  ) VALUES (
    v_invoice.id,
    v_invoice.vendor_id,
    v_invoice.vendor_name,
    v_invoice.invoice_number,
    p_amount,
    p_payment_method,
    'completed',
    'completed',
    p_reference,
    CURRENT_DATE,
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.log_invoice_audit_event(
    v_invoice.id,
    'payment_recorded',
    'Payment recorded through tenant-safe financial RPC',
    to_jsonb(v_invoice),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference', p_reference,
      'status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

COMMIT;