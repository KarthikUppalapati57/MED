BEGIN;

CREATE OR REPLACE FUNCTION public.guard_locked_invoice_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status, '') NOT IN ('extracting', 'extract_failed')
    AND (
      OLD.status IN ('approved', 'scheduled', 'partially_paid', 'paid')
      OR OLD.ap_status IN ('approved', 'scheduled', 'paid', 'closed')
      OR COALESCE(OLD.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay')
      OR COALESCE(OLD.paid_amount, 0) > 0
    ) THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
      OR NEW.vendor_name IS DISTINCT FROM OLD.vendor_name
      OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
      OR NEW.fuel_surcharge IS DISTINCT FROM OLD.fuel_surcharge
      OR NEW.other_charges IS DISTINCT FROM OLD.other_charges
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.account_number IS DISTINCT FROM OLD.account_number
      OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
      OR NEW.line_items IS DISTINCT FROM OLD.line_items THEN
      RAISE EXCEPTION 'Approved, scheduled, partially paid, or paid invoice financial fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
