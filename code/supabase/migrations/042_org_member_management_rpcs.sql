-- ============================================================
-- Migration 042: Org Member Management RPCs
-- ============================================================

-- 1. org_remove_member
-- Allows an org_owner to safely remove a user from their organization.
CREATE OR REPLACE FUNCTION public.org_remove_member(
    target_user_id UUID,
    target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  active_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := COALESCE(target_org_id, public.get_auth_org());

  IF caller_role != 'org_owner' AND caller_role != 'platform_admin' THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can remove users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Remove from organization_members
  DELETE FROM public.organization_members 
  WHERE user_id = target_user_id AND organization_id = caller_org;
  
  -- Remove from brand_members for this org
  DELETE FROM public.brand_members 
  WHERE user_id = target_user_id 
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);
    
  -- Remove from location_members for this org
  DELETE FROM public.location_members 
  WHERE user_id = target_user_id 
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  -- Update profiles if this was their active org
  UPDATE public.profiles 
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  -- Update app_metadata if this is their active context
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 2. Update admin_update_user_role to support signing_privileges
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT         DEFAULT NULL,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL,
  new_signing_privileges JSONB   DEFAULT NULL
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
  
  -- Update membership tables
  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (target_org, target_user_id, new_role)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role               = COALESCE(new_role, role),
      status             = COALESCE(new_status, status),
      department         = COALESCE(new_department, department),
      permissions        = COALESCE(new_permissions, permissions),
      signing_privileges = COALESCE(new_signing_privileges, signing_privileges),
      brand_id           = COALESCE(new_brand_id, brand_id),
      location_id        = COALESCE(new_location_id, location_id),
      access_level       = COALESCE(new_access_level, access_level),
      updated_at         = now()
  WHERE id = target_user_id;

  -- Only update app_metadata if this is their ACTIVE org
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
      )
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
