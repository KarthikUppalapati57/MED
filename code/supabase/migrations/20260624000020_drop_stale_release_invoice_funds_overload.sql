BEGIN;

-- The current payout RPC contract is release_invoice_funds(uuid, text, uuid).
-- Drop the older two-argument overload so lint and PostgREST resolution do not
-- keep a stale implementation with an unused v_org_id variable.
DROP FUNCTION IF EXISTS public.release_invoice_funds(UUID, TEXT);

COMMIT;
