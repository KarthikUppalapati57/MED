-- ============================================================
-- 013: Version-Control Critical RPC Functions
-- ============================================================
-- Fixes:
--   [SYNC REPORT #4] setup_organization_full, accept_invitation,
--   admin_update_user_role are called by the frontend but have
--   NO SQL definition tracked in the repository.
--
-- NOTE: We must DROP existing functions first because old versions
--       may have different signatures (e.g. TEXT vs UUID), and
--       CREATE OR REPLACE cannot change parameter types.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 0: Drop ALL existing overloads of these functions
--
-- CASCADE ensures dependent objects (triggers, policies) that
-- reference these are also dropped. We recreate them below.
-- ────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT) CASCADE;
-- Catch any other signatures
DO $$ BEGIN
  EXECUTE (
    SELECT string_agg(
      format('DROP FUNCTION IF EXISTS %s CASCADE;', oid::regprocedure),
      E'\n'
    )
    FROM pg_proc
    WHERE proname = 'setup_organization_full'
      AND pronamespace = 'public'::regnamespace
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.accept_invitation(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.accept_invitation(TEXT) CASCADE;
-- Catch any other signatures
DO $$ BEGIN
  EXECUTE (
    SELECT string_agg(
      format('DROP FUNCTION IF EXISTS %s CASCADE;', oid::regprocedure),
      E'\n'
    )
    FROM pg_proc
    WHERE proname = 'accept_invitation'
      AND pronamespace = 'public'::regnamespace
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT) CASCADE;
-- Catch any other signatures
DO $$ BEGIN
  EXECUTE (
    SELECT string_agg(
      format('DROP FUNCTION IF EXISTS %s CASCADE;', oid::regprocedure),
      E'\n'
    )
    FROM pg_proc
    WHERE proname = 'admin_update_user_role'
      AND pronamespace = 'public'::regnamespace
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Also drop complete_onboarding if it exists (legacy name)
DROP FUNCTION IF EXISTS public.complete_onboarding() CASCADE;
DROP FUNCTION IF EXISTS public.complete_onboarding(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.complete_onboarding(UUID, TEXT) CASCADE;


-- ────────────────────────────────────────────────────────────
-- RPC 1: setup_organization_full
--
-- Called by: apiClient.js → api.onboarding.setupOrgAndFirstLocation()
-- Purpose:  Atomic onboarding — creates org, brand, location, and
--           assigns the user as org_owner in a single transaction.
-- ────────────────────────────────────────────────────────────

CREATE FUNCTION public.setup_organization_full(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_brand_name TEXT,
  p_location_name TEXT,
  p_location_address TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
BEGIN
  -- Verify the caller IS the user being onboarded (or a platform admin)
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  -- 1. Create the organization
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  -- 2. Create the first brand
  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING id INTO v_brand_id;

  -- 3. Create the first location
  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  -- 4. Assign user as org_owner with full hierarchy
  UPDATE public.profiles
  SET organization_id = v_org_id,
      brand_id        = v_brand_id,
      location_id     = v_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      updated_at      = now()
  WHERE id = p_user_id;

  -- 5. Sync auth JWT metadata so RLS policies work immediately
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'org_owner',
    'organization_id', v_org_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'org_id',      v_org_id,
    'brand_id',    v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

COMMENT ON FUNCTION public.setup_organization_full IS
  'Atomic onboarding: creates org → brand → location → assigns user as org_owner. Called from OnboardingPage.';


-- ────────────────────────────────────────────────────────────
-- RPC 2: accept_invitation
--
-- Called by: apiClient.js → api.onboarding.acceptInvitation()
-- Purpose:  Accepts a pending invitation, assigns the user their
--           invited role/org/brand/location, and syncs JWT metadata.
--
-- NOTE: Uses TEXT for p_token because the invitation token may be
--       stored as TEXT or UUID in the DB, and the frontend passes
--       it as a string from URL params.
-- ────────────────────────────────────────────────────────────

CREATE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the caller's email
  SELECT email INTO v_user_email
  FROM auth.users WHERE id = v_user_id;

  -- Find the matching pending invitation
  -- Cast p_token to match the column type (works for both TEXT and UUID columns)
  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND LOWER(email) = LOWER(v_user_email);

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  -- Update user's profile with the invitation assignment
  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      updated_at      = now()
  WHERE id = v_user_id;

  -- Mark invitation as accepted
  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  -- Sync auth JWT metadata
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_invite.role,
    'organization_id', v_invite.organization_id::text
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'role',            v_invite.role,
    'organization_id', v_invite.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.accept_invitation IS
  'Accepts a pending invitation by token. Assigns the user their invited role/org/brand/location and syncs JWT metadata.';


-- ────────────────────────────────────────────────────────────
-- RPC 3: admin_update_user_role
--
-- Called by: apiClient.js → api.admin.updateUserRole()
-- Purpose:  Securely update a user's role and assignment fields.
--           Enforces hierarchy: callers can only assign roles below
--           their own level (preventing privilege escalation).
-- ────────────────────────────────────────────────────────────

CREATE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  target_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := public.get_auth_org();

  -- Permission gate: only org_owner+ can modify user roles
  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  -- Get the target user's organization
  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  -- Org owners can only manage users within their own organization
  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  -- Prevent privilege escalation (platform_admin is exempt)
  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  -- Prevent self-demotion for org_owners
  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;

  -- Apply updates (COALESCE preserves existing values when NULL is passed)
  UPDATE public.profiles
  SET role         = COALESCE(new_role, role),
      status       = COALESCE(new_status, status),
      department   = COALESCE(new_department, department),
      permissions  = COALESCE(new_permissions, permissions),
      brand_id     = COALESCE(new_brand_id, brand_id),
      location_id  = COALESCE(new_location_id, location_id),
      access_level = COALESCE(new_access_level, access_level),
      updated_at   = now()
  WHERE id = target_user_id;

  -- Sync auth JWT metadata with the new role
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
  )
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.admin_update_user_role IS
  'Securely updates a user''s role and assignment. Enforces org-scoping and prevents privilege escalation.';


COMMIT;
