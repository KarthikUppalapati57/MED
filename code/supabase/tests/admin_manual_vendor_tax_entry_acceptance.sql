BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_other_brand uuid := gen_random_uuid();
  v_other_location uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_vendor uuid;
  v_other_vendor uuid;
  v_result jsonb;
  v_count integer;
  v_status text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_manager, 'admin-tax-entry-manager@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org, 'Admin Tax Entry Org', 'admin-tax-entry-' || replace(v_org::text, '-', '')),
    (v_other_org, 'Admin Tax Entry Other Org', 'admin-tax-entry-other-' || replace(v_other_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand, v_org, 'Admin Tax Entry Brand'),
    (v_other_brand, v_other_org, 'Admin Tax Entry Other Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location, v_org, v_brand, 'Admin Tax Entry Location'),
    (v_other_location, v_other_org, v_other_brand, 'Admin Tax Entry Other Location');

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand,
         location_id = v_location,
         role = 'location_manager',
         access_level = 'location',
         updated_at = now()
   WHERE id = v_manager;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_manager, 'location_manager');

  -- onboarding_status defaults to 'completed' (vendors created outside the wizard don't track
  -- onboarding at all); set it to a pre-tax-submission state so the RPC's own advance-guard
  -- doesn't just no-op this test vendor.
  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, onboarding_status)
  VALUES (v_org, v_brand, v_location, 'Admin Tax Entry Vendor', 'active', 'otp_verified')
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_other_org, v_other_brand, v_other_location, 'Admin Tax Entry Other Vendor', 'active')
  RETURNING id INTO v_other_vendor;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_manager::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Out-of-scope vendor (different org) is rejected.
  BEGIN
    PERFORM public.admin_submit_vendor_tax_info(v_other_vendor, '123456789');
    RAISE EXCEPTION 'manager entered tax info for an out-of-scope vendor';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%Access denied%' THEN
        RAISE;
      END IF;
  END;

  -- In-scope manual entry succeeds and produces the same row shape the magic-link path does.
  -- Dashed at position 3 (12-3456789): must infer 'ein', not 'ssn' -- Postgres position() is
  -- 1-indexed, unlike the JS indexOf()-based version this mirrors.
  v_result := public.admin_submit_vendor_tax_info(
    v_vendor, '12-3456789', 'Manual Entry Legal Name', 'llc', NULL, NULL
  );
  IF (v_result->>'tax_id_last4') <> '6789' THEN
    RAISE EXCEPTION 'expected tax_id_last4 6789, got %', v_result;
  END IF;

  -- vendor_tax_information is admin-tier-only readable (VO-SEC-002); a location_manager
  -- can call the RPC but can't directly SELECT the row it created, so verify as postgres.
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.vendor_tax_information
  WHERE id = (v_result->>'tax_row_id')::uuid AND tax_id_type = 'ein';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected a dashed 9-digit tax id to infer tax_id_type=ein, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_tax_information
  WHERE vendor_id = v_vendor
    AND legal_name = 'Manual Entry Legal Name'
    AND verification_status = 'pending'
    AND created_by = v_manager;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one manually-entered tax_information row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = v_vendor
    AND event_type = 'tax_submitted'
    AND actor_type = 'admin'
    AND actor_id = v_manager
    AND metadata->>'entry_method' = 'manual';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one admin-attributed tax_submitted audit event, got %', v_count;
  END IF;

  SELECT onboarding_status INTO v_status FROM public.vendors WHERE id = v_vendor;
  IF v_status <> 'tax_submitted' THEN
    RAISE EXCEPTION 'expected vendor onboarding_status tax_submitted, got %', v_status;
  END IF;

  -- postgres (the connecting superuser) bypasses grants too, so this doubles as proof the
  -- manually-entered tax id actually made it into the vault, not just a display column.
  SELECT public.get_vendor_tax_for_audit((v_result->>'tax_row_id')::uuid) INTO v_status;
  IF v_status <> '12-3456789' THEN
    RAISE EXCEPTION 'expected vaulted tax id 12-3456789, got %', v_status;
  END IF;

  RAISE NOTICE 'admin manual vendor tax entry acceptance assertions passed';
END $$;

ROLLBACK;
