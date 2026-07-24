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
  v_unverified_vendor uuid;
  v_result jsonb;
  v_count integer;
  v_callback_status text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_manager, 'admin-bank-entry-manager@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org, 'Admin Bank Entry Org', 'admin-bank-entry-' || replace(v_org::text, '-', '')),
    (v_other_org, 'Admin Bank Entry Other Org', 'admin-bank-entry-other-' || replace(v_other_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand, v_org, 'Admin Bank Entry Brand'),
    (v_other_brand, v_other_org, 'Admin Bank Entry Other Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location, v_org, v_brand, 'Admin Bank Entry Location'),
    (v_other_location, v_other_org, v_other_brand, 'Admin Bank Entry Other Location');

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

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, onboarding_status)
  VALUES (v_org, v_brand, v_location, 'Admin Bank Entry Vendor', 'active', 'tax_submitted')
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, onboarding_status)
  VALUES (v_other_org, v_other_brand, v_other_location, 'Admin Bank Entry Other Vendor', 'active', 'tax_submitted')
  RETURNING id INTO v_other_vendor;

  -- admin_submit_vendor_banking_info now enforces the same tax-verified + W-9-on-file gate as
  -- issue_vendor_banking_link (VO-RULE-005) -- satisfy it for the in-scope vendor being tested.
  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, file_name, storage_path, status, uploaded_via)
  VALUES (v_vendor, v_org, v_brand, v_location, 'w9', 'w9.pdf', 'w9_documents/admin_bank_fmt_test.pdf', 'on_file', 'admin_upload');

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, verification_status, w9_status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'verified', 'verified');

  -- In-scope but not tax-verified yet -- proves the DB-side gate, not just the UI's disabled prop.
  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, onboarding_status)
  VALUES (v_org, v_brand, v_location, 'Admin Bank Entry Unverified Vendor', 'active', 'tax_submitted')
  RETURNING id INTO v_unverified_vendor;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_manager::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- In-scope vendor without a verified tax record is rejected, same gate issue_vendor_banking_link uses.
  BEGIN
    PERFORM public.admin_submit_vendor_banking_info(v_unverified_vendor, '000111222333', '021000021', 'add');
    RAISE EXCEPTION 'manager entered banking info for a tax-unverified vendor';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%not verified%' THEN
        RAISE;
      END IF;
  END;

  -- Out-of-scope vendor (different org) is rejected.
  BEGIN
    PERFORM public.admin_submit_vendor_banking_info(v_other_vendor, '000111222333', '021000021', 'add');
    RAISE EXCEPTION 'manager entered banking info for an out-of-scope vendor';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%Access denied%' THEN
        RAISE;
      END IF;
  END;

  -- Malformed routing is rejected, same floor as the magic-link RPC.
  BEGIN
    PERFORM public.admin_submit_vendor_banking_info(v_vendor, '000111222333', '12345678', 'add');
    RAISE EXCEPTION '8-digit routing number was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%routing number%' THEN
        RAISE;
      END IF;
  END;

  -- Valid manual entry succeeds.
  v_result := public.admin_submit_vendor_banking_info(v_vendor, '000111222333', '021000021', 'add');
  IF (v_result->>'account_last4') <> '2333' THEN
    RAISE EXCEPTION 'expected account_last4 2333, got %', v_result;
  END IF;

  -- Manual entry does NOT bypass callback verification (VO-RULE-015) -- still pending/unverified
  -- until confirm_vendor_banking_callback or an explicit override runs, same as the vendor path.
  IF (v_result->>'callback_status') <> 'pending' OR (v_result->>'verification_state') <> 'pending' THEN
    RAISE EXCEPTION 'manually-entered banking row must still require callback verification, got %', v_result;
  END IF;

  -- vendor_banking_details is branch_manager+-tier readable; a location_manager can call the
  -- RPC but can't directly SELECT the row it created, so verify as postgres.
  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.vendor_banking_details
  WHERE vendor_id = v_vendor
    AND account_last4 = '2333'
    AND callback_status = 'pending'
    AND created_by = v_manager;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one manually-entered banking_details row, got %', v_count;
  END IF;

  SELECT callback_status INTO v_callback_status
  FROM public.vendor_banking_change_requests
  WHERE vendor_id = v_vendor AND requested_by = v_manager;
  IF v_callback_status <> 'not_started' THEN
    RAISE EXCEPTION 'expected a not_started callback change request, got %', v_callback_status;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = v_vendor
    AND event_type = 'banking_submitted'
    AND actor_type = 'admin'
    AND actor_id = v_manager
    AND metadata->>'entry_method' = 'manual';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one admin-attributed banking_submitted audit event, got %', v_count;
  END IF;

  -- postgres bypasses grants too, so this doubles as proof the manually-entered numbers
  -- actually made it into the vault.
  DECLARE
    v_secret jsonb;
  BEGIN
    SELECT public.get_vendor_banking_for_audit((v_result->>'banking_row_id')::uuid) INTO v_secret;
    IF v_secret->>'account' <> '000111222333' OR v_secret->>'routing' <> '021000021' THEN
      RAISE EXCEPTION 'expected vaulted account/routing to match manual entry, got %', v_secret;
    END IF;
  END;

  RAISE NOTICE 'admin manual vendor banking entry acceptance assertions passed';
END $$;

ROLLBACK;
