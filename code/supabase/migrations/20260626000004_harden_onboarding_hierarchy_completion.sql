-- Harden hierarchy completion after production onboarding workflow tables exist.

BEGIN;

CREATE OR REPLACE FUNCTION public.setup_onboarding_hierarchy(
  p_user_id UUID,
  p_hierarchy JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_item JSONB;
  brand_item JSONB;
  location_item JSONB;
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
  v_primary_org_id UUID;
  v_primary_brand_id UUID;
  v_primary_location_id UUID;
  v_created_orgs JSONB := '[]'::jsonb;
  v_created_brands JSONB := '[]'::jsonb;
  v_created_locations JSONB := '[]'::jsonb;
  v_org_name TEXT;
  v_org_slug TEXT;
  v_brand_name TEXT;
  v_location_name TEXT;
  v_location_address TEXT;
  v_org_count INTEGER := 0;
  v_brand_count INTEGER := 0;
  v_location_count INTEGER := 0;
  v_business_status TEXT;
  v_payment_verified BOOLEAN;
  v_run_id UUID;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  SELECT business_verification_status, payment_verified
  INTO v_business_status, v_payment_verified
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  v_run_id := public.get_or_create_onboarding_run(p_user_id);


  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Onboarding hierarchy must be an array';
  END IF;

  IF jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  FOR org_item IN SELECT value FROM jsonb_array_elements(p_hierarchy)
  LOOP
    v_org_name := NULLIF(btrim(org_item->>'name'), '');
    v_org_slug := NULLIF(btrim(org_item->>'slug'), '');

    IF v_org_name IS NULL OR v_org_slug IS NULL THEN
      RAISE EXCEPTION 'Each organization requires a name and slug';
    END IF;

    IF COALESCE(jsonb_typeof(org_item->'brands'), 'null') <> 'array' THEN
      RAISE EXCEPTION 'Organization % brands must be an array', v_org_name;
    END IF;

    IF jsonb_array_length(org_item->'brands') = 0 THEN
      RAISE EXCEPTION 'Organization % requires at least one brand', v_org_name;
    END IF;

    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES (v_org_name, v_org_slug, p_user_id)
    RETURNING id INTO v_org_id;

    v_org_count := v_org_count + 1;
    v_created_orgs := v_created_orgs || jsonb_build_array(
      jsonb_build_object('id', v_org_id, 'name', v_org_name, 'slug', v_org_slug)
    );

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, p_user_id, 'org_owner')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    IF v_primary_org_id IS NULL THEN
      v_primary_org_id := v_org_id;
    END IF;

    FOR brand_item IN SELECT value FROM jsonb_array_elements(org_item->'brands')
    LOOP
      v_brand_name := NULLIF(btrim(brand_item->>'name'), '');

      IF v_brand_name IS NULL THEN
        RAISE EXCEPTION 'Every brand in organization % requires a name', v_org_name;
      END IF;

      IF COALESCE(jsonb_typeof(brand_item->'locations'), 'null') <> 'array' THEN
        RAISE EXCEPTION 'Brand % locations must be an array', v_brand_name;
      END IF;

      IF jsonb_array_length(brand_item->'locations') = 0 THEN
        RAISE EXCEPTION 'Brand % requires at least one location', v_brand_name;
      END IF;

      INSERT INTO public.brands (organization_id, name)
      VALUES (v_org_id, v_brand_name)
      RETURNING brand_id INTO v_brand_id;

      v_brand_count := v_brand_count + 1;
      v_created_brands := v_created_brands || jsonb_build_array(
        jsonb_build_object('id', v_brand_id, 'organization_id', v_org_id, 'name', v_brand_name)
      );

      INSERT INTO public.brand_members (brand_id, user_id, role)
      VALUES (v_brand_id, p_user_id, 'org_owner')
      ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

      IF v_primary_brand_id IS NULL THEN
        v_primary_brand_id := v_brand_id;
      END IF;

      FOR location_item IN SELECT value FROM jsonb_array_elements(brand_item->'locations')
      LOOP
        v_location_name := NULLIF(btrim(location_item->>'name'), '');
        v_location_address := COALESCE(NULLIF(btrim(location_item->>'address'), ''), 'Address pending');

        IF v_location_name IS NULL THEN
          RAISE EXCEPTION 'Every location in brand % requires a name', v_brand_name;
        END IF;

        INSERT INTO public.locations (organization_id, brand_id, name, address)
        VALUES (v_org_id, v_brand_id, v_location_name, v_location_address)
        RETURNING id INTO v_location_id;

        v_location_count := v_location_count + 1;
        v_created_locations := v_created_locations || jsonb_build_array(
          jsonb_build_object(
            'id', v_location_id,
            'organization_id', v_org_id,
            'brand_id', v_brand_id,
            'name', v_location_name,
            'address', v_location_address
          )
        );

        INSERT INTO public.location_members (location_id, user_id, role)
        VALUES (v_location_id, p_user_id, 'org_owner')
        ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

        IF v_primary_location_id IS NULL THEN
          v_primary_location_id := v_location_id;
        END IF;
      END LOOP;
    END LOOP;

    INSERT INTO public.onboarding_progress (
      organization_id,
      current_step,
      completed_steps,
      is_completed
    )
    VALUES (
      v_org_id,
      'hierarchy_created',
      ARRAY['organizations', 'brands', 'locations'],
      false
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.profiles
  SET organization_id = v_primary_org_id,
      brand_id        = v_primary_brand_id,
      location_id     = v_primary_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      onboarding_status = 'completed',
      onboarding_current_step = 'completed',
      onboarding_completed_at = now(),
      updated_at      = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'org_owner',
    'organization_id', v_primary_org_id::text,
    'brand_id', v_primary_brand_id::text,
    'location_id', v_primary_location_id::text
  )
  WHERE id = p_user_id;

  UPDATE public.business_verifications
  SET organization_id = v_primary_org_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND organization_id IS NULL;

  UPDATE public.organization_addresses
  SET organization_id = v_primary_org_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND organization_id IS NULL;

  UPDATE public.onboarding_payment_methods
  SET organization_id = v_primary_org_id,
      updated_at = now()
  WHERE user_id = p_user_id
    AND organization_id IS NULL;

  UPDATE public.onboarding_coupon_redemptions
  SET organization_id = v_primary_org_id
  WHERE user_id = p_user_id
    AND organization_id IS NULL;

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
    jsonb_build_object(
      'primary_org_id', v_primary_org_id,
      'organization_count', v_org_count,
      'brand_count', v_brand_count,
      'location_count', v_location_count
    )
  );
  BEGIN
    PERFORM public.emit_domain_event(
      'user.onboarding.hierarchy_created',
      'user',
      p_user_id,
      v_primary_org_id,
      jsonb_build_object(
        'organization_count', v_org_count,
        'brand_count', v_brand_count,
        'location_count', v_location_count,
        'organization_ids', (
          SELECT jsonb_agg(value->>'id') FROM jsonb_array_elements(v_created_orgs)
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not emit onboarding hierarchy event: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'primary_org_id', v_primary_org_id,
    'primary_brand_id', v_primary_brand_id,
    'primary_location_id', v_primary_location_id,
    'organizations', v_created_orgs,
    'brands', v_created_brands,
    'locations', v_created_locations,
    'counts', jsonb_build_object(
      'organizations', v_org_count,
      'brands', v_brand_count,
      'locations', v_location_count
    )
  );
END;
$$;



COMMENT ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) IS
  'Atomic production onboarding completion: requires verified business and payment, creates hierarchy, links verification/payment/coupon state, and completes the workflow run.';

REVOKE EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;