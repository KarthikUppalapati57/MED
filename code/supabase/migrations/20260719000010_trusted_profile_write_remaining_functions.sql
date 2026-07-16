-- 20260719000010: Extend the trusted-profile-write bypass to the remaining functions
-- affected by trg_protect_profile_security_columns
--
-- 20260719000009 found that trg_protect_profile_security_columns blocks any authenticated-
-- role write to profiles.role/organization_id/brand_id/location_id, even from an already-
-- authorized SECURITY DEFINER function, and fixed it for org_remove_member with a
-- transaction-local trusted-write flag. Grepping turned up 6 more functions with the same
-- shape (SECURITY DEFINER, invoked under 'authenticated', updating these same columns) --
-- all 6 confirmed by reading their live bodies before this migration:
--   - admin_update_user_role: the actual role/brand/location editing RPC UserManagement.jsx
--     calls directly. This one is the highest-impact fix in this migration -- an org_manager
--     currently cannot successfully change anyone's role, brand, or location through the UI
--     at all; the UPDATE has been silently rejected every time.
--   - complete_onboarding, accept_invitation, setup_onboarding_hierarchy,
--     setup_organization_full: all first-time-onboarding paths that stamp a brand-new user's
--     role/organization_id/brand_id/location_id onto their (auto-created, blank) profile row.
--   - switch_user_context: the org/brand/location context switcher for org_manager/
--     branch_manager (CLAUDE.md section 3).
-- All 6 already have correct EXECUTE grants for authenticated (verified live before this
-- migration) -- only org_remove_member had that separate, unrelated grant gap.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id uuid,
  new_role text DEFAULT NULL::text,
  new_status text DEFAULT NULL::text,
  new_department text DEFAULT NULL::text,
  new_location text DEFAULT NULL::text,
  new_brand_id uuid DEFAULT NULL::uuid,
  new_location_id uuid DEFAULT NULL::uuid,
  new_access_level text DEFAULT NULL::text
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
      tenant_id = COALESCE(tenant_id, target_tenant),
      updated_at = now()
  WHERE id = target_user_id;

  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'role', COALESCE(normalized_role, (SELECT role FROM public.profiles WHERE id = target_user_id)),
      'tenant_id', COALESCE(target_tenant::text, '')
    )
    WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_user_context(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.organizations WHERE id = p_organization_id;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id;

  IF v_role IS NULL AND public.get_auth_role() = 'tenant_super_admin' AND v_tenant_id = public.get_auth_tenant() THEN
    v_role := 'tenant_super_admin';
  END IF;

  IF v_role IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  IF v_role IS NULL THEN
    v_role := 'platform_admin';
  END IF;

  v_role := public.normalize_app_role(v_role);

  IF p_brand_id IS NOT NULL
     AND NOT (p_brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))) THEN
    RAISE EXCEPTION 'Brand % not in your accessible scope', p_brand_id;
  END IF;

  IF p_location_id IS NOT NULL
     AND NOT (p_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))) THEN
    RAISE EXCEPTION 'Location % not in your accessible scope', p_location_id;
  END IF;

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET tenant_id = COALESCE(v_tenant_id, tenant_id),
      organization_id = p_organization_id,
      brand_id = p_brand_id,
      location_id = p_location_id,
      role = v_role,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'organization_id', p_organization_id,
    'brand_id', p_brand_id,
    'location_id', p_location_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_user_id uuid, p_org_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_org_id uuid;
  org_owner uuid;
  v_current_role text;
BEGIN
  -- Verify caller is the user being updated
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Can only complete onboarding for yourself';
  END IF;

  -- Verify the user does NOT already have an org (prevents re-onboarding abuse)
  SELECT organization_id, role INTO caller_org_id, v_current_role FROM public.profiles WHERE id = p_user_id;
  IF caller_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  -- Verify the org exists and the user is the owner
  SELECT owner_id INTO org_owner FROM public.organizations WHERE id = p_org_id;
  IF org_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Organization does not belong to this user';
  END IF;

  -- Update the profile with org hierarchy and preserve platform_admin
  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles SET
    organization_id = p_org_id,
    brand_id = p_brand_id,
    location_id = p_location_id,
    role = CASE WHEN v_current_role = 'platform_admin' THEN 'platform_admin' ELSE 'org_manager' END,
    access_level = CASE WHEN v_current_role = 'platform_admin' THEN 'platform' ELSE 'organization' END,
    updated_at = now()
  WHERE id = p_user_id;

  -- Sync JWT metadata
  UPDATE auth.users SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'role', CASE WHEN v_current_role = 'platform_admin' THEN 'platform_admin' ELSE 'org_manager' END,
      'access_level', CASE WHEN v_current_role = 'platform_admin' THEN 'platform' ELSE 'organization' END,
      'organization_id', p_org_id,
      'brand_id', p_brand_id,
      'location_id', p_location_id
    )
  WHERE id = p_user_id;

  -- Audit log
  INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  VALUES (p_org_id, p_user_id, 'ONBOARDING_COMPLETE', 'profiles', p_user_id,
          jsonb_build_object('org_id', p_org_id, 'brand_id', p_brand_id, 'location_id', p_location_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.setup_organization_full(p_user_id uuid, p_org_name text, p_org_slug text, p_brand_name text, p_location_name text, p_location_address text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_org_id uuid;
  v_brand_id uuid;
  v_location_id uuid;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.tenants (name, slug, owner_id, metadata)
  VALUES (
    p_org_name,
    left('tenant_' || regexp_replace(lower(p_org_slug), '[^a-z0-9]+', '_', 'g'), 63),
    p_user_id,
    jsonb_build_object('source', 'setup_organization_full')
  )
  ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.organizations (tenant_id, name, slug, owner_id)
  VALUES (v_tenant_id, p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING brand_id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.brand_members (brand_id, user_id, role)
  VALUES (v_brand_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.location_members (location_id, user_id, role)
  VALUES (v_location_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET tenant_id = v_tenant_id,
      organization_id = v_org_id,
      brand_id = v_brand_id,
      location_id = v_location_id,
      role = 'tenant_super_admin',
      access_level = 'organization',
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'tenant_super_admin',
    'tenant_id', v_tenant_id::text,
    'organization_id', v_org_id::text,
    'brand_id', v_brand_id::text,
    'location_id', v_location_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'org_id', v_org_id,
    'brand_id', v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION public.setup_onboarding_hierarchy(p_user_id uuid, p_hierarchy jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  org_item jsonb;
  brand_item jsonb;
  location_item jsonb;
  v_tenant_id uuid;
  v_org_id uuid;
  v_brand_id uuid;
  v_location_id uuid;
  v_primary_org_id uuid;
  v_primary_brand_id uuid;
  v_primary_location_id uuid;
  v_created_orgs jsonb := '[]'::jsonb;
  v_created_brands jsonb := '[]'::jsonb;
  v_created_locations jsonb := '[]'::jsonb;
  v_org_name text;
  v_org_slug text;
  v_brand_name text;
  v_location_name text;
  v_location_address text;
  v_org_count integer := 0;
  v_brand_count integer := 0;
  v_location_count integer := 0;
  v_business_status text;
  v_payment_verified boolean;
  v_pending_plan_id text;
  v_pending_stripe_customer_id text;
  v_pending_stripe_subscription_id text;
  v_pending_checkout_session_id text;
  v_pending_payment_metadata jsonb;
  v_run_id uuid;
  v_org_address jsonb;
  v_brand_address jsonb;
  v_business_address jsonb;
  v_mailing_address jsonb;
  v_tenant_identity jsonb;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  SELECT business_verification_status, payment_verified, pending_onboarding_plan_id, pending_stripe_customer_id, pending_stripe_subscription_id, pending_checkout_session_id, pending_payment_metadata
  INTO v_business_status, v_payment_verified, v_pending_plan_id, v_pending_stripe_customer_id, v_pending_stripe_subscription_id, v_pending_checkout_session_id, v_pending_payment_metadata
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE
     AND COALESCE(v_pending_payment_metadata->>'provider', '') NOT IN ('free_plan', 'stripe') THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Onboarding hierarchy must be an array';
  END IF;

  IF jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  v_org_name := NULLIF(btrim((p_hierarchy->0)->>'name'), '');
  v_org_slug := NULLIF(btrim((p_hierarchy->0)->>'slug'), '');

  INSERT INTO public.tenants (name, slug, owner_id, metadata)
  VALUES (
    COALESCE(v_org_name, 'Tenant'),
    left('tenant_' || regexp_replace(lower(COALESCE(v_org_slug, gen_random_uuid()::text)), '[^a-z0-9]+', '_', 'g'), 63),
    p_user_id,
    jsonb_build_object(
      'source', 'setup_onboarding_hierarchy',
      'business_identity', (p_hierarchy->0)#>'{metadata,tenant_business_identity}'
    )
  )
  ON CONFLICT (slug) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        metadata = COALESCE(public.tenants.metadata, '{}'::jsonb) || EXCLUDED.metadata
  RETURNING id INTO v_tenant_id;

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
  EXCEPTION WHEN undefined_function THEN
    v_run_id := NULL;
  END;

  FOR org_item IN SELECT value FROM jsonb_array_elements(p_hierarchy)
  LOOP
    v_org_name := NULLIF(btrim(org_item->>'name'), '');
    v_org_slug := NULLIF(btrim(org_item->>'slug'), '');
    v_org_address := NULLIF(COALESCE(org_item#>'{metadata,organization_business_address}', org_item#>'{metadata,organization_address}'), 'null'::jsonb);
    v_mailing_address := CASE
      WHEN COALESCE((org_item#>>'{metadata,organization_mailing_same_as_business}')::boolean, true) THEN v_org_address
      ELSE NULLIF(org_item#>'{metadata,organization_mailing_address}', 'null'::jsonb)
    END;

    IF v_org_name IS NULL OR v_org_slug IS NULL THEN
      RAISE EXCEPTION 'Each organization requires a name and slug';
    END IF;

    IF COALESCE(jsonb_typeof(org_item->'brands'), 'null') <> 'array'
       OR jsonb_array_length(org_item->'brands') = 0 THEN
      RAISE EXCEPTION 'Organization % requires at least one brand', v_org_name;
    END IF;

    INSERT INTO public.organizations (tenant_id, name, slug, owner_id)
    VALUES (v_tenant_id, v_org_name, v_org_slug, p_user_id)
    RETURNING id INTO v_org_id;

    IF v_org_address IS NOT NULL AND COALESCE(jsonb_typeof(v_org_address), 'null') <> 'object' THEN
      RAISE EXCEPTION 'Organization % business/service address must be an object when provided', v_org_name;
    END IF;

    IF v_org_address IS NOT NULL THEN
      IF v_mailing_address IS NULL OR COALESCE(jsonb_typeof(v_mailing_address), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Organization % mailing address must be an object when organization address is provided', v_org_name;
      END IF;

      PERFORM public.insert_onboarding_address(
        p_user_id, v_org_id, NULL, NULL, 'service', v_org_name, v_org_address
      );

      PERFORM public.insert_onboarding_address(
        p_user_id, v_org_id, NULL, NULL, 'mailing', v_org_name, v_mailing_address
      );
    END IF;

    v_org_count := v_org_count + 1;
    v_created_orgs := v_created_orgs || jsonb_build_array(jsonb_build_object('id', v_org_id, 'name', v_org_name, 'slug', v_org_slug));

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, p_user_id, 'tenant_super_admin')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    IF v_primary_org_id IS NULL THEN
      v_primary_org_id := v_org_id;
    END IF;

    FOR brand_item IN SELECT value FROM jsonb_array_elements(org_item->'brands')
    LOOP
      v_brand_name := NULLIF(btrim(brand_item->>'name'), '');
      v_brand_address := NULLIF(brand_item#>'{metadata,brand_address}', 'null'::jsonb);

      IF v_brand_name IS NULL THEN
        RAISE EXCEPTION 'Every brand in organization % requires a name', v_org_name;
      END IF;

      IF COALESCE(jsonb_typeof(brand_item->'locations'), 'null') <> 'array'
         OR jsonb_array_length(brand_item->'locations') = 0 THEN
        RAISE EXCEPTION 'Brand % requires at least one location', v_brand_name;
      END IF;

      INSERT INTO public.brands (organization_id, name)
      VALUES (v_org_id, v_brand_name)
      RETURNING brand_id INTO v_brand_id;

      IF v_brand_address IS NOT NULL AND COALESCE(jsonb_typeof(v_brand_address), 'null') = 'object' THEN
        PERFORM public.insert_onboarding_address(
          p_user_id, v_org_id, v_brand_id, NULL, 'service', v_brand_name, v_brand_address
        );
      END IF;

      v_brand_count := v_brand_count + 1;
      v_created_brands := v_created_brands || jsonb_build_array(jsonb_build_object('id', v_brand_id, 'organization_id', v_org_id, 'name', v_brand_name));

      INSERT INTO public.brand_members (brand_id, user_id, role)
      VALUES (v_brand_id, p_user_id, 'tenant_super_admin')
      ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

      IF v_primary_brand_id IS NULL THEN
        v_primary_brand_id := v_brand_id;
      END IF;

      FOR location_item IN SELECT value FROM jsonb_array_elements(brand_item->'locations')
      LOOP
        v_location_name := NULLIF(btrim(location_item->>'name'), '');
        v_location_address := COALESCE(NULLIF(btrim(location_item->>'address'), ''), 'Address pending');
        v_business_address := location_item->'business_address';
        v_mailing_address := location_item->'mailing_address';

        IF v_location_name IS NULL THEN
          RAISE EXCEPTION 'Every location in brand % requires a name', v_brand_name;
        END IF;

        IF v_business_address IS NULL OR COALESCE(jsonb_typeof(v_business_address), 'null') <> 'object' THEN
          RAISE EXCEPTION 'Every location in brand % requires a business/service address', v_brand_name;
        END IF;

        INSERT INTO public.locations (organization_id, brand_id, name, address)
        VALUES (v_org_id, v_brand_id, v_location_name, v_location_address)
        RETURNING id INTO v_location_id;

        PERFORM public.insert_onboarding_address(
          p_user_id, v_org_id, v_brand_id, v_location_id, 'service', v_location_name, v_business_address
        );

        IF v_mailing_address IS NULL OR COALESCE(jsonb_typeof(v_mailing_address), 'null') <> 'object' THEN
          RAISE EXCEPTION 'Every location in brand % requires a mailing address', v_brand_name;
        END IF;

        PERFORM public.insert_onboarding_address(
          p_user_id, v_org_id, v_brand_id, v_location_id, 'mailing', v_location_name, v_mailing_address
        );

        v_location_count := v_location_count + 1;
        v_created_locations := v_created_locations || jsonb_build_array(jsonb_build_object(
          'id', v_location_id,
          'organization_id', v_org_id,
          'brand_id', v_brand_id,
          'name', v_location_name,
          'address', v_location_address
        ));

        INSERT INTO public.location_members (location_id, user_id, role)
        VALUES (v_location_id, p_user_id, 'tenant_super_admin')
        ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

        IF v_primary_location_id IS NULL THEN
          v_primary_location_id := v_location_id;
        END IF;
      END LOOP;
    END LOOP;

    INSERT INTO public.onboarding_progress (organization_id, current_step, completed_steps, is_completed)
    VALUES (v_org_id, 'hierarchy_created', ARRAY['organizations', 'brands', 'locations'], false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE public.profiles
  SET tenant_id = v_tenant_id,
      organization_id = v_primary_org_id,
      brand_id = v_primary_brand_id,
      location_id = v_primary_location_id,
      role = 'tenant_super_admin',
      access_level = 'organization',
      onboarding_status = 'completed',
      onboarding_current_step = 'completed',
      onboarding_completed_at = now(),
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'tenant_super_admin',
    'tenant_id', v_tenant_id::text,
    'organization_id', v_primary_org_id::text,
    'brand_id', v_primary_brand_id::text,
    'location_id', v_primary_location_id::text
  )
  WHERE id = p_user_id;

  IF v_primary_org_id IS NOT NULL THEN
    UPDATE public.organizations
    SET plan_id = COALESCE(v_pending_plan_id, plan_id),
        stripe_customer_id = COALESCE(v_pending_stripe_customer_id, stripe_customer_id),
        stripe_subscription_id = COALESCE(v_pending_stripe_subscription_id, stripe_subscription_id)
    WHERE id = v_primary_org_id;
  END IF;

  UPDATE public.business_verifications SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.organization_addresses SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.onboarding_payment_methods SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.onboarding_coupon_redemptions SET organization_id = v_primary_org_id
  WHERE user_id = p_user_id AND organization_id IS NULL;

  v_tenant_identity := (p_hierarchy->0)#>'{metadata,tenant_business_identity}';
  IF v_tenant_identity IS NOT NULL AND COALESCE(jsonb_typeof(v_tenant_identity), 'null') = 'object' THEN
    v_business_address := v_tenant_identity->'businessAddress';
    v_mailing_address := CASE
      WHEN COALESCE((v_tenant_identity->>'mailingSameAsBusiness')::boolean, true) THEN v_business_address
      ELSE v_tenant_identity->'mailingAddress'
    END;

    IF v_business_address IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_addresses
         WHERE user_id = p_user_id
           AND organization_id = v_primary_org_id
           AND brand_id IS NULL
           AND location_id IS NULL
           AND address_type = 'business'
       ) THEN
      PERFORM public.insert_onboarding_address(
        p_user_id, v_primary_org_id, NULL, NULL, 'business', 'Tenant business identity', v_business_address
      );
    END IF;

    IF v_mailing_address IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_addresses
         WHERE user_id = p_user_id
           AND organization_id = v_primary_org_id
           AND brand_id IS NULL
           AND location_id IS NULL
           AND address_type = 'mailing'
       ) THEN
      PERFORM public.insert_onboarding_address(
        p_user_id, v_primary_org_id, NULL, NULL, 'mailing', 'Tenant business identity', v_mailing_address
      );
    END IF;
  END IF;

  IF v_run_id IS NOT NULL THEN
    UPDATE public.onboarding_workflow_runs
    SET organization_id = v_primary_org_id,
        status = 'completed',
        current_step = 'completed',
        completed_at = now(),
        last_activity_at = now()
    WHERE id = v_run_id;

    PERFORM public.record_onboarding_event(
      v_run_id,
      p_user_id,
      'hierarchy_setup',
      'completed',
      'completed',
      jsonb_build_object('tenant_id', v_tenant_id, 'primary_org_id', v_primary_org_id, 'plan_id', v_pending_plan_id, 'checkout_session_id', v_pending_checkout_session_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'primary_org_id', v_primary_org_id,
    'primary_brand_id', v_primary_brand_id,
    'primary_location_id', v_primary_location_id,
    'organizations', v_created_orgs,
    'brands', v_created_brands,
    'locations', v_created_locations,
    'counts', jsonb_build_object('organizations', v_org_count, 'brands', v_brand_count, 'locations', v_location_count),
    'plan_id', v_pending_plan_id,
    'stripe_customer_id', v_pending_stripe_customer_id,
    'stripe_subscription_id', v_pending_stripe_subscription_id
  );
END;
$$;

COMMIT;
