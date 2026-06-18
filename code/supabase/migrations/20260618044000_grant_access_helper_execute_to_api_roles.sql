-- Allow RLS policies that call scoped access helper functions to evaluate
-- for API roles. For anon requests these helpers return empty sets because
-- get_auth_org()/get_auth_role() have no privileged JWT claims.

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO anon, authenticated, service_role;

COMMIT;
