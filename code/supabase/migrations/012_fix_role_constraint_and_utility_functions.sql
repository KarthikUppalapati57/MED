-- ============================================================
-- 012: Fix Role Constraint + Create Missing Utility Functions
-- ============================================================
-- Fixes:
--   [SYNC REPORT #1] Role constraint uses old names (manager/owner/admin)
--   [SYNC REPORT #2] Missing get_my_accessible_brand_ids(), get_my_accessible_location_ids(), can_invite_role()
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Fix the profiles role constraint
-- The old constraint allowed: ground_staff, manager, owner, admin, platform_admin
-- The frontend now uses: ground_staff, location_manager, branch_manager, org_owner, platform_admin
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'ground_staff',
    'location_manager',
    'branch_manager',
    'org_owner',
    'platform_admin'
  ));

-- Also ensure all necessary profile columns exist for the RPC functions
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signing_privileges JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'location'
  CHECK (access_level IN ('platform', 'organization', 'brand', 'location'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;


-- ────────────────────────────────────────────────────────────
-- STEP 2: Create can_invite_role(target_role TEXT)
-- Returns TRUE if the caller's role is strictly above the target role.
-- Used in the invitations INSERT policy to prevent privilege escalation.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_invite_role(target_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  caller_level INT;
  target_level INT;
BEGIN
  caller_level := CASE public.get_auth_role()
    WHEN 'platform_admin'    THEN 4
    WHEN 'org_owner'         THEN 3
    WHEN 'branch_manager'    THEN 2
    WHEN 'location_manager'  THEN 1
    WHEN 'ground_staff'      THEN 0
    ELSE 0
  END;

  target_level := CASE target_role
    WHEN 'platform_admin'    THEN 4
    WHEN 'org_owner'         THEN 3
    WHEN 'branch_manager'    THEN 2
    WHEN 'location_manager'  THEN 1
    WHEN 'ground_staff'      THEN 0
    ELSE 0
  END;

  -- Can only invite roles STRICTLY below your own level
  RETURN caller_level > target_level;
END;
$$;

COMMENT ON FUNCTION public.can_invite_role(TEXT) IS
  'Returns TRUE if the authenticated user''s role is above the given target_role. Used in RLS policies to prevent privilege escalation on invitations.';


-- ────────────────────────────────────────────────────────────
-- STEP 3: Create get_my_accessible_brand_ids()
-- Returns the set of brand UUIDs the caller is allowed to see.
--   platform_admin / org_owner → all brands in their org
--   branch_manager             → only their assigned brand
--   everyone else              → empty set
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_accessible_brand_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT b.id
  FROM public.brands b
  WHERE b.organization_id = public.get_auth_org()
    AND (
      -- org_owner and platform_admin see all brands in the org
      public.get_auth_role() IN ('platform_admin', 'org_owner')
      OR (
        -- branch_manager sees only their assigned brand
        public.get_auth_role() = 'branch_manager'
        AND b.id = (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
      )
    );
$$;

COMMENT ON FUNCTION public.get_my_accessible_brand_ids() IS
  'Returns brand IDs the caller can access. org_owner/platform_admin get all org brands; branch_manager gets their assigned brand.';


-- ────────────────────────────────────────────────────────────
-- STEP 4: Create get_my_accessible_location_ids()
-- Returns the set of location UUIDs the caller is allowed to see.
--   platform_admin / org_owner → all locations in their org
--   branch_manager             → all locations under their brand(s)
--   location_manager           → only their assigned location
--   everyone else              → empty set
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_accessible_location_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT l.id
  FROM public.locations l
  WHERE l.organization_id = public.get_auth_org()
    AND (
      -- org_owner and platform_admin see all locations in the org
      public.get_auth_role() IN ('platform_admin', 'org_owner')
      OR (
        -- branch_manager sees locations under their accessible brands
        public.get_auth_role() = 'branch_manager'
        AND l.brand_id IN (SELECT public.get_my_accessible_brand_ids())
      )
      OR (
        -- location_manager sees only their assigned location
        public.get_auth_role() = 'location_manager'
        AND l.id = (SELECT p.location_id FROM public.profiles p WHERE p.id = auth.uid())
      )
    );
$$;

COMMENT ON FUNCTION public.get_my_accessible_location_ids() IS
  'Returns location IDs the caller can access. Cascades from org → brand → location based on role.';


COMMIT;
