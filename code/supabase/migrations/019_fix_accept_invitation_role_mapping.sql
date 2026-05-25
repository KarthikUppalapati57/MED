-- ============================================================
-- 019: Fix accept_invitation Role Mapping and Profile Constraints
-- ============================================================

BEGIN;

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
  v_mapped_role TEXT;
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

  -- Map old role names to the new role names to respect profiles_role_check constraints
  v_mapped_role := CASE v_invite.role
    WHEN 'owner'   THEN 'org_owner'
    WHEN 'admin'   THEN 'platform_admin'
    WHEN 'manager' THEN 'branch_manager'
    ELSE v_invite.role
  END;

  -- Update user's profile with the invitation assignment
  UPDATE public.profiles
  SET role            = v_mapped_role,
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
    'role', v_mapped_role,
    'organization_id', v_invite.organization_id::text
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'role',            v_mapped_role,
    'organization_id', v_invite.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.accept_invitation IS
  'Accepts a pending invitation by token. Safely maps old role names to new role names, assigns the user their invited role/org/brand/location, and syncs JWT metadata.';

COMMIT;
