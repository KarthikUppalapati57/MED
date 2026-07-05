BEGIN;

CREATE TEMP TABLE _ids(k text primary key, id uuid) ON COMMIT DROP;
INSERT INTO _ids(k, id) VALUES
  ('org', gen_random_uuid()),
  ('brand1', gen_random_uuid()),
  ('brand2', gen_random_uuid()),
  ('loc1', gen_random_uuid()),
  ('loc2', gen_random_uuid()),
  ('branch_mgr', gen_random_uuid()),
  ('loc_mgr', gen_random_uuid());
GRANT SELECT ON _ids TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id,
       '00000000-0000-0000-0000-000000000000',
       'authenticated',
       'authenticated',
       k || '@context-plumbing-test.local',
       '{}'::jsonb,
       '{}'::jsonb,
       now(),
       now()
FROM _ids
WHERE k IN ('branch_mgr', 'loc_mgr');

INSERT INTO public.organizations (id, name, slug, enabled_modules)
SELECT id, 'Context Plumbing Test Org', 'context-plumbing-test-' || substr(id::text, 1, 8), '[]'::jsonb
FROM _ids
WHERE k = 'org';

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES
  ((SELECT id FROM _ids WHERE k = 'brand1'), (SELECT id FROM _ids WHERE k = 'org'), 'Brand 1'),
  ((SELECT id FROM _ids WHERE k = 'brand2'), (SELECT id FROM _ids WHERE k = 'org'), 'Brand 2');

INSERT INTO public.locations (id, brand_id, organization_id, name)
VALUES
  ((SELECT id FROM _ids WHERE k = 'loc1'), (SELECT id FROM _ids WHERE k = 'brand1'), (SELECT id FROM _ids WHERE k = 'org'), 'Location 1'),
  ((SELECT id FROM _ids WHERE k = 'loc2'), (SELECT id FROM _ids WHERE k = 'brand2'), (SELECT id FROM _ids WHERE k = 'org'), 'Location 2');

UPDATE public.profiles
   SET email = 'branch_mgr@context-plumbing-test.local',
       full_name = 'Branch Manager',
       role = 'branch_manager',
       organization_id = (SELECT id FROM _ids WHERE k = 'org'),
       brand_id = (SELECT id FROM _ids WHERE k = 'brand1'),
       location_id = NULL,
       access_level = 'brand',
       status = 'active'
 WHERE id = (SELECT id FROM _ids WHERE k = 'branch_mgr');

UPDATE public.profiles
   SET email = 'loc_mgr@context-plumbing-test.local',
       full_name = 'Location Manager',
       role = 'location_manager',
       organization_id = (SELECT id FROM _ids WHERE k = 'org'),
       brand_id = (SELECT id FROM _ids WHERE k = 'brand1'),
       location_id = (SELECT id FROM _ids WHERE k = 'loc1'),
       access_level = 'location',
       status = 'active'
 WHERE id = (SELECT id FROM _ids WHERE k = 'loc_mgr');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  ((SELECT id FROM _ids WHERE k = 'org'), (SELECT id FROM _ids WHERE k = 'branch_mgr'), 'branch_manager'),
  ((SELECT id FROM _ids WHERE k = 'org'), (SELECT id FROM _ids WHERE k = 'loc_mgr'), 'location_manager');

INSERT INTO public.brand_members (organization_id, brand_id, user_id, role)
VALUES
  ((SELECT id FROM _ids WHERE k = 'org'), (SELECT id FROM _ids WHERE k = 'brand1'), (SELECT id FROM _ids WHERE k = 'branch_mgr'), 'branch_manager');

INSERT INTO public.location_members (organization_id, location_id, user_id, role)
VALUES
  ((SELECT id FROM _ids WHERE k = 'org'), (SELECT id FROM _ids WHERE k = 'loc1'), (SELECT id FROM _ids WHERE k = 'loc_mgr'), 'location_manager');

SELECT 'seeded_ids' AS test,
       (SELECT id FROM _ids WHERE k = 'org') AS org_id,
       (SELECT id FROM _ids WHERE k = 'brand1') AS brand1_id,
       (SELECT id FROM _ids WHERE k = 'brand2') AS brand2_id,
       (SELECT id FROM _ids WHERE k = 'loc1') AS loc1_id,
       (SELECT id FROM _ids WHERE k = 'loc2') AS loc2_id,
       (SELECT id FROM _ids WHERE k = 'branch_mgr') AS branch_manager_user_id,
       (SELECT id FROM _ids WHERE k = 'loc_mgr') AS location_manager_user_id;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (SELECT id FROM _ids WHERE k = 'branch_mgr')::text,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'branch_manager')
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.brands
  WHERE organization_id = (SELECT id FROM _ids WHERE k = 'org');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'branch_manager expected 1 brand, got %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.brands WHERE brand_id = (SELECT id FROM _ids WHERE k = 'brand2')
  ) THEN
    RAISE EXCEPTION 'branch_manager saw brand2';
  END IF;

  RAISE NOTICE 'PASS branch_manager sees only brand1';
END $$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (SELECT id FROM _ids WHERE k = 'loc_mgr')::text,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'location_manager')
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_brand_count integer;
  v_location_count integer;
BEGIN
  SELECT count(*) INTO v_brand_count
  FROM public.brands
  WHERE organization_id = (SELECT id FROM _ids WHERE k = 'org');

  SELECT count(*) INTO v_location_count
  FROM public.locations
  WHERE brand_id = (SELECT id FROM _ids WHERE k = 'brand1');

  IF v_brand_count <> 1 THEN
    RAISE EXCEPTION 'location_manager expected 1 inherited brand, got %', v_brand_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.brands WHERE brand_id = (SELECT id FROM _ids WHERE k = 'brand2')
  ) THEN
    RAISE EXCEPTION 'location_manager saw brand2';
  END IF;

  IF v_location_count <> 1 THEN
    RAISE EXCEPTION 'location_manager expected 1 location, got %', v_location_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.locations WHERE id = (SELECT id FROM _ids WHERE k = 'loc2')
  ) THEN
    RAISE EXCEPTION 'location_manager saw loc2';
  END IF;

  RAISE NOTICE 'PASS location_manager sees only brand1 and loc1';
END $$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    SELECT public.switch_user_context(
      (SELECT id FROM _ids WHERE k = 'org'),
      (SELECT id FROM _ids WHERE k = 'brand2'),
      NULL
    ) INTO v_result;
    RAISE EXCEPTION 'location_manager switch to brand2 unexpectedly succeeded: %', v_result;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Brand % not in your accessible scope' THEN
        RAISE EXCEPTION 'location_manager switch to brand2 rejected with unexpected error: %', SQLERRM;
      END IF;
      RAISE NOTICE 'PASS location_manager switch to brand2 rejected';
  END;
END $$;

SELECT public.switch_user_context(
  (SELECT id FROM _ids WHERE k = 'org'),
  (SELECT id FROM _ids WHERE k = 'brand1'),
  (SELECT id FROM _ids WHERE k = 'loc1')
) AS loc_manager_valid_switch_result;

RESET ROLE;

DO $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_meta jsonb;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = (SELECT id FROM _ids WHERE k = 'loc_mgr');

  IF v_profile.brand_id IS DISTINCT FROM (SELECT id FROM _ids WHERE k = 'brand1')
     OR v_profile.location_id IS DISTINCT FROM (SELECT id FROM _ids WHERE k = 'loc1') THEN
    RAISE EXCEPTION 'valid switch did not update profile scope correctly';
  END IF;

  SELECT raw_app_meta_data INTO v_meta
  FROM auth.users
  WHERE id = (SELECT id FROM _ids WHERE k = 'loc_mgr');

  IF v_meta ? 'brand_id' OR v_meta ? 'location_id' OR v_meta ? 'organization_id' THEN
    RAISE EXCEPTION 'switch_user_context wrote scope into app_metadata: %', v_meta;
  END IF;

  RAISE NOTICE 'PASS valid switch updated profiles only';
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    EXECUTE 'TRUNCATE public.brands';
    RAISE EXCEPTION 'anon TRUNCATE public.brands unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS anon TRUNCATE public.brands denied';
  END;
END $$;
RESET ROLE;

ROLLBACK;
