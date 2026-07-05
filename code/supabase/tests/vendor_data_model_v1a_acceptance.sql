BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_vendor uuid;
  v_org_level_vendor uuid;
  v_tax uuid;
  v_bank uuid;
  v_link uuid;
  v_count integer;
  v_text text;
  v_json jsonb;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_admin, 'v1a-admin@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_branch, 'v1a-branch@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_location, 'v1a-location@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_ground, 'v1a-ground@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'V1a Vendor Org', 'v1a-vendor-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'V1a Brand One'),
    (v_brand2, v_org, 'V1a Brand Two');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_loc1, v_org, v_brand1, 'V1a Location One'),
    (v_loc2, v_org, v_brand2, 'V1a Location Two');

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand1,
         location_id = NULL,
         role = 'org_owner',
         access_level = 'organization',
         updated_at = now()
   WHERE id = v_admin;

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand1,
         location_id = NULL,
         role = 'branch_manager',
         access_level = 'brand',
         updated_at = now()
   WHERE id = v_branch;

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand1,
         location_id = v_loc1,
         role = 'location_manager',
         access_level = 'location',
         updated_at = now()
   WHERE id = v_location;

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand1,
         location_id = v_loc1,
         role = 'ground_staff',
         access_level = 'location',
         updated_at = now()
   WHERE id = v_ground;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_admin, 'org_owner'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_location, 'location_manager'),
    (v_org, v_ground, 'ground_staff');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, payment_terms, bank_details)
  VALUES (v_org, v_brand1, NULL, 'V1a Vendor', 'active', 'net_30', '{"account":"should_not_stay"}'::jsonb)
  RETURNING id, bank_details INTO v_vendor, v_json;

  IF v_json <> '{}'::jsonb THEN
    RAISE EXCEPTION 'bank_details neutralize expected {}, got %', v_json;
  END IF;

  SELECT approval_status INTO v_text FROM public.vendors WHERE id = v_vendor;
  IF v_text <> 'draft' THEN
    RAISE EXCEPTION 'approval_status default expected draft, got %', v_text;
  END IF;

  BEGIN
    INSERT INTO public.vendors (organization_id, brand_id, name, status, approval_status)
    VALUES (v_org, v_brand1, 'Bad Approval Status Vendor', 'active', 'not_real');
    RAISE EXCEPTION 'invalid approval_status was accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO public.vendors (organization_id, brand_id, name, status, payment_terms)
  VALUES
    (v_org, v_brand1, 'Existing Term Vendor', 'inactive', 'net_60'),
    (v_org, v_brand1, 'New Term Vendor', 'blacklisted', 'net_7'),
    (v_org, v_brand1, 'Custom Term Vendor', 'active', 'custom');

  INSERT INTO public.vendor_tax_information (
    vendor_id, organization_id, brand_id, location_id, legal_name, w9_status
  )
  VALUES (
    v_vendor, gen_random_uuid(), v_brand2, v_loc2, 'V1a Vendor Legal', 'verified'
  )
  RETURNING id INTO v_tax;

  INSERT INTO public.vendor_banking_details (
    vendor_id, organization_id, brand_id, location_id, verification_state
  )
  VALUES (
    v_vendor, gen_random_uuid(), v_brand2, v_loc2, 'verified'
  )
  RETURNING id INTO v_bank;

  SET LOCAL ROLE service_role;
  PERFORM public.store_vendor_tax_secret(v_tax, '12-3456789');
  PERFORM public.store_vendor_banking_secret(v_bank, '000111222333', '021000021');
  RESET ROLE;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id, organization_id, brand_id, location_id, provider, provider_customer_ref, provider_funding_ref, provider_status
  )
  VALUES (
    v_vendor, gen_random_uuid(), v_brand2, v_loc2, 'dwolla', 'cust-secret', 'funding-secret', 'linked'
  )
  RETURNING id INTO v_link;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_tax_information
    WHERE id = v_tax
      AND organization_id = v_org
      AND brand_id = v_brand1
      AND location_id IS NULL
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'tax scope derive did not overwrite to vendor scope';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_bank
      AND organization_id = v_org
      AND brand_id = v_brand1
      AND location_id IS NULL
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'banking scope derive did not overwrite to vendor scope';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_payment_provider_links
    WHERE id = v_link
      AND organization_id = v_org
      AND brand_id = v_brand1
      AND location_id IS NULL
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'provider-link scope derive did not overwrite to vendor scope';
  END IF;

  INSERT INTO public.vendors (organization_id, name, status)
  VALUES (v_org, 'V1a Org Level Vendor', 'active')
  RETURNING id INTO v_org_level_vendor;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, account_last4)
  VALUES (v_org_level_vendor, v_org, '7666');

  INSERT INTO public.vendor_payment_provider_links (vendor_id, organization_id, provider, provider_customer_ref, provider_funding_ref)
  VALUES (v_org_level_vendor, v_org, 'stripe', 'org-customer-secret', 'org-funding-secret');

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.vendor_tax_information
  WHERE id = v_tax AND legal_name = 'V1a Vendor Legal';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'admin expected to read tax non-secret row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_banking_details
  WHERE id = v_bank AND account_last4 = '2333' AND verification_state = 'verified';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'admin expected to read banking masked row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_payment_provider_links
  WHERE id = v_link AND provider_status = 'linked';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'admin expected to read provider-link masked row, got %', v_count;
  END IF;

  BEGIN
    PERFORM public.get_vendor_tax_for_audit(v_tax);
    RAISE EXCEPTION 'authenticated admin could execute get_vendor_tax_for_audit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_vendor_banking_for_audit(v_bank);
    RAISE EXCEPTION 'authenticated admin could execute get_vendor_banking_for_audit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM provider_customer_ref, provider_funding_ref FROM public.vendor_payment_provider_links WHERE id = v_link;
    RAISE EXCEPTION 'authenticated admin could SELECT provider refs';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'vendor_tax_information' AND column_name = 'tax_id_full')
      OR (table_name = 'vendor_banking_details' AND column_name IN ('account_number', 'routing_number'))
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'raw vendor banking/tax columns should be absent, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'vendor_tax_information' AND column_name = 'tax_secret_id')
      OR (table_name = 'vendor_banking_details' AND column_name = 'banking_secret_id')
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'vendor Vault reference columns should be present, found %', v_count;
  END IF;

  RESET ROLE;
  SET LOCAL ROLE service_role;

  SELECT public.get_vendor_tax_for_audit(v_tax) INTO v_text;
  IF v_text <> '12-3456789' THEN
    RAISE EXCEPTION 'service_role expected to read tax secret, got %', v_text;
  END IF;

  SELECT public.get_vendor_banking_for_audit(v_bank) INTO v_json;
  IF v_json->>'account' <> '000111222333' OR v_json->>'routing' <> '021000021' THEN
    RAISE EXCEPTION 'service_role expected to read banking audit payload, got %', v_json;
  END IF;

  SELECT provider_customer_ref INTO v_text FROM public.vendor_payment_provider_links WHERE id = v_link;
  IF v_text <> 'cust-secret' THEN
    RAISE EXCEPTION 'service_role expected to read provider ref, got %', v_text;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_branch::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.vendor_tax_information WHERE id = v_tax;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'branch_manager should not read tax rows, got %', v_count;
  END IF;

  BEGIN
    INSERT INTO public.vendor_tax_information (vendor_id, organization_id, legal_name)
    VALUES (v_vendor, v_org, 'Branch Tax Write');
    RAISE EXCEPTION 'branch_manager tax insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
      NULL;
  END;

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE id = v_bank AND account_last4 = '2333';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'branch_manager expected to read brand banking row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.vendor_payment_provider_links WHERE id = v_link AND provider = 'dwolla';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'branch_manager expected to read brand provider-link row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_banking_details
  WHERE vendor_id = v_org_level_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'branch_manager should not read org-level brand-null banking, got %', v_count;
  END IF;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, account_last4)
  VALUES (v_vendor, v_org, '3123')
  RETURNING id INTO v_bank;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_location::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE vendor_id = v_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'location_manager should not read banking rows in V1a, got %', v_count;
  END IF;

  BEGIN
    INSERT INTO public.vendor_banking_details (vendor_id, organization_id, account_last4)
    VALUES (v_vendor, v_org, '6777');
    RAISE EXCEPTION 'location_manager banking insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
      NULL;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_ground::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE vendor_id = v_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ground_staff should not read banking rows, got %', v_count;
  END IF;

  BEGIN
    INSERT INTO public.vendor_payment_provider_links (vendor_id, organization_id, provider)
    VALUES (v_vendor, v_org, 'plaid');
    RAISE EXCEPTION 'ground_staff provider-link insert was allowed';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
      NULL;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_branch::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.vendors
  WHERE id = v_vendor;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'vendors reference-hybrid RLS regression: branch cannot see brand vendor, got %', v_count;
  END IF;

  RESET ROLE;
  SET LOCAL ROLE anon;

  BEGIN
    PERFORM id FROM public.vendor_tax_information LIMIT 1;
    RAISE EXCEPTION 'anon SELECT tax was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    EXECUTE 'TRUNCATE public.vendor_banking_details';
    RAISE EXCEPTION 'anon TRUNCATE banking was allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendors'
      AND policyname = 'operational_vendors_select'
      AND qual ILIKE '%reference_scope_visible%'
  ) THEN
    RAISE EXCEPTION 'vendors RLS policy no longer appears reference-hybrid';
  END IF;

  RAISE NOTICE 'V1a vendor data model acceptance assertions passed';
END $$;

ROLLBACK;
