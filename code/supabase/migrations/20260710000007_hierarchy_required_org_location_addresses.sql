-- Align hierarchy onboarding with organization/location address capture.
-- Business identity remains identity-only; addresses are captured with the hierarchy.

CREATE OR REPLACE FUNCTION public.setup_onboarding_hierarchy(
  p_user_id uuid,
  p_hierarchy jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  IF COALESCE(v_payment_verified, false) IS NOT TRUE THEN
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
    v_org_address := COALESCE(org_item#>'{metadata,organization_business_address}', org_item#>'{metadata,organization_address}');
    v_mailing_address := CASE
      WHEN COALESCE((org_item#>>'{metadata,organization_mailing_same_as_business}')::boolean, true) THEN v_org_address
      ELSE org_item#>'{metadata,organization_mailing_address}'
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

    IF v_org_address IS NULL OR COALESCE(jsonb_typeof(v_org_address), 'null') <> 'object' THEN
      RAISE EXCEPTION 'Organization % requires a business/service address', v_org_name;
    END IF;

    IF v_mailing_address IS NULL OR COALESCE(jsonb_typeof(v_mailing_address), 'null') <> 'object' THEN
      RAISE EXCEPTION 'Organization % requires a mailing address', v_org_name;
    END IF;

    PERFORM public.insert_onboarding_address(
      p_user_id, v_org_id, NULL, NULL, 'service', v_org_name, v_org_address
    );

    PERFORM public.insert_onboarding_address(
      p_user_id, v_org_id, NULL, NULL, 'mailing', v_org_name, v_mailing_address
    );

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
      v_brand_address := brand_item#>'{metadata,brand_address}';

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
    'success', true,
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

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
