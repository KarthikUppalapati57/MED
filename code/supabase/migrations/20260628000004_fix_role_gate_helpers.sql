BEGIN;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN (
    'location_manager',
    'branch_manager',
    'org_owner',
    'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN ('org_owner', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN ('org_owner', 'platform_admin');
$$;

COMMIT;
