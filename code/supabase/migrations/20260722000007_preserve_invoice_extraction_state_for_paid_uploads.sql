BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_invoice_ap_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
     AND COALESCE(NEW.status, '') NOT IN ('extracting', 'extract_failed') THEN
    NEW.status := 'paid';
    NEW.ap_status := 'paid';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
