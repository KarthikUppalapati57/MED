-- Allow location-scoped users to pass brand scope checks for their assigned location.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_accessible_brand_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  -- Org/platform roles and branch-level profile assignments.
  SELECT b.brand_id
  FROM public.brands b
  WHERE b.organization_id = public.get_auth_org()
    AND (
      public.get_auth_role() IN ('platform_admin', 'org_owner')
      OR (
        public.get_auth_role() = 'branch_manager'
        AND b.brand_id = (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  UNION
  -- Location managers inherit the brand for their assigned location.
  SELECT l.brand_id
  FROM public.locations l
  INNER JOIN public.profiles p ON p.location_id = l.id
  WHERE p.id = auth.uid()
    AND p.organization_id = public.get_auth_org()
    AND p.role = 'location_manager'
  UNION
  -- Explicit location access from user_roles grants access to the parent brand.
  SELECT l.brand_id
  FROM public.locations l
  INNER JOIN public.user_roles ur ON ur.location_id = l.id
  WHERE ur.user_id = auth.uid()
    AND ur.organization_id = public.get_auth_org()
  UNION
  -- Org-wide user_roles rows can see every brand in the organization.
  SELECT b.brand_id
  FROM public.brands b
  INNER JOIN public.user_roles ur ON ur.organization_id = b.organization_id
  WHERE ur.user_id = auth.uid()
    AND ur.organization_id = public.get_auth_org()
    AND ur.location_id IS NULL;
$$;

COMMENT ON FUNCTION public.get_my_accessible_brand_ids() IS
  'Returns brand IDs the caller can access via profile scope or user_roles assignments.';

COMMIT;
