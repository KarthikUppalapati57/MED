-- ============================================================
-- MECURSOR: Strict RLS Policies for User Management & Invitations
-- Migration Script — Run this in Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Drop old general (too broad) policies
-- ============================================================

-- profiles: drop overly broad policies
DROP POLICY IF EXISTS "Profile_Org_Visibility" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Self_Access" ON public.profiles;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.profiles;

-- invitations: drop overly broad tenant isolation
DROP POLICY IF EXISTS "Tenant_Isolation_invitations" ON public.invitations;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.invitations;

-- organizations: drop and recreate
DROP POLICY IF EXISTS "Org_Self_Access" ON public.organizations;
DROP POLICY IF EXISTS "Platform_Admin_Full" ON public.organizations;


-- ============================================================
-- STEP 2: New Strict Policies — profiles (9 policies)
-- ============================================================

-- 1. Platform admin: full access (SaaS support)
CREATE POLICY "profiles_platform_admin_full"
  ON public.profiles FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. Self: read own profile
CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- 3. Self: update own profile
CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Org owner: see all profiles in their org (including co-owners)
CREATE POLICY "profiles_org_owner_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 5. Org owner: update any profile in their org
CREATE POLICY "profiles_org_owner_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  )
  WITH CHECK (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 6. Branch manager: see profiles in their brand(s)
CREATE POLICY "profiles_branch_manager_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
  );

-- 7. Branch manager: update lower-role profiles in their brand(s)
CREATE POLICY "profiles_branch_manager_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
    AND role IN ('location_manager', 'ground_staff')
  )
  WITH CHECK (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
    AND role IN ('location_manager', 'ground_staff')
  );

-- 8. Location manager: see profiles at their location(s)
CREATE POLICY "profiles_location_manager_select"
  ON public.profiles FOR SELECT
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
  );

-- 9. Location manager: update ground_staff at their location(s)
CREATE POLICY "profiles_location_manager_update"
  ON public.profiles FOR UPDATE
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
    AND role = 'ground_staff'
  )
  WITH CHECK (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
    AND role = 'ground_staff'
  );

-- 10. Org owner: soft-delete (deactivate) users in their org
CREATE POLICY "profiles_org_owner_delete"
  ON public.profiles FOR DELETE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
    AND id != auth.uid()  -- cannot delete self
  );


-- ============================================================
-- STEP 3: New Strict Policies — invitations (7 policies)
-- ============================================================

-- 1. Platform admin: full access (SaaS support)
CREATE POLICY "invitations_platform_admin_full"
  ON public.invitations FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. Org owner: see all invitations in their org
CREATE POLICY "invitations_org_owner_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );

-- 3. Branch manager: see invitations for their brand(s)
CREATE POLICY "invitations_branch_manager_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'branch_manager'
    AND organization_id = get_auth_org()
    AND brand_id IN (SELECT get_my_accessible_brand_ids())
  );

-- 4. Location manager: see invitations for their location(s)
CREATE POLICY "invitations_location_manager_select"
  ON public.invitations FOR SELECT
  USING (
    get_auth_role() = 'location_manager'
    AND organization_id = get_auth_org()
    AND location_id IN (SELECT get_my_accessible_location_ids())
  );

-- 5. Insert: role-checked invitation creation
--    Uses can_invite_role() to enforce hierarchy
--    Ground staff cannot invite anyone
CREATE POLICY "invitations_create_with_role_check"
  ON public.invitations FOR INSERT
  WITH CHECK (
    organization_id = get_auth_org()
    AND can_invite_role(role)
    AND get_auth_role() != 'ground_staff'
  );

-- 6. Delete (cancel): creator or org_owner can cancel
CREATE POLICY "invitations_cancel_own"
  ON public.invitations FOR DELETE
  USING (
    organization_id = get_auth_org()
    AND (
      invited_by = auth.uid()
      OR get_auth_role() = 'org_owner'
    )
  );

-- 7. Update: org_owner can update invitation details
CREATE POLICY "invitations_org_owner_update"
  ON public.invitations FOR UPDATE
  USING (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  )
  WITH CHECK (
    get_auth_role() = 'org_owner'
    AND organization_id = get_auth_org()
  );


-- ============================================================
-- STEP 4: New Strict Policies — organizations (3 policies)
-- ============================================================

-- 1. Platform admin: full access (SaaS support/billing)
CREATE POLICY "organizations_platform_admin_full"
  ON public.organizations FOR ALL
  USING (get_auth_role() = 'platform_admin');

-- 2. All org members: read their own org
CREATE POLICY "organizations_member_select"
  ON public.organizations FOR SELECT
  USING (id = get_auth_org());

-- 3. Org owner only: update their org settings
CREATE POLICY "organizations_owner_update"
  ON public.organizations FOR UPDATE
  USING (
    id = get_auth_org()
    AND get_auth_role() = 'org_owner'
  )
  WITH CHECK (
    id = get_auth_org()
    AND get_auth_role() = 'org_owner'
  );

COMMIT;
