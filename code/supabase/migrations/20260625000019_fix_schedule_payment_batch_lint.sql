BEGIN;

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
  v_organization_id UUID;
  v_account_org UUID;
BEGIN
  IF array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one invoice is required';
  END IF;

  IF array_length(p_invoice_ids, 1) <> array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must have the same length';
  END IF;

  FOR v_index IN 1 .. array_length(p_invoice_ids, 1) LOOP
    SELECT id, organization_id, vendor_id, status, payment_status, ap_routing_destination
      INTO v_invoice
      FROM public.invoices
     WHERE id = p_invoice_ids[v_index]
     FOR UPDATE;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_ids[v_index];
    END IF;

    IF v_index = 1 THEN
      v_organization_id := v_invoice.organization_id;
      PERFORM public.assert_financial_actor(v_organization_id);

      SELECT organization_id
        INTO v_account_org
      FROM public.payment_accounts
      WHERE id = p_payment_account_id
        AND is_active IS DISTINCT FROM false;

      IF v_account_org IS NULL OR v_account_org IS DISTINCT FROM v_organization_id THEN
        RAISE EXCEPTION 'Payment account does not belong to the invoice organization';
      END IF;
    ELSIF v_invoice.organization_id IS DISTINCT FROM v_organization_id THEN
      RAISE EXCEPTION 'All selected invoices must belong to the same organization';
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
    v_organization_id,
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
