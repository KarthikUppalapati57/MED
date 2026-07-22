BEGIN;

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