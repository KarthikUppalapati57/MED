-- 20260726193000: Invoice validation is an approval warning, not a hard blocker.
-- Validation failures should be surfaced to users and recorded, but authorized
-- reviewers may approve after acknowledgement/notes. Payment and immutable-field
-- locks remain enforced by separate triggers/RPCs.

BEGIN;

DROP TRIGGER IF EXISTS enforce_invoice_validation_before_approval ON public.invoices;
DROP FUNCTION IF EXISTS public.enforce_invoice_validation_before_approval();

CREATE OR REPLACE FUNCTION public.record_invoice_validation_state_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failures text[];
BEGIN
  IF COALESCE(NEW.status, '') NOT IN ('pending_approval', 'approved')
     AND COALESCE(NEW.ap_status, '') NOT IN ('pending_approval', 'approved') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '')
     AND COALESCE(OLD.ap_status, '') = COALESCE(NEW.ap_status, '') THEN
    RETURN NEW;
  END IF;

  v_failures := public.invoice_hard_validation_failures(NEW.id);

  NEW.validation_results := COALESCE(NEW.validation_results, '{}'::jsonb)
    || jsonb_build_object(
      'approval_validation_checked_at', now(),
      'approval_validation_failures', to_jsonb(v_failures),
      'approval_validation_acknowledgement_required', COALESCE(array_length(v_failures, 1), 0) > 0
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_invoice_validation_state_on_approval ON public.invoices;
CREATE TRIGGER record_invoice_validation_state_on_approval
BEFORE INSERT OR UPDATE OF status, ap_status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.record_invoice_validation_state_on_approval();

COMMIT;

NOTIFY pgrst, 'reload schema';