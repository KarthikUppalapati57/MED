-- Remove the legacy JSON page-access/signing-authority layer.
-- RBAC remains handled through roles, permissions, role_permissions, org membership,
-- and module enablement.

DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT         DEFAULT NULL,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
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
  IF new_location IS NOT NULL THEN
    -- Location display text is accepted for backward-compatible callers but not stored.
  END IF;

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

  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (target_org, target_user_id, new_role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role             = COALESCE(new_role, role),
      status           = COALESCE(new_status, status),
      department       = COALESCE(new_department, department),
      brand_id         = COALESCE(new_brand_id, brand_id),
      location_id      = COALESCE(new_location_id, location_id),
      access_level     = COALESCE(new_access_level, access_level),
      updated_at       = now()
  WHERE id = target_user_id;

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

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS signing_privileges;

ALTER TABLE public.roles
  DROP COLUMN IF EXISTS default_page_permissions,
  DROP COLUMN IF EXISTS default_signing_privileges;

ALTER TABLE public.invitations
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS page_permissions,
  DROP COLUMN IF EXISTS signing_privileges;
