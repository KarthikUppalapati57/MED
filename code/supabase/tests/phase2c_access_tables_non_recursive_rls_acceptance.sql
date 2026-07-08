BEGIN;

CREATE TEMP TABLE phase2c_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE phase2c_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON phase2c_ids TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON phase2c_results TO authenticated, anon;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_loc_mgr uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_target_ground uuid := gen_random_uuid();
  v_target_loc_mgr uuid := gen_random_uuid();
  v_brand2_ground uuid := gen_random_uuid();
  v_role_ground uuid := gen_random_uuid();
  v_role_location uuid := gen_random_uuid();
  v_role_branch uuid := gen_random_uuid();
  v_role_owner uuid := gen_random_uuid();
BEGIN
  INSERT INTO phase2c_ids(key, value) VALUES
    ('org', v_org), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner', v_owner), ('branch', v_branch), ('loc_mgr', v_loc_mgr), ('ground', v_ground),
    ('target_ground', v_target_ground), ('target_loc_mgr', v_target_loc_mgr), ('brand2_ground', v_brand2_ground),
    ('role_ground', v_role_ground), ('role_location', v_role_location), ('role_branch', v_role_branch), ('role_owner', v_role_owner);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'phase2c-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'phase2c-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr, 'authenticated', 'authenticated', 'phase2c-locmgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'phase2c-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_target_ground, 'authenticated', 'authenticated', 'phase2c-target-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_target_loc_mgr, 'authenticated', 'authenticated', 'phase2c-target-locmgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_brand2_ground, 'authenticated', 'authenticated', 'phase2c-brand2-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Phase 2c Org', 'phase-2c-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Phase 2c Brand 1'), (v_brand2, v_org, 'Phase 2c Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org, 'Phase 2c Location 1'), (v_loc2, v_brand2, v_org, 'Phase 2c Location 2');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner, 'phase2c-owner@example.test', 'Phase 2c Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_branch, 'phase2c-branch@example.test', 'Phase 2c Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand'),
    (v_loc_mgr, 'phase2c-locmgr@example.test', 'Phase 2c Location Manager', 'location_manager', v_org, v_brand1, v_loc1, 'location'),
    (v_ground, 'phase2c-ground@example.test', 'Phase 2c Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location'),
    (v_target_ground, 'phase2c-target-ground@example.test', 'Phase 2c Target Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location'),
    (v_target_loc_mgr, 'phase2c-target-locmgr@example.test', 'Phase 2c Target Location Manager', 'location_manager', v_org, v_brand1, v_loc1, 'location'),
    (v_brand2_ground, 'phase2c-brand2-ground@example.test', 'Phase 2c Brand 2 Ground', 'ground_staff', v_org, v_brand2, v_loc2, 'location')
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

  INSERT INTO public.roles (id, name, organization_id, is_system)
  SELECT v_role_location, 'location_manager', NULL, true
  WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'location_manager' AND is_system IS TRUE);

  UPDATE phase2c_ids SET value = (SELECT id FROM public.roles WHERE name = 'ground_staff' AND is_system IS TRUE LIMIT 1) WHERE key = 'role_ground';
  UPDATE phase2c_ids SET value = (SELECT id FROM public.roles WHERE name = 'location_manager' AND is_system IS TRUE LIMIT 1) WHERE key = 'role_location';
  UPDATE phase2c_ids SET value = (SELECT id FROM public.roles WHERE name = 'branch_manager' AND is_system IS TRUE LIMIT 1) WHERE key = 'role_branch';
  UPDATE phase2c_ids SET value = (SELECT id FROM public.roles WHERE name = 'org_manager' AND is_system IS TRUE LIMIT 1) WHERE key = 'role_owner';

  SELECT value INTO v_role_ground FROM phase2c_ids WHERE key = 'role_ground';
  SELECT value INTO v_role_location FROM phase2c_ids WHERE key = 'role_location';
  SELECT value INTO v_role_branch FROM phase2c_ids WHERE key = 'role_branch';
  SELECT value INTO v_role_owner FROM phase2c_ids WHERE key = 'role_owner';

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_loc_mgr, 'location_manager'),
    (v_org, v_ground, 'ground_staff'),
    (v_org, v_target_ground, 'ground_staff'),
    (v_org, v_target_loc_mgr, 'location_manager');

  INSERT INTO public.brand_members (organization_id, brand_id, user_id, role)
  VALUES
    (v_org, v_brand1, v_branch, 'branch_manager'),
    (v_org, v_brand1, v_loc_mgr, 'location_manager'),
    (v_org, v_brand1, v_ground, 'ground_staff'),
    (v_org, v_brand1, v_target_ground, 'ground_staff'),
    (v_org, v_brand1, v_target_loc_mgr, 'location_manager'),
    (v_org, v_brand2, v_brand2_ground, 'ground_staff');

  INSERT INTO public.location_members (organization_id, location_id, user_id, role)
  VALUES
    (v_org, v_loc1, v_loc_mgr, 'location_manager'),
    (v_org, v_loc1, v_ground, 'ground_staff'),
    (v_org, v_loc2, v_brand2_ground, 'ground_staff');

  INSERT INTO public.user_roles (organization_id, location_id, user_id, role_id)
  VALUES
    (v_org, v_loc1, v_loc_mgr, v_role_location),
    (v_org, v_loc1, v_ground, v_role_ground),
    (v_org, v_loc1, v_target_ground, v_role_ground),
    (v_org, v_loc1, v_target_loc_mgr, v_role_location),
    (v_org, v_loc2, v_brand2_ground, v_role_ground);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM phase2c_ids WHERE key='loc_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO phase2c_results
SELECT 'no_recursion_location_manager_selects_access_tables',
       (SELECT count(*) >= 1 FROM public.profiles)
       AND (SELECT count(*) >= 1 FROM public.organization_members)
       AND (SELECT count(*) >= 1 FROM public.brand_members)
       AND (SELECT count(*) >= 1 FROM public.location_members)
       AND (SELECT count(*) >= 1 FROM public.user_roles),
       'selects completed without stack-depth error';

INSERT INTO phase2c_results
SELECT 'read_scope_own_and_location_memberships',
       EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT value FROM phase2c_ids WHERE key='loc_mgr'))
       AND NOT EXISTS (SELECT 1 FROM public.location_members WHERE location_id = (SELECT value FROM phase2c_ids WHERE key='loc2')),
       'location manager sees own/in-location rows, not sibling location rows';

DO $$
BEGIN
  BEGIN
    UPDATE public.profiles
       SET role = 'org_manager'
     WHERE id = (SELECT value FROM phase2c_ids WHERE key='loc_mgr');
    INSERT INTO phase2c_results VALUES ('location_manager_direct_profile_self_promotion_rejected', false, 'profile role update unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('location_manager_direct_profile_self_promotion_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.user_roles (organization_id, location_id, user_id, role_id)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='loc1'),
      (SELECT value FROM phase2c_ids WHERE key='loc_mgr'),
      (SELECT value FROM phase2c_ids WHERE key='role_owner')
    );
    INSERT INTO phase2c_results VALUES ('location_manager_user_roles_self_promotion_rejected', false, 'self user_roles insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('location_manager_user_roles_self_promotion_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.location_members (organization_id, location_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='loc2'),
      gen_random_uuid(),
      'ground_staff'
    );
    INSERT INTO phase2c_results VALUES ('location_manager_cross_location_write_rejected', false, 'cross-location insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('location_manager_cross_location_write_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.location_members (organization_id, location_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='loc1'),
      (SELECT value FROM phase2c_ids WHERE key='target_ground'),
      'ground_staff'
    );
    INSERT INTO phase2c_results VALUES ('location_manager_can_add_ground_staff_own_location', true, 'own-location ground_staff insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('location_manager_can_add_ground_staff_own_location', false, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM phase2c_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO phase2c_results
SELECT 'branch_manager_cannot_read_brand2_membership',
       NOT EXISTS (SELECT 1 FROM public.brand_members WHERE brand_id = (SELECT value FROM phase2c_ids WHERE key='brand2')),
       'brand2 brand_members hidden from brand1 branch_manager';

DO $$
BEGIN
  BEGIN
    UPDATE public.profiles
       SET role = 'org_manager'
     WHERE id = (SELECT value FROM phase2c_ids WHERE key='branch');
    INSERT INTO phase2c_results VALUES ('branch_manager_direct_profile_self_promotion_rejected', false, 'profile role update unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('branch_manager_direct_profile_self_promotion_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.brand_members (organization_id, brand_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='brand1'),
      (SELECT value FROM phase2c_ids WHERE key='target_ground'),
      'org_manager'
    );
    INSERT INTO phase2c_results VALUES ('branch_manager_cannot_grant_org_manager', false, 'grant org_manager unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('branch_manager_cannot_grant_org_manager', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.brand_members (organization_id, brand_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='brand1'),
      (SELECT value FROM phase2c_ids WHERE key='target_ground'),
      'branch_manager'
    );
    INSERT INTO phase2c_results VALUES ('branch_manager_cannot_grant_peer_branch_manager', false, 'grant branch_manager unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('branch_manager_cannot_grant_peer_branch_manager', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.location_members (organization_id, location_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='loc1'),
      (SELECT value FROM phase2c_ids WHERE key='target_loc_mgr'),
      'location_manager'
    );
    INSERT INTO phase2c_results VALUES ('branch_manager_can_onboard_location_manager_in_brand', true, 'location_manager insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('branch_manager_can_onboard_location_manager_in_brand', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.location_members (organization_id, location_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='loc2'),
      (SELECT value FROM phase2c_ids WHERE key='brand2_ground'),
      'ground_staff'
    );
    INSERT INTO phase2c_results VALUES ('branch_manager_cross_brand_write_rejected', false, 'cross-brand insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('branch_manager_cross_brand_write_rejected', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM phase2c_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (
      (SELECT value FROM phase2c_ids WHERE key='org'),
      (SELECT value FROM phase2c_ids WHERE key='brand2_ground'),
      'branch_manager'
    );
    INSERT INTO phase2c_results VALUES ('owner_can_modify_membership_across_org', true, 'owner inserted branch_manager membership');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('owner_can_modify_membership_across_org', false, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);

DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.profiles;
    PERFORM count(*) FROM public.organization_members;
    PERFORM count(*) FROM public.brand_members;
    PERFORM count(*) FROM public.location_members;
    PERFORM count(*) FROM public.user_roles;
    INSERT INTO phase2c_results VALUES ('anon_cannot_read_access_tables', false, 'anon reads unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('anon_cannot_read_access_tables', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'ground_staff');
    INSERT INTO phase2c_results VALUES ('anon_cannot_write_access_tables', false, 'anon write unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO phase2c_results VALUES ('anon_cannot_write_access_tables', true, SQLERRM);
  END;
END $$;

RESET ROLE;

INSERT INTO phase2c_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.organization_members', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.brand_members', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.location_members', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.user_roles', 'TRUNCATE'),
       'anon truncate privilege revoked on all five tables';

SELECT * FROM phase2c_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM phase2c_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Phase 2c access-table acceptance failed';
  END IF;
END $$;

ROLLBACK;
