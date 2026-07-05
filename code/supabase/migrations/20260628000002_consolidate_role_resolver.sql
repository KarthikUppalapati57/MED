BEGIN;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'ground_staff');
$$;

COMMIT;