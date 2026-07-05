BEGIN;

CREATE TEMP TABLE vendor_approval_containment_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON vendor_approval_containment_ids TO authenticated;

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
  v_vendor_brand1 uuid;
  v_vendor_brand2 uuid;
  v_vendor_location1 uuid;
BEGIN
  INSERT INTO vendor_approval_containment_ids(key, value) VALUES
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
    (v_owner, 'authenticated', 'authenticated', 'vendor-approval-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'vendor-approval-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'vendor-approval-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Vendor Approval Containment Org', 'vendor-approval-containment-' || replace(v_org::text, '-', ''), v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Vendor Approval Brand 1'),
    (v_brand2, v_org, 'Vendor Approval Brand 2');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location1, v_org, v_brand1, 'Vendor Approval Location 1'),
    (v_location2, v_org, v_brand2, 'Vendor Approval Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id, access_level
  ) VALUES
    (v_owner, 'vendor-approval-owner@example.test', 'Vendor Approval Owner', 'org_owner', v_org, NULL, NULL, 'organization'),
    (v_branch, 'vendor-approval-branch@example.test', 'Vendor Approval Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand'),
    (v_location_manager, 'vendor-approval-location@example.test', 'Vendor Approval Location', 'location_manager', v_org, v_brand1, v_location1, 'location')
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
    (v_org, v_owner, 'org_owner'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_location_manager, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, created_by)
  VALUES (v_org, v_brand1, NULL, 'Vendor Approval Brand 1 Vendor', 'active', v_owner)
  RETURNING id INTO v_vendor_brand1;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, created_by)
  VALUES (v_org, v_brand1, v_location1, 'Vendor Approval Location 1 Vendor', 'active', v_owner)
  RETURNING id INTO v_vendor_location1;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, created_by)
  VALUES (v_org, v_brand2, NULL, 'Vendor Approval Brand 2 Vendor', 'active', v_owner)
  RETURNING id INTO v_vendor_brand2;

  INSERT INTO vendor_approval_containment_ids(key, value) VALUES
    ('vendor_brand1', v_vendor_brand1),
    ('vendor_location1', v_vendor_location1),
    ('vendor_brand2', v_vendor_brand2);
END $$;

DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_containment_ids WHERE key = 'location_manager'),
      'role', 'authenticated'
    )::text,
    true
  );

  BEGIN
    UPDATE public.vendors
       SET approval_status = 'approved'
     WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_location1');
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'location_manager direct vendor approval was allowed';
  END IF;

  v_rejected := false;

  BEGIN
    INSERT INTO public.vendors (
      organization_id,
      brand_id,
      location_id,
      name,
      status,
      approval_status,
      created_by
    ) VALUES (
      (SELECT value FROM vendor_approval_containment_ids WHERE key = 'org'),
      (SELECT value FROM vendor_approval_containment_ids WHERE key = 'brand1'),
      (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location1'),
      'Location Manager Insert Approved Vendor',
      'active',
      'approved',
      (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location_manager')
    );
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'location_manager direct approved vendor insert was allowed';
  END IF;

  INSERT INTO public.vendors (
    organization_id,
    brand_id,
    location_id,
    name,
    status,
    created_by
  ) VALUES (
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'org'),
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'brand1'),
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location1'),
    'Location Manager Insert Default Draft Vendor',
    'active',
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location_manager')
  );

  INSERT INTO public.vendors (
    organization_id,
    brand_id,
    location_id,
    name,
    status,
    approval_status,
    created_by
  ) VALUES (
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'org'),
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'brand1'),
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location1'),
    'Location Manager Insert Explicit Draft Vendor',
    'active',
    'draft',
    (SELECT value FROM vendor_approval_containment_ids WHERE key = 'location_manager')
  );

  RESET ROLE;
END $$;

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_containment_ids WHERE key = 'owner'),
      'role', 'authenticated'
    )::text,
    true
  );

  UPDATE public.vendors
     SET approval_status = 'approved'
   WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand2');

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendors
    WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand2')
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'org_owner direct vendor approval did not persist';
  END IF;

  UPDATE public.vendors
     SET approval_status = 'draft'
   WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand2');

  RESET ROLE;
END $$;

DO $$
DECLARE
  v_rows integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', (SELECT value::text FROM vendor_approval_containment_ids WHERE key = 'branch'),
      'role', 'authenticated'
    )::text,
    true
  );

  UPDATE public.vendors
     SET approval_status = 'approved'
   WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand1');

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendors
    WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand1')
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'in-brand branch_manager direct vendor approval did not persist';
  END IF;

  BEGIN
    UPDATE public.vendors
       SET approval_status = 'approved'
     WHERE id = (SELECT value FROM vendor_approval_containment_ids WHERE key = 'vendor_brand2');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION
    WHEN insufficient_privilege OR raise_exception THEN
      v_rows := 0;
  END;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'out-of-brand branch_manager direct vendor approval was allowed';
  END IF;

  RESET ROLE;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.vendors'::regclass
      AND tgname = 'enforce_vendor_approval_authorization'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'vendor approval containment trigger missing';
  END IF;

  RAISE NOTICE 'Vendor approval containment acceptance assertions passed';
END $$;

ROLLBACK;


