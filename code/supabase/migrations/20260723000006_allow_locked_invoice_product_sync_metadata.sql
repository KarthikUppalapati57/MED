-- 20260723000006: Allow product-sync metadata on locked invoice line items.
--
-- Invoice approval locks financial line-item data, but sync_invoice_products must
-- still be able to attach product/vendor mapping metadata for invoices that were
-- approved before sync completed. Keep INSERT/DELETE and money/quantity/name edits
-- blocked after approval/payment activity; allow UPDATEs that only change product
-- sync metadata columns.

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
  v_old_protected jsonb;
  v_new_protected jsonb;
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

    IF TG_OP = 'UPDATE' THEN
      v_old_protected := to_jsonb(OLD)
        - 'vendor_id'
        - 'vendor_item_id'
        - 'internal_product_id'
        - 'price_variance_flag'
        - 'price_variance_percent'
        - 'updated_at';

      v_new_protected := to_jsonb(NEW)
        - 'vendor_id'
        - 'vendor_item_id'
        - 'internal_product_id'
        - 'price_variance_flag'
        - 'price_variance_percent'
        - 'updated_at';

      IF v_new_protected = v_old_protected THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Invoice line items are immutable after approval or payment activity';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_locked_invoice_line_items ON public.invoice_line_items;
CREATE TRIGGER guard_locked_invoice_line_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_locked_invoice_line_items();

COMMIT;