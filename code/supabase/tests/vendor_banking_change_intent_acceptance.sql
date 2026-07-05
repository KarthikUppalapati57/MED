BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_vendor uuid;
  v_default_a uuid;
  v_add_b uuid;
  v_replace_c uuid;
  v_manual_d uuid;
  v_link jsonb;
  v_token text;
  v_submit jsonb;
  v_selected record;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_user,
    'vendor-banking-intent-manager@example.test',
    crypt('password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Vendor Banking Intent Org', 'vendor-banking-intent-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Vendor Banking Intent Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Vendor Banking Intent Location');

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand,
         location_id = v_location,
         role = 'location_manager',
         access_level = 'location',
         updated_at = now()
   WHERE id = v_user;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_user, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Vendor Intent Supplier', 'active')
  RETURNING id INTO v_vendor;

  SET LOCAL ROLE service_role;

  INSERT INTO public.vendor_banking_details (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    verification_state,
    verified_at
  ) VALUES (
    v_vendor,
    v_org,
    v_brand,
    v_location,
    'verified',
    now()
  )
  RETURNING id INTO v_default_a;

  PERFORM public.store_vendor_banking_secret(v_default_a, '000111222333', '021000021');

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_default_a
      AND is_default = true
      AND is_active = true
      AND account_last4 = '2333'
  ) THEN
    RAISE EXCEPTION 'initial account A was not active default';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor, 'add');
  IF v_link->>'intent' <> 'add' THEN
    RAISE EXCEPTION 'add link did not return intent add: %', v_link;
  END IF;
  v_token := v_link->>'token';

  RESET ROLE;
  SET LOCAL ROLE service_role;

  SELECT public.submit_vendor_banking_via_link(v_token, '999888777666', '011000015')
    INTO v_submit;
  v_add_b := (v_submit->>'banking_row_id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_add_b
      AND is_default = false
      AND is_active = true
      AND verification_state = 'verified'
      AND account_last4 = '7666'
  ) THEN
    RAISE EXCEPTION 'add intent account B should be active verified non-default: %', v_submit;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_default_a
      AND is_default = true
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'add intent changed prior default A';
  END IF;

  SELECT *
    INTO v_selected
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_selected.id IS DISTINCT FROM v_default_a THEN
    RAISE EXCEPTION 'picker should still return A after add, got %', row_to_json(v_selected);
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor, 'replace');
  IF v_link->>'intent' <> 'replace' THEN
    RAISE EXCEPTION 'replace link did not return intent replace: %', v_link;
  END IF;
  v_token := v_link->>'token';

  RESET ROLE;
  SET LOCAL ROLE service_role;

  SELECT public.submit_vendor_banking_via_link(v_token, '444555666777', '121000248')
    INTO v_submit;
  v_replace_c := (v_submit->>'banking_row_id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_replace_c
      AND is_default = true
      AND is_active = true
      AND verification_state = 'verified'
      AND account_last4 = '6777'
  ) THEN
    RAISE EXCEPTION 'replace intent account C should be active verified default: %', v_submit;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_default_a
      AND is_default = false
      AND is_active = false
  ) THEN
    RAISE EXCEPTION 'replace intent did not demote and deactivate prior default A';
  END IF;

  SELECT *
    INTO v_selected
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_selected.id IS DISTINCT FROM v_replace_c OR v_selected.account_last4 <> '6777' THEN
    RAISE EXCEPTION 'picker should return replacement C, got %', row_to_json(v_selected);
  END IF;

  INSERT INTO public.vendor_banking_details (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    verification_state,
    verified_at
  ) VALUES (
    v_vendor,
    v_org,
    v_brand,
    v_location,
    'verified',
    now()
  )
  RETURNING id INTO v_manual_d;

  PERFORM public.store_vendor_banking_secret(v_manual_d, '123123123999', '021000021');

  UPDATE public.vendor_banking_details
     SET is_default = true
   WHERE id = v_manual_d;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_manual_d
      AND is_default = true
      AND is_active = true
      AND account_last4 = '3999'
  ) THEN
    RAISE EXCEPTION 'manual account D was not promoted to active default';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_replace_c
      AND is_default = false
      AND is_active = false
  ) THEN
    RAISE EXCEPTION 'manual promotion did not demote and deactivate prior default C';
  END IF;

  SELECT *
    INTO v_selected
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_selected.id IS DISTINCT FROM v_manual_d OR v_selected.account_last4 <> '3999' THEN
    RAISE EXCEPTION 'picker should return manually promoted D, got %', row_to_json(v_selected);
  END IF;

  BEGIN
    INSERT INTO public.vendor_banking_link_tokens (vendor_id, intent)
    VALUES (v_vendor, 'bogus');
    RAISE EXCEPTION 'invalid intent bypassed check constraint';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  RESET ROLE;

  RAISE NOTICE 'Vendor banking change intent acceptance assertions passed';
END $$;

ROLLBACK;
