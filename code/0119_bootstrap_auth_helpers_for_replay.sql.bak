-- Bootstrap auth helpers before 012 creates functions that reference them.
-- 014 re-applies the same canonical definitions and privilege hardening later.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'ground_staff');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

COMMIT;
