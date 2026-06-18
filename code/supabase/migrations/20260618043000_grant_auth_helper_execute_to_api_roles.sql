-- Allow RLS policies that call JWT helper functions to evaluate for API roles.
-- These helpers only read auth.jwt() claims; for anon requests they resolve to
-- null/default values and should not raise permission errors during policy checks.

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO anon, authenticated, service_role;

COMMIT;
