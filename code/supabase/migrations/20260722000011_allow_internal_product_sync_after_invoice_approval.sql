BEGIN;

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_line_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_invoice_id uuid;
BEGIN
  IF current_setting('app.invoice_product_sync', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status, ap_status, payment_status, paid_amount
    INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
    OR v_invoice.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
    OR COALESCE(v_invoice.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
    OR COALESCE(v_invoice.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Invoice line items are immutable after approval or payment activity';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_invoice_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.invoice_product_sync', '', true);
  RAISE;
END;
$$;

COMMIT;