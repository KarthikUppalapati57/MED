BEGIN;

-- update_vendor_metrics_on_invoice only ever recognized status='approved' as the "counts toward
-- total_spent" state. normalize_invoice_ap_state (added later) force-rewrites NEW.status to
-- 'paid' whenever payment_status becomes 'paid', in the SAME update statement -- so paying an
-- approved invoice makes this trigger see OLD.status='approved', NEW.status='paid' and treat it
-- as a REVERSAL (invoice rejected/flagged), incorrectly backing total_spent out to zero on the
-- vendor. A paid invoice is still money spent; it should never have left the "spent" bucket.
-- Confirmed live: vendor_metrics_reversal_acceptance.sql's approve-then-pay assertion failed
-- with total_spent=0 instead of the expected 500 before this fix.
CREATE OR REPLACE FUNCTION public.update_vendor_metrics_on_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Entering the "spent" lifecycle (approved or paid -- normalize_invoice_ap_state can jump an
  -- update straight from approved to paid in the same statement, so NEW.status may already be
  -- 'paid' the first time this invoice is ever seen as spent).
  IF NEW.status IN ('approved', 'paid') AND (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'paid')) THEN
    UPDATE public.vendors
    SET total_spent = total_spent + NEW.total_amount,
        unpaid_ap = unpaid_ap + NEW.total_amount
    WHERE id = NEW.vendor_id;
  END IF;

  -- Leaving the "spent" lifecycle entirely (rejected/flagged/reverted -- NOT just moving between
  -- approved and paid) while not soft-deleted: back out total spend, and back out unpaid_ap too
  -- if it hadn't already been paid off.
  IF OLD.status IN ('approved', 'paid') AND NEW.status NOT IN ('approved', 'paid') AND NEW.deleted_at IS NULL THEN
    UPDATE public.vendors
    SET total_spent = GREATEST(total_spent - OLD.total_amount, 0),
        unpaid_ap = CASE WHEN OLD.payment_status IS DISTINCT FROM 'paid'
                          THEN GREATEST(unpaid_ap - OLD.total_amount, 0)
                          ELSE unpaid_ap END
    WHERE id = OLD.vendor_id;
  END IF;

  -- Entering paid: remove from outstanding AP.
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
    UPDATE public.vendors
    SET unpaid_ap = GREATEST(unpaid_ap - NEW.total_amount, 0)
    WHERE id = NEW.vendor_id;
  END IF;

  -- Payment reversed on a still-approved-or-paid invoice: it's outstanding again.
  IF OLD.payment_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid'
     AND NEW.status IN ('approved', 'paid') AND NEW.deleted_at IS NULL THEN
    UPDATE public.vendors
    SET unpaid_ap = unpaid_ap + NEW.total_amount
    WHERE id = NEW.vendor_id;
  END IF;

  -- Soft-deleting an approved-or-paid invoice: back out the same as leaving that lifecycle.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND OLD.status IN ('approved', 'paid') THEN
    UPDATE public.vendors
    SET total_spent = GREATEST(total_spent - OLD.total_amount, 0),
        unpaid_ap = CASE WHEN OLD.payment_status IS DISTINCT FROM 'paid'
                          THEN GREATEST(unpaid_ap - OLD.total_amount, 0)
                          ELSE unpaid_ap END
    WHERE id = OLD.vendor_id;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
