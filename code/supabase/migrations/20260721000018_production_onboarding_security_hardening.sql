-- Production hardening for onboarding security gaps:
-- 1. Lock direct access to hierarchy review submissions behind SECURITY DEFINER RPCs.
-- 2. Remove the temporary contact OTP bypass and fail closed for old clients.
-- 3. Canonicalize the old brand_manager role to branch_manager.
-- 4. Serialize invitation acceptance so a token can only be accepted once.

BEGIN;

ALTER TABLE public.onboarding_hierarchy_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_hierarchy_submissions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.onboarding_hierarchy_submissions FROM public, anon, authenticated;
GRANT ALL ON TABLE public.onboarding_hierarchy_submissions TO service_role;

DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_select ON public.onboarding_hierarchy_submissions;
DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_insert ON public.onboarding_hierarchy_submissions;
DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_update ON public.onboarding_hierarchy_submissions;
DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_delete ON public.onboarding_hierarchy_submissions;

CREATE POLICY onboarding_hierarchy_submissions_no_direct_select
  ON public.onboarding_hierarchy_submissions
  FOR SELECT
  TO authenticated
  USING (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_insert
  ON public.onboarding_hierarchy_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_update
  ON public.onboarding_hierarchy_submissions
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_delete
  ON public.onboarding_hierarchy_submissions
  FOR DELETE
  TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.request_onboarding_contact_dev_otp(
  p_channel text,
  p_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Temporary development contact OTP bypass is disabled in production';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_onboarding_contact_dev_otp(
  p_channel text,
  p_target text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Temporary development contact OTP bypass is disabled in production';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(text, text, text) TO service_role;

UPDATE public.profiles SET role = 'branch_manager' WHERE role = 'brand_manager';
UPDATE public.invitations SET role = 'branch_manager' WHERE role = 'brand_manager';
UPDATE public.organization_members SET role = 'branch_manager' WHERE role = 'brand_manager';
UPDATE public.brand_members SET role = 'branch_manager' WHERE role = 'brand_manager';
UPDATE public.location_members SET role = 'branch_manager' WHERE role = 'brand_manager';
DELETE FROM public.roles
WHERE name = 'brand_manager'
  AND EXISTS (SELECT 1 FROM public.roles WHERE name = 'branch_manager');

UPDATE public.roles SET name = 'branch_manager' WHERE name = 'brand_manager';

CREATE OR REPLACE FUNCTION public.normalize_app_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(NULLIF(trim(p_role), ''))
    WHEN 'owner' THEN 'org_manager'
    WHEN 'org_owner' THEN 'org_manager'
    WHEN 'organization_owner' THEN 'org_manager'
    WHEN 'manager' THEN 'branch_manager'
    WHEN 'brand_manager' THEN 'branch_manager'
    WHEN 'admin' THEN 'platform_admin'
    ELSE lower(NULLIF(trim(p_role), ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN (
    'location_manager',
    'branch_manager',
    'org_manager',
    'tenant_super_admin',
    'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.access_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public.normalize_app_role(p_role)
    WHEN 'ground_staff' THEN 10
    WHEN 'location_manager' THEN 20
    WHEN 'branch_manager' THEN 30
    WHEN 'org_manager' THEN 40
    WHEN 'tenant_super_admin' THEN 50
    WHEN 'platform_admin' THEN 60
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_invite_role(target_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := public.get_auth_role();
  normalized_target text := public.normalize_app_role(target_role);
BEGIN
  IF caller_role = 'platform_admin' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin');
  END IF;

  IF caller_role = 'tenant_super_admin' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin');
  END IF;

  IF caller_role = 'org_manager' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'branch_manager');
  END IF;

  IF caller_role = 'branch_manager' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager');
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_invitation_role_before_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := lower(trim(COALESCE(NEW.role, '')));
  v_role := replace(replace(v_role, '-', '_'), ' ', '_');

  NEW.role := CASE
    WHEN v_role IN ('tenant', 'tenant_admin', 'tenant_superadmin', 'tenant_super_admin') THEN 'tenant_super_admin'
    WHEN v_role IN ('owner', 'org_owner', 'organization_owner') AND NEW.organization_id IS NULL THEN 'tenant_super_admin'
    WHEN v_role IN ('owner', 'org_owner', 'organization_owner', 'org_manager', 'organization_manager') THEN 'org_manager'
    WHEN v_role IN ('brand_manager', 'branch_manager') THEN 'branch_manager'
    WHEN v_role IN ('manager', 'location_manager') THEN 'location_manager'
    WHEN v_role IN ('ground_staff', 'staff') THEN 'ground_staff'
    WHEN v_role IN ('admin', 'platform_admin') THEN 'platform_admin'
    ELSE v_role
  END;

  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('ground_staff', 'location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin')
);

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (
  role IN ('ground_staff', 'location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin')
);

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_invite record;
  v_user_id uuid;
  v_user_email text;
  v_role text;
  v_tenant_id uuid;
  v_business_verification_required boolean := true;
  v_coupon_code text;
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
    AND closed_at IS NULL
    AND lower(email) = lower(v_user_email)
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  v_role := public.normalize_app_role(v_invite.role);
  v_tenant_id := v_invite.tenant_id;
  v_business_verification_required := COALESCE((v_invite.metadata->>'business_verification_required')::boolean, true);
  v_coupon_code := COALESCE(v_invite.metadata->>'coupon_code', v_invite.metadata#>>'{coupon,code}');

  IF v_tenant_id IS NULL AND v_invite.organization_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.organizations WHERE id = v_invite.organization_id;
  END IF;

  IF v_role = 'tenant_super_admin' AND v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, owner_id, metadata)
    VALUES (
      COALESCE(v_invite.metadata->>'tenant_name', split_part(v_user_email, '@', 1), 'Tenant'),
      v_user_id,
      jsonb_build_object(
        'source', 'accept_invitation',
        'invitation_id', v_invite.id,
        'invited_email', v_invite.email,
        'business_verification_required', v_business_verification_required,
        'coupon_code', v_coupon_code
      )
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  IF v_role = 'tenant_super_admin' AND v_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant_id, v_user_id, 'tenant_super_admin')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    UPDATE public.tenants
    SET owner_id = COALESCE(owner_id, v_user_id),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'business_verification_required', v_business_verification_required,
          'coupon_code', v_coupon_code
        ),
        updated_at = now()
    WHERE id = v_tenant_id;
  END IF;

  IF v_invite.organization_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_invite.organization_id, v_user_id, v_role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.brand_id IS NOT NULL THEN
    INSERT INTO public.brand_members (brand_id, user_id, role)
    VALUES (v_invite.brand_id, v_user_id, v_role)
    ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.location_id IS NOT NULL THEN
    INSERT INTO public.location_members (location_id, user_id, role)
    VALUES (v_invite.location_id, v_user_id, v_role)
    ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET tenant_id = COALESCE(v_tenant_id, tenant_id),
      role = v_role,
      organization_id = COALESCE(v_invite.organization_id, organization_id),
      brand_id = COALESCE(v_invite.brand_id, brand_id),
      location_id = COALESCE(v_invite.location_id, location_id),
      coupon_code = COALESCE(v_coupon_code, coupon_code),
      business_verification_status = CASE
        WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'verified'
        ELSE business_verification_status
      END,
      onboarding_current_step = CASE
        WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'hierarchy_setup'
        ELSE onboarding_current_step
      END,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id,
      role = v_role,
      tenant_id = COALESCE(tenant_id, v_tenant_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'business_verification_required', v_business_verification_required,
        'coupon_code', v_coupon_code
      )
  WHERE id = v_invite.id
    AND accepted_at IS NULL
    AND closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_role,
    'tenant_id', COALESCE(v_tenant_id::text, ''),
    'organization_id', COALESCE(v_invite.organization_id::text, ''),
    'business_verification_required', v_business_verification_required,
    'coupon_code', COALESCE(v_coupon_code, '')
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'organization_id', v_invite.organization_id,
    'business_verification_required', v_business_verification_required,
    'coupon_code', v_coupon_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;