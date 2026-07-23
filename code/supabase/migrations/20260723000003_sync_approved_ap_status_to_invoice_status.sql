-- 20260723000003: Sync approved AP status back to invoice status
--
-- Payments depends on invoices.status for payable actions. If an approval workflow
-- advances ap_status to approved but leaves status at pending_approval/validated,
-- the invoice still appears as pending and cannot be paid or scheduled.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_invoice_ap_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ap_status = 'approved'
    AND COALESCE(NEW.status, 'processing') IN ('processing', 'pending_review', 'validated', 'pending_approval', 'flagged') THEN
    NEW.status := 'approved';
  ELSIF NEW.ap_status = 'scheduled'
    AND COALESCE(NEW.status, 'processing') IN ('processing', 'pending_review', 'validated', 'pending_approval', 'approved') THEN
    NEW.status := 'scheduled';
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.ap_status := 'approved';
  ELSIF NEW.status = 'scheduled' THEN
    NEW.ap_status := 'scheduled';
  ELSIF NEW.status = 'paid' THEN
    NEW.ap_status := 'paid';
    NEW.payment_status := 'paid';
  ELSIF NEW.status = 'rejected' THEN
    IF COALESCE(NEW.payment_status, 'unpaid') IN ('partial', 'paid', 'auto_pay', 'processing')
      OR COALESCE(NEW.paid_amount, 0) > 0 THEN
      RAISE EXCEPTION 'Rejected invoices cannot carry paid or in-flight payment state';
    END IF;
    NEW.ap_status := 'rejected';
  END IF;

  IF NEW.payment_status = 'paid'
    AND NEW.status <> 'extracting' THEN
    NEW.status := 'paid';
    NEW.ap_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.invoices
   SET status = 'approved',
       approved_date = COALESCE(approved_date, now()),
       updated_at = now()
 WHERE ap_status = 'approved'
   AND status IN ('processing', 'pending_review', 'validated', 'pending_approval', 'flagged')
   AND deleted_at IS NULL;

COMMIT;
