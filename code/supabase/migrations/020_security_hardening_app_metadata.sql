-- ============================================================
-- 020: Security Hardening - Migrate to app_metadata
-- ============================================================
-- Fixes critical vulnerability where frontend clients could
-- self-escalate privileges by editing their user_metadata.
-- We move all sensitive RLS claims to app_metadata.
-- ============================================================

BEGIN;

-- 1. DATA MIGRATION: Copy existing claims from user_metadata to app_metadata
-- This ensures no existing users are locked out.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
        'role', raw_user_meta_data->>'role',
        'organization_id', raw_user_meta_data->>'organization_id'
    )
WHERE raw_user_meta_data ? 'role' OR raw_user_meta_data ? 'organization_id';

-- 2. UPDATE JWT HELPERS TO READ FROM app_metadata
CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'ground_staff');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_org() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. UPDATE setup_organization_full RPC to write to app_metadata
CREATE OR REPLACE FUNCTION public.setup_organization_full(
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
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  UPDATE public.profiles
  SET organization_id = v_org_id,
      brand_id        = v_brand_id,
      location_id     = v_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      updated_at      = now()
  WHERE id = p_user_id;

  -- Use raw_app_meta_data
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

-- 4. UPDATE accept_invitation RPC to write to app_metadata
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
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

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND LOWER(email) = LOWER(v_user_email);

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      updated_at      = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  -- Use raw_app_meta_data
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

-- 5. UPDATE admin_update_user_role RPC to write to app_metadata
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
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

  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;

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

  -- Use raw_app_meta_data
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
  )
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Re-promote admin account (ensuring it works with app_metadata)
DO $$
DECLARE
    target_uid UUID;
BEGIN
    SELECT id INTO target_uid FROM auth.users WHERE email = 'uppalapatisivasaipavankarthik@gmail.com' LIMIT 1;
    
    IF target_uid IS NOT NULL THEN
        -- Sync Profile
        INSERT INTO public.profiles (id, email, role)
        VALUES (target_uid, 'uppalapatisivasaipavankarthik@gmail.com', 'platform_admin')
        ON CONFLICT (id) DO UPDATE SET role = 'platform_admin';
        
        -- Sync JWT App Metadata
        UPDATE auth.users 
        SET raw_app_meta_data = 
            COALESCE(raw_app_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'platform_admin')
        WHERE id = target_uid;
    END IF;
END $$;

COMMIT;
