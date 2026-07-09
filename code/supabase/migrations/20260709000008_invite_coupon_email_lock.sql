-- Invite-generated coupons are bound to the invited email and copied into the
-- tenant super admin profile when the invite is accepted.

CREATE OR REPLACE FUNCTION public.apply_onboarding_coupon(
  p_code TEXT,
  p_plan_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_coupon public.onboarding_coupons%ROWTYPE;
  v_invited_email TEXT;
  v_redemption_id UUID;
  v_trial_ends_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_coupon
  FROM public.onboarding_coupons
  WHERE lower(code) = lower(btrim(p_code))
    AND active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_coupon.id IS NULL THEN
    RAISE EXCEPTION 'Coupon is invalid or expired';
  END IF;

  v_invited_email := lower(NULLIF(v_coupon.metadata->>'invited_email', ''));
  IF v_invited_email IS NOT NULL AND v_invited_email <> lower(COALESCE(v_user_email, '')) THEN
    RAISE EXCEPTION 'Coupon is assigned to a different invited email';
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions THEN
    RAISE EXCEPTION 'Coupon has reached its redemption limit';
  END IF;

  IF v_coupon.applies_to_plan_ids IS NOT NULL
     AND p_plan_id IS NOT NULL
     AND NOT (p_plan_id = ANY(v_coupon.applies_to_plan_ids)) THEN
    RAISE EXCEPTION 'Coupon does not apply to the selected plan';
  END IF;

  v_trial_ends_at := CASE
    WHEN v_coupon.discount_type = 'trial_days' AND v_coupon.trial_days > 0
    THEN now() + make_interval(days => v_coupon.trial_days)
    ELSE NULL
  END;

  INSERT INTO public.onboarding_coupon_redemptions (
    coupon_id,
    user_id,
    plan_id,
    discount_snapshot
  )
  VALUES (
    v_coupon.id,
    v_user_id,
    p_plan_id,
    jsonb_build_object(
      'code', v_coupon.code,
      'discount_type', v_coupon.discount_type,
      'discount_value', v_coupon.discount_value,
      'trial_days', v_coupon.trial_days,
      'trial_ends_at', v_trial_ends_at,
      'invited_email', v_invited_email
    )
  )
  ON CONFLICT (coupon_id, user_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id,
      status = 'applied',
      discount_snapshot = EXCLUDED.discount_snapshot,
      redeemed_at = now()
  RETURNING id INTO v_redemption_id;

  UPDATE public.onboarding_coupons
  SET redeemed_count = (
    SELECT count(*) FROM public.onboarding_coupon_redemptions
    WHERE coupon_id = v_coupon.id AND status IN ('applied', 'consumed')
  )
  WHERE id = v_coupon.id;

  UPDATE public.profiles
  SET coupon_code = v_coupon.code,
      trial_ends_at = COALESCE(v_trial_ends_at, trial_ends_at),
      onboarding_current_step = 'hierarchy_setup',
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'coupon', jsonb_build_object(
      'code', v_coupon.code,
      'description', v_coupon.description,
      'discount_type', v_coupon.discount_type,
      'discount_value', v_coupon.discount_value,
      'trial_days', v_coupon.trial_days,
      'trial_ends_at', v_trial_ends_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    AND (expires_at IS NULL OR expires_at > now());

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
  WHERE id = v_invite.id;

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

GRANT EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
