BEGIN;

CREATE TEMP TABLE vendor_duplicate_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_duplicate_ids TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_location1 uuid := gen_random_uuid();
  v_location2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_sysco uuid;
  v_sysco_blacklisted uuid;
  v_sysco_sibling uuid;
  v_tax uuid;
BEGIN
  INSERT INTO vendor_duplicate_ids(key, value) VALUES
    ('org', v_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('location1', v_location1),
    ('location2', v_location2),
    ('owner', v_owner),
    ('location_manager', v_location_manager);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'vendor-duplicate-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'vendor-duplicate-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Vendor Duplicate Org', 'vendor-duplicate-' || replace(v_org::text, '-', ''), v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Vendor Duplicate Brand 1'),
    (v_brand2, v_org, 'Vendor Duplicate Brand 2');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location1, v_org, v_brand1, 'Vendor Duplicate Location 1'),
    (v_location2, v_org, v_brand2, 'Vendor Duplicate Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id, access_level
  ) VALUES
    (v_owner, 'vendor-duplicate-owner@example.test', 'Vendor Duplicate Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_location_manager, 'vendor-duplicate-location@example.test', 'Vendor Duplicate Location', 'location_manager', v_org, v_brand1, v_location1, 'location')
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
    (v_org, v_location_manager, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, email, status, approval_status, created_by)
  VALUES (v_org, v_brand1, v_location1, 'sysco', 'ap@sysco.example', 'active', 'draft', v_owner)
  RETURNING id INTO v_sysco;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, email, status, approval_status, created_by)
  VALUES (v_org, v_brand1, v_location1, 'Sysco', 'blocked@sysco.example', 'blacklisted', 'draft', v_owner)
  RETURNING id INTO v_sysco_blacklisted;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, email, status, approval_status, created_by)
  VALUES (v_org, v_brand2, v_location2, 'sysco', 'sibling@sysco.example', 'active', 'draft', v_owner)
  RETURNING id INTO v_sysco_sibling;

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, legal_name, tax_id_last4, w9_status)
  VALUES (v_sysco, v_org, v_brand1, v_location1, 'Sysco Legal', '6789', 'verified')
  RETURNING id INTO v_tax;

  INSERT INTO vendor_duplicate_ids(key, value) VALUES
    ('sysco', v_sysco),
    ('sysco_blacklisted', v_sysco_blacklisted),
    ('sysco_sibling', v_sysco_sibling),
    ('tax', v_tax);
END $$;

DO $$
DECLARE
  v_count integer;
  v_likely_count integer;
  v_possible_count integer;
  v_first_vendor uuid;
  v_first_confidence text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_duplicate_ids WHERE key = 'owner'),
      'role', 'authenticated'
    )::text,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    '  SYSCO ',
    NULL,
    NULL
  );

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'owner normalized-name duplicate count expected 3, got %', v_count;
  END IF;

  SELECT count(*) FILTER (WHERE confidence = 'likely'),
         count(*) FILTER (WHERE confidence = 'possible')
    INTO v_likely_count, v_possible_count
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    'sysco',
    NULL,
    '6789'
  );

  IF v_likely_count <> 1 OR v_possible_count <> 2 THEN
    RAISE EXCEPTION 'tax confidence expected likely=1 possible=2, got likely=% possible=%', v_likely_count, v_possible_count;
  END IF;

  SELECT vendor_id, confidence
    INTO v_first_vendor, v_first_confidence
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    'sysco',
    NULL,
    '6789'
  )
  LIMIT 1;

  IF v_first_vendor <> (SELECT value FROM vendor_duplicate_ids WHERE key = 'sysco')
     OR v_first_confidence <> 'likely' THEN
    RAISE EXCEPTION 'likely duplicate should be ordered first, got vendor=% confidence=%',
      v_first_vendor, v_first_confidence;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    'totally new vendor',
    NULL,
    NULL
  );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'new vendor name expected no candidates, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.find_duplicate_vendors(
      (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
      'sysco',
      NULL,
      NULL
    )
    WHERE vendor_id = (SELECT value FROM vendor_duplicate_ids WHERE key = 'sysco_blacklisted')
      AND status = 'blacklisted'
  ) THEN
    RAISE EXCEPTION 'blacklisted same-name vendor was not surfaced';
  END IF;

  RESET ROLE;
END $$;

DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_duplicate_ids WHERE key = 'location_manager'),
      'role', 'authenticated'
    )::text,
    true
  );

  SELECT count(*) INTO v_count
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    'sysco',
    NULL,
    NULL
  )
  WHERE vendor_id = (SELECT value FROM vendor_duplicate_ids WHERE key = 'sysco_sibling');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'location_manager saw out-of-scope duplicate candidate';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.find_duplicate_vendors(
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    'sysco',
    NULL,
    NULL
  );

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'location_manager expected only 2 in-scope sysco candidates, got %', v_count;
  END IF;

  RESET ROLE;
END $$;

DO $$
BEGIN
  INSERT INTO public.vendors (
    organization_id,
    brand_id,
    location_id,
    name,
    email,
    status,
    created_by
  ) VALUES (
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'org'),
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'brand1'),
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'location1'),
    'sysco',
    'another@sysco.example',
    'active',
    (SELECT value FROM vendor_duplicate_ids WHERE key = 'owner')
  );

  IF has_function_privilege('anon', 'public.find_duplicate_vendors(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon has EXECUTE on find_duplicate_vendors';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.find_duplicate_vendors(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lacks EXECUTE on find_duplicate_vendors';
  END IF;

  RAISE NOTICE 'Find duplicate vendors acceptance assertions passed';
END $$;

ROLLBACK;



