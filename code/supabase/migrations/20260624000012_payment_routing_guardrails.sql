-- Payment routing guardrails for Bill Pay workflows.
-- Prevents storage/accounting/manual-paid-only invoices and already-paid invoices
-- from being scheduled or manually recorded through the payable queue RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_invoice_payment(
  p_invoice_id UUID,
  p_payment_account_id UUID,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, status, payment_status, ap_status, ap_routing_destination
    INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot be scheduled for payment';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before scheduling payment';
  END IF;

  UPDATE public.invoices
     SET payment_account_id = p_payment_account_id,
         scheduled_payment_date = p_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'scheduled', 'scheduled_payment_date', p_date);
END;
$$;

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

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
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
    p_reference,
    CURRENT_DATE,
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_payment_batch(
  p_vendor_id UUID,
  p_payment_account_id UUID,
  p_scheduled_date DATE,
  p_invoice_ids UUID[],
  p_amounts NUMERIC[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scheduled_payment_id UUID;
  v_total NUMERIC := 0;
  v_invoice RECORD;
  v_index INTEGER;
BEGIN
  IF array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one invoice is required';
  END IF;

  IF array_length(p_invoice_ids, 1) <> array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must have the same length';
  END IF;

  FOR v_index IN 1 .. array_length(p_invoice_ids, 1) LOOP
    SELECT id, vendor_id, status, payment_status, ap_routing_destination
      INTO v_invoice
      FROM public.invoices
     WHERE id = p_invoice_ids[v_index]
     FOR UPDATE;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_ids[v_index];
    END IF;

    IF v_invoice.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'All selected invoices must belong to the selected vendor';
    END IF;

    IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
      RAISE EXCEPTION 'Invoice % is not routed to Payments', v_invoice.id;
    END IF;

    IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
      RAISE EXCEPTION 'Paid invoice % cannot be scheduled', v_invoice.id;
    END IF;

    IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
      RAISE EXCEPTION 'Invoice % must be approved before scheduling payment', v_invoice.id;
    END IF;

    IF COALESCE(p_amounts[v_index], 0) <= 0 THEN
      RAISE EXCEPTION 'Scheduled amount must be greater than zero';
    END IF;

    v_total := v_total + p_amounts[v_index];
  END LOOP;

  INSERT INTO public.scheduled_payments (
    organization_id,
    vendor_id,
    payment_account_id,
    total_amount,
    scheduled_date,
    status,
    created_by
  ) VALUES (
    public.get_my_org(),
    p_vendor_id,
    p_payment_account_id,
    v_total,
    p_scheduled_date,
    'scheduled',
    auth.uid()
  ) RETURNING id INTO v_scheduled_payment_id;

  FOR v_index IN 1 .. array_length(p_invoice_ids, 1) LOOP
    INSERT INTO public.scheduled_payment_invoices (
      scheduled_payment_id,
      invoice_id,
      amount_applied
    ) VALUES (
      v_scheduled_payment_id,
      p_invoice_ids[v_index],
      p_amounts[v_index]
    );

    UPDATE public.invoices
       SET scheduled_payment_date = p_scheduled_date,
           payment_account_id = p_payment_account_id,
           status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
           ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
           updated_at = now()
     WHERE id = p_invoice_ids[v_index];
  END LOOP;

  RETURN v_scheduled_payment_id;
END;
$$;

COMMIT;