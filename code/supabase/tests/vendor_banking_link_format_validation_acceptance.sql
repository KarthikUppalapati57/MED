BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_vendor uuid;
  v_link jsonb;
  v_token text;
  v_count integer;
  v_status text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_user,
    'banking-format-manager@example.test',
    crypt('password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Banking Format Org', 'banking-format-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Banking Format Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Banking Format Location');

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

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, onboarding_status)
  VALUES (v_org, v_brand, v_location, 'Banking Format Vendor', 'active', 'tax_submitted')
  RETURNING id INTO v_vendor;

  -- issue_vendor_banking_link requires tax verification + an on-file W-9 first (VO-RULE-005);
  -- unrelated to format validation itself, just satisfying its precondition.
  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, file_name, storage_path, status, uploaded_via)
  VALUES (v_vendor, v_org, v_brand, v_location, 'w9', 'w9.pdf', 'w9_documents/fmt_test.pdf', 'on_file', 'vendor_magic_link');

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, verification_status, w9_status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'verified', 'verified');

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor);
  v_token := v_link->>'token';

  -- submit_vendor_banking_via_link is service_role-only (VO-SEC-008) -- the anonymous vendor
  -- portal calls it through the edge function's service-role client, never directly.
  RESET ROLE;
  SET LOCAL ROLE service_role;

  -- Malformed routing (8 digits, not 9): rejected before any row is written.
  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_token, '123456789', '12345678');
    RAISE EXCEPTION '8-digit routing number was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%routing number%' THEN
        RAISE;
      END IF;
  END;

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE vendor_id = v_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'malformed routing submission should not have created a banking_details row, got %', v_count;
  END IF;

  SELECT status INTO v_status FROM public.vendor_banking_link_tokens WHERE token = v_token;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'token should remain pending after a rejected malformed submission, got %', v_status;
  END IF;

  -- Malformed account (3 digits, below the 4-digit floor): also rejected.
  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_token, '123', '021000021');
    RAISE EXCEPTION '3-digit account number was accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%account number%' THEN
        RAISE;
      END IF;
  END;

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE vendor_id = v_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'malformed account submission should not have created a banking_details row, got %', v_count;
  END IF;

  -- Valid, formatted input (dashes/spaces stripped before the digit-count check) still works.
  PERFORM public.submit_vendor_banking_via_link(v_token, '000-111-2223', '021 000 021');

  SELECT count(*) INTO v_count FROM public.vendor_banking_details WHERE vendor_id = v_vendor;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'valid formatted banking submission expected to succeed, got % rows', v_count;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'vendor banking link format validation acceptance assertions passed';
END $$;

ROLLBACK;
