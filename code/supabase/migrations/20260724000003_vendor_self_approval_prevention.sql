BEGIN;

-- Mirrors enforce_invoice_approval_authorization's existing "submitters cannot approve their
-- own invoices" rule (already live for invoices) -- vendors never got the same rule, so whoever
-- created a vendor could also approve it themselves. Scoped to entering 'approved' specifically,
-- same as the invoice version: rejecting/suspending your own submission isn't a self-approval
-- concern, only approving it is.
CREATE OR REPLACE FUNCTION public.enforce_vendor_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('pending_approval', 'approved', 'suspended', 'rejected') THEN
      IF NEW.approval_status = 'approved' AND NEW.created_by IS NOT NULL AND NEW.created_by = auth.uid() THEN
        RAISE EXCEPTION 'Vendor submitters cannot approve their own vendors';
      END IF;

      PERFORM public.assert_can_approve_vendor_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'approved' AND NEW.created_by IS NOT NULL AND NEW.created_by = auth.uid() THEN
      RAISE EXCEPTION 'Vendor submitters cannot approve their own vendors';
    END IF;

    PERFORM public.assert_can_approve_vendor_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
