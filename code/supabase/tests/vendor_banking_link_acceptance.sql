BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_vendor uuid;
  v_link jsonb;
  v_link2 jsonb;
  v_token text;
  v_expired_token text;
  v_submitted_token text;
  v_bank_id uuid;
  v_audit jsonb;
  v_count integer;
  v_expires_at timestamptz;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (
    v_user,
    'vendor-link-manager@example.test',
    crypt('password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Vendor Banking Link Org', 'vendor-banking-link-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Vendor Banking Link Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Vendor Banking Link Location');

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
  VALUES (v_org, v_brand, v_location, 'Vendor Link Supplier', 'active')
  RETURNING id INTO v_vendor;

  -- issue_vendor_banking_link now requires tax verification_status='verified' plus an on-file
  -- W-9 before it will issue a link (VO-RULE-005) -- this test predates that gate.
  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, file_name, storage_path, status, uploaded_via)
  VALUES (v_vendor, v_org, v_brand, v_location, 'w9', 'w9.pdf', 'w9_documents/banking_link_test.pdf', 'on_file', 'admin_upload');

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, verification_status, w9_status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'verified', 'verified');

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor);
  v_token := v_link->>'token';
  v_expires_at := (v_link->>'expires_at')::timestamptz;

  IF v_token IS NULL OR length(v_token) <> 64 OR v_token !~ '^[0-9a-f]+$' THEN
    RAISE EXCEPTION 'expected 64-char hex crypto token, got %', v_token;
  END IF;

  IF v_expires_at < now() + interval '6 days 23 hours'
     OR v_expires_at > now() + interval '7 days 1 hour' THEN
    RAISE EXCEPTION 'expected expiry approximately 7 days out, got %', v_expires_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_link_tokens
    WHERE id = (v_link->>'id')::uuid
      AND vendor_id = v_vendor
      AND organization_id = v_org
      AND brand_id = v_brand
      AND location_id = v_location
      AND status = 'pending'
      AND created_by = v_user
  ) THEN
    RAISE EXCEPTION 'issued token not pending and scoped to vendor/user';
  END IF;

  BEGIN
    PERFORM token FROM public.vendor_banking_link_tokens WHERE id = (v_link->>'id')::uuid;
    RAISE EXCEPTION 'authenticated could SELECT vendor banking token column';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_token, '000111222333', '021000021');
    RAISE EXCEPTION 'authenticated could execute submit_vendor_banking_via_link';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;
  SET LOCAL ROLE anon;

  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_token, '000111222333', '021000021');
    RAISE EXCEPTION 'anon could execute submit_vendor_banking_via_link';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;
  SET LOCAL ROLE service_role;

  SELECT public.submit_vendor_banking_via_link(v_token, '000111222333', '021000021')
    INTO v_link;
  v_bank_id := (v_link->>'banking_row_id')::uuid;

  IF v_bank_id IS NULL THEN
    RAISE EXCEPTION 'submit did not return banking row id: %', v_link;
  END IF;

  SELECT public.get_vendor_banking_for_audit(v_bank_id)
    INTO v_audit;

  IF v_audit->>'account' <> '000111222333' OR v_audit->>'routing' <> '021000021' THEN
    RAISE EXCEPTION 'Vault audit payload mismatch: %', v_audit;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_link_tokens
    WHERE token = v_token
      AND status = 'submitted'
      AND submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'valid submit did not mark token submitted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = v_user
      AND organization_id = v_org
      AND title = 'Vendor banking callback required'
      AND metadata->>'banking_row_id' = v_bank_id::text
  ) THEN
    RAISE EXCEPTION 'vendor banking submit did not notify creator';
  END IF;

  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_token, '999888777666', '011000015');
    RAISE EXCEPTION 'already-submitted token was accepted';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM <> 'Invalid or expired banking link' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor);
  v_expired_token := v_link->>'token';

  RESET ROLE;
  SET LOCAL ROLE service_role;

  UPDATE public.vendor_banking_link_tokens
     SET expires_at = now() - interval '1 minute'
   WHERE token = v_expired_token;

  BEGIN
    PERFORM public.submit_vendor_banking_via_link(v_expired_token, '111222333444', '021000021');
    RAISE EXCEPTION 'expired token was accepted';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM <> 'Invalid or expired banking link' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_link := public.issue_vendor_banking_link(v_vendor);
  v_submitted_token := v_link->>'token';
  v_link2 := public.issue_vendor_banking_link(v_vendor);

  RESET ROLE;
  SET LOCAL ROLE service_role;

  SELECT count(*)
    INTO v_count
  FROM public.vendor_banking_link_tokens
  WHERE vendor_id = v_vendor
    AND token = v_submitted_token
    AND status = 'cancelled';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'reissue did not cancel prior pending token';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.vendor_banking_link_tokens
  WHERE vendor_id = v_vendor
    AND status = 'pending'
    AND deleted_at IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one pending token after reissue, got %', v_count;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'Vendor banking link acceptance assertions passed';
END $$;

ROLLBACK;
