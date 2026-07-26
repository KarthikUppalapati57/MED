BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS default_page_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

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
  v_user_name text;
  v_role text;
  v_tenant_id uuid;
  v_business_verification_required boolean := true;
  v_coupon_code text;
  v_access_permissions jsonb := '{}'::jsonb;
  v_role_id uuid;
  v_profile_context record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    email,
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1))
  INTO v_user_email, v_user_name
  FROM auth.users
  WHERE id = v_user_id;

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
  v_access_permissions := CASE
    WHEN jsonb_typeof(v_invite.metadata->'permissions') = 'object' THEN v_invite.metadata->'permissions'
    WHEN jsonb_typeof(v_invite.metadata->'access') = 'object' THEN v_invite.metadata->'access'
    ELSE '{}'::jsonb
  END;

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

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = v_role
    AND (is_system = true OR organization_id = v_invite.organization_id)
  ORDER BY is_system ASC
  LIMIT 1;

  IF v_role_id IS NOT NULL AND v_invite.organization_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, location_id, organization_id)
    VALUES (v_user_id, v_role_id, v_invite.location_id, v_invite.organization_id)
    ON CONFLICT (user_id, role_id) DO UPDATE
      SET location_id = EXCLUDED.location_id,
          organization_id = EXCLUDED.organization_id;
  END IF;

  PERFORM set_config('app.trusted_profile_write', 'on', true);

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    tenant_id,
    role,
    organization_id,
    brand_id,
    location_id,
    coupon_code,
    payment_verified,
    business_verification_status,
    onboarding_status,
    onboarding_current_step,
    access_permissions,
    is_active
  )
  VALUES (
    v_user_id,
    v_user_email,
    COALESCE(v_user_name, split_part(v_user_email, '@', 1), 'User'),
    v_tenant_id,
    v_role,
    v_invite.organization_id,
    v_invite.brand_id,
    v_invite.location_id,
    v_coupon_code,
    false,
    CASE
      WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'verified'
      ELSE 'not_started'
    END,
    'not_started',
    CASE
      WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'hierarchy_setup'
      ELSE 'business_verification'
    END,
    v_access_permissions,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
      tenant_id = COALESCE(EXCLUDED.tenant_id, public.profiles.tenant_id),
      role = EXCLUDED.role,
      organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id),
      brand_id = COALESCE(EXCLUDED.brand_id, public.profiles.brand_id),
      location_id = COALESCE(EXCLUDED.location_id, public.profiles.location_id),
      coupon_code = COALESCE(EXCLUDED.coupon_code, public.profiles.coupon_code),
      access_permissions = CASE WHEN v_access_permissions = '{}'::jsonb THEN public.profiles.access_permissions ELSE v_access_permissions END,
      business_verification_status = CASE
        WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'verified'
        ELSE public.profiles.business_verification_status
      END,
      onboarding_current_step = CASE
        WHEN v_role = 'tenant_super_admin' AND v_business_verification_required IS FALSE THEN 'hierarchy_setup'
        ELSE public.profiles.onboarding_current_step
      END,
      is_active = true,
      updated_at = now();

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id,
      role = v_role,
      tenant_id = COALESCE(tenant_id, v_tenant_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'business_verification_required', v_business_verification_required,
        'coupon_code', v_coupon_code,
        'permissions', v_access_permissions
      )
  WHERE id = v_invite.id
    AND accepted_at IS NULL
    AND closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  SELECT
    role,
    tenant_id,
    organization_id,
    brand_id,
    location_id,
    access_permissions
  INTO v_profile_context
  FROM public.profiles
  WHERE id = v_user_id;

  PERFORM public.sync_auth_metadata_from_profile(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'role', v_profile_context.role,
    'tenant_id', v_profile_context.tenant_id,
    'organization_id', v_profile_context.organization_id,
    'brand_id', v_profile_context.brand_id,
    'location_id', v_profile_context.location_id,
    'access_permissions', v_profile_context.access_permissions,
    'business_verification_required', v_business_verification_required,
    'coupon_code', v_coupon_code
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id uuid,
  new_role text DEFAULT NULL::text,
  new_status text DEFAULT NULL::text,
  new_department text DEFAULT NULL::text,
  new_location text DEFAULT NULL::text,
  new_brand_id uuid DEFAULT NULL::uuid,
  new_location_id uuid DEFAULT NULL::uuid,
  new_access_level text DEFAULT NULL::text,
  new_access_permissions jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  caller_role text;
  caller_org uuid;
  caller_tenant uuid;
  target_org uuid;
  target_tenant uuid;
  normalized_role text;
BEGIN
  IF new_location IS NOT NULL THEN
    -- Backward-compatible no-op.
  END IF;

  caller_role := public.get_auth_role();
  caller_org := public.get_auth_org();
  caller_tenant := public.get_auth_tenant();
  normalized_role := CASE WHEN new_role IS NULL THEN NULL ELSE public.normalize_app_role(new_role) END;

  IF caller_role NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: org_manager, tenant_super_admin, or platform_admin required';
  END IF;

  SELECT p.organization_id, COALESCE(p.tenant_id, o.tenant_id)
  INTO target_org, target_tenant
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = target_user_id;

  IF caller_role = 'tenant_super_admin' AND target_tenant IS DISTINCT FROM caller_tenant THEN
    RAISE EXCEPTION 'Cannot modify users outside your tenant';
  END IF;

  IF caller_role = 'org_manager' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND normalized_role IS NOT NULL THEN
    IF NOT public.can_invite_role(normalized_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND normalized_role IS NOT NULL AND normalized_role <> caller_role THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  IF normalized_role = 'tenant_super_admin' AND target_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (target_tenant, target_user_id, 'tenant_super_admin')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF normalized_role IS NOT NULL AND target_org IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (target_org, target_user_id, normalized_role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET role = COALESCE(normalized_role, role),
      status = COALESCE(new_status, status),
      department = COALESCE(new_department, department),
      brand_id = COALESCE(new_brand_id, brand_id),
      location_id = COALESCE(new_location_id, location_id),
      access_level = COALESCE(new_access_level, access_level),
      access_permissions = COALESCE(new_access_permissions, access_permissions),
      tenant_id = COALESCE(tenant_id, target_tenant),
      updated_at = now()
  WHERE id = target_user_id;

  PERFORM public.sync_auth_metadata_from_profile(target_user_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
