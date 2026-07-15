BEGIN;

-- update_vendor_metrics_on_invoice (127_vendor_command_center.sql) only ever added to
-- vendors.total_spent/unpaid_ap when an invoice entered approved/paid. It never reversed
-- either figure when an invoice left those states (rejected/flagged/reverted) or was
-- soft-deleted while approved, so total_spent/unpaid_ap drift permanently out of sync
-- with reality over time.
CREATE OR REPLACE FUNCTION public.update_vendor_metrics_on_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- Entering approved: add to total spend and outstanding AP.
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.vendors
    SET total_spent = total_spent + NEW.total_amount,
        unpaid_ap = unpaid_ap + NEW.total_amount
    WHERE id = NEW.vendor_id;
  END IF;

  -- Leaving approved (rejected/flagged/reverted) while not soft-deleted: back out total spend,
  -- and back out unpaid_ap too if it hadn't already been paid off.
  IF OLD.status = 'approved' AND NEW.status IS DISTINCT FROM 'approved' AND NEW.deleted_at IS NULL THEN
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

  -- Payment reversed on a still-approved invoice: it's outstanding again.
  IF OLD.payment_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid'
     AND NEW.status = 'approved' AND NEW.deleted_at IS NULL THEN
    UPDATE public.vendors
    SET unpaid_ap = unpaid_ap + NEW.total_amount
    WHERE id = NEW.vendor_id;
  END IF;

  -- Soft-deleting an approved invoice: back out the same as leaving approved.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND OLD.status = 'approved' THEN
    UPDATE public.vendors
    SET total_spent = GREATEST(total_spent - OLD.total_amount, 0),
        unpaid_ap = CASE WHEN OLD.payment_status IS DISTINCT FROM 'paid'
                          THEN GREATEST(unpaid_ap - OLD.total_amount, 0)
                          ELSE unpaid_ap END
    WHERE id = OLD.vendor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
