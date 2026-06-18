-- Migration 133: Harden RLS Location Access
-- Extends the get_my_accessible_location_ids and get_my_accessible_brand_ids 
-- to explicitly read from the user_roles table, securing data visibility for custom roles.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_accessible_brand_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  -- 1. Base access from legacy profiles.role
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
  -- 2. Location-based brand access from user_roles
  SELECT l.brand_id
  FROM public.locations l
  INNER JOIN public.user_roles ur ON ur.location_id = l.id
  WHERE ur.user_id = auth.uid() AND ur.organization_id = public.get_auth_org()
  UNION
  -- 3. Org-wide access from user_roles (when location_id IS NULL)
  SELECT b.brand_id
  FROM public.brands b
  INNER JOIN public.user_roles ur ON ur.organization_id = b.organization_id
  WHERE ur.user_id = auth.uid() 
    AND ur.organization_id = public.get_auth_org() 
    AND ur.location_id IS NULL;
$$;

COMMENT ON FUNCTION public.get_my_accessible_brand_ids() IS
  'Returns brand IDs the caller can access via profiles or user_roles assignments.';


CREATE OR REPLACE FUNCTION public.get_my_accessible_location_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  -- 1. Base access from legacy profiles.role
  SELECT l.id
  FROM public.locations l
  WHERE l.organization_id = public.get_auth_org()
    AND (
      public.get_auth_role() IN ('platform_admin', 'org_owner')
      OR (
        public.get_auth_role() = 'branch_manager'
        AND l.brand_id IN (
          SELECT b.brand_id FROM public.brands b WHERE b.brand_id = (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
      OR (
        public.get_auth_role() = 'location_manager'
        AND l.id = (SELECT p.location_id FROM public.profiles p WHERE p.id = auth.uid())
      )
    )
  UNION
  -- 2. Explicit location access from user_roles
  SELECT ur.location_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() 
    AND ur.organization_id = public.get_auth_org() 
    AND ur.location_id IS NOT NULL
  UNION
  -- 3. Org-wide access from user_roles (when location_id IS NULL)
  SELECT l.id
  FROM public.locations l
  INNER JOIN public.user_roles ur ON ur.organization_id = l.organization_id
  WHERE ur.user_id = auth.uid() 
    AND ur.organization_id = public.get_auth_org() 
    AND ur.location_id IS NULL;
$$;

COMMENT ON FUNCTION public.get_my_accessible_location_ids() IS
  'Returns location IDs the caller can access via profiles or user_roles assignments.';

COMMIT;
