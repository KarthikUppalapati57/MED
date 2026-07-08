BEGIN;

CREATE TEMP TABLE vendor_approval_transition_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_approval_transition_ids TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_location1 uuid := gen_random_uuid();
  v_location2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_owner_vendor uuid;
  v_branch_vendor uuid;
  v_location_vendor uuid;
  v_out_of_brand_vendor uuid;
BEGIN
  INSERT INTO vendor_approval_transition_ids(key, value) VALUES
    ('org', v_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('location1', v_location1),
    ('location2', v_location2),
    ('owner', v_owner),
    ('branch', v_branch),
    ('location_manager', v_location_manager);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'vendor-transition-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'vendor-transition-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'vendor-transition-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Vendor Approval Transition Org', 'vendor-approval-transition-' || replace(v_org::text, '-', ''), v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Vendor Transition Brand 1'),
    (v_brand2, v_org, 'Vendor Transition Brand 2');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location1, v_org, v_brand1, 'Vendor Transition Location 1'),
    (v_location2, v_org, v_brand2, 'Vendor Transition Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id, access_level
  ) VALUES
    (v_owner, 'vendor-transition-owner@example.test', 'Vendor Transition Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_branch, 'vendor-transition-branch@example.test', 'Vendor Transition Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand'),
    (v_location_manager, 'vendor-transition-location@example.test', 'Vendor Transition Location', 'location_manager', v_org, v_brand1, v_location1, 'location')
  ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_location_manager, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, approval_status, created_by)
  VALUES (v_org, v_brand1, NULL, 'Vendor Transition Owner Vendor', 'active', 'draft', v_owner)
  RETURNING id INTO v_owner_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, approval_status, created_by)
  VALUES (v_org, v_brand1, NULL, 'Vendor Transition Branch Vendor', 'active', 'draft', v_owner)
  RETURNING id INTO v_branch_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, approval_status, created_by)
  VALUES (v_org, v_brand1, v_location1, 'Vendor Transition Location Vendor', 'active', 'draft', v_owner)
  RETURNING id INTO v_location_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, approval_status, created_by)
  VALUES (v_org, v_brand2, NULL, 'Vendor Transition Out Of Brand Vendor', 'active', 'draft', v_owner)
  RETURNING id INTO v_out_of_brand_vendor;

  INSERT INTO vendor_approval_transition_ids(key, value) VALUES
    ('owner_vendor', v_owner_vendor),
    ('branch_vendor', v_branch_vendor),
    ('location_vendor', v_location_vendor),
    ('out_of_brand_vendor', v_out_of_brand_vendor);
END $$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_transition_ids WHERE key = 'owner'),
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public.transition_vendor_approval(
    (SELECT value FROM vendor_approval_transition_ids WHERE key = 'owner_vendor'),
    'approved'
  );

  IF v_result->>'approval_status' <> 'approved' THEN
    RAISE EXCEPTION 'owner RPC did not return approved: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendors
    WHERE id = (SELECT value FROM vendor_approval_transition_ids WHERE key = 'owner_vendor')
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'owner RPC draft->approved did not persist';
  END IF;

  BEGIN
    PERFORM public.transition_vendor_approval(
      (SELECT value FROM vendor_approval_transition_ids WHERE key = 'owner_vendor'),
      'draft'
    );
    RAISE EXCEPTION 'authorized invalid approved->draft transition was allowed';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;

  RESET ROLE;
END $$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_transition_ids WHERE key = 'branch'),
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public.transition_vendor_approval(
    (SELECT value FROM vendor_approval_transition_ids WHERE key = 'branch_vendor'),
    'approved'
  );

  IF v_result->>'approval_status' <> 'approved' THEN
    RAISE EXCEPTION 'in-brand branch RPC did not return approved: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendors
    WHERE id = (SELECT value FROM vendor_approval_transition_ids WHERE key = 'branch_vendor')
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'in-brand branch RPC draft->approved did not persist';
  END IF;

  BEGIN
    PERFORM public.transition_vendor_approval(
      (SELECT value FROM vendor_approval_transition_ids WHERE key = 'out_of_brand_vendor'),
      'approved'
    );
    RAISE EXCEPTION 'out-of-brand branch RPC approval was allowed';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;

  BEGIN
    UPDATE public.vendors
       SET approval_status = 'approved'
     WHERE id = (SELECT value FROM vendor_approval_transition_ids WHERE key = 'out_of_brand_vendor');
    RAISE EXCEPTION 'out-of-brand branch direct UPDATE approval was allowed';
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      NULL;
  END;

  RESET ROLE;
END $$;

DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_transition_ids WHERE key = 'location_manager'),
      'role', 'authenticated'
    )::text,
    true
  );

  BEGIN
    PERFORM public.transition_vendor_approval(
      (SELECT value FROM vendor_approval_transition_ids WHERE key = 'location_vendor'),
      'approved'
    );
  EXCEPTION
    WHEN raise_exception THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'location_manager RPC approval was allowed';
  END IF;

  v_rejected := false;

  BEGIN
    UPDATE public.vendors
       SET approval_status = 'approved'
     WHERE id = (SELECT value FROM vendor_approval_transition_ids WHERE key = 'location_vendor');
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'location_manager direct UPDATE approval was allowed while RPC rejects';
  END IF;

  RESET ROLE;
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.transition_vendor_approval(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon has EXECUTE on transition_vendor_approval';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.transition_vendor_approval(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lacks EXECUTE on transition_vendor_approval';
  END IF;

  RAISE NOTICE 'Vendor approval transition RPC acceptance assertions passed';
END $$;

ROLLBACK;

