BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_ledger_bill_workflow(
  p_invoice_id UUID,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_bill RECORD;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_org_actor(v_invoice.organization_id);

  SELECT *
    INTO v_bill
  FROM public.ledger_bills
  WHERE invoice_id = v_invoice.id
    AND organization_id = v_invoice.organization_id
    AND deleted_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_bill.id IS NOT NULL THEN
    UPDATE public.ledger_bills
       SET vendor_id = v_invoice.vendor_id,
           subtotal = COALESCE(v_invoice.subtotal, 0),
           tax = COALESCE(v_invoice.tax_amount, 0),
           total = COALESCE(v_invoice.total_amount, 0),
           due_date = v_invoice.due_date,
           status = CASE WHEN v_bill.status = 'paid' THEN 'paid' ELSE COALESCE(p_status, 'pending') END,
           updated_at = now()
     WHERE id = v_bill.id
     RETURNING * INTO v_bill;
  ELSE
    INSERT INTO public.ledger_bills (
      organization_id,
      vendor_id,
      invoice_id,
      subtotal,
      tax,
      total,
      due_date,
      status
    ) VALUES (
      v_invoice.organization_id,
      v_invoice.vendor_id,
      v_invoice.id,
      COALESCE(v_invoice.subtotal, 0),
      COALESCE(v_invoice.tax_amount, 0),
      COALESCE(v_invoice.total_amount, 0),
      v_invoice.due_date,
      COALESCE(p_status, 'pending')
    )
    RETURNING * INTO v_bill;
  END IF;

  RETURN to_jsonb(v_bill);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_payment_workflow(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  SELECT *
    INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  PERFORM public.assert_financial_actor(v_payment.organization_id);

  UPDATE public.payments
     SET status = 'completed',
         updated_at = now()
   WHERE id = p_payment_id
   RETURNING * INTO v_payment;

  RETURN to_jsonb(v_payment);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_ledger_bill_workflow(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_payment_workflow(UUID) TO authenticated, service_role;

COMMIT;
