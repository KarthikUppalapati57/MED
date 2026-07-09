-- Invite-level business verification requirement.
-- If Platform Admin disables business verification for a tenant invite, accepting
-- that invite marks the tenant super admin profile as verified for onboarding
-- routing purposes. The source of truth for the decision remains invitations.metadata.

BEGIN;

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
        'business_verification_required', v_business_verification_required
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
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('business_verification_required', v_business_verification_required),
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
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('business_verification_required', v_business_verification_required)
  WHERE id = v_invite.id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_role,
    'tenant_id', COALESCE(v_tenant_id::text, ''),
    'organization_id', COALESCE(v_invite.organization_id::text, ''),
    'business_verification_required', v_business_verification_required
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'organization_id', v_invite.organization_id,
    'business_verification_required', v_business_verification_required
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
