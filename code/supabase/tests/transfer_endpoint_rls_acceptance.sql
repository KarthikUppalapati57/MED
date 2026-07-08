BEGIN;

CREATE TEMP TABLE transfer_rule_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE transfer_rule_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON transfer_rule_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON transfer_rule_results TO authenticated, anon, service_role;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_choto uuid := gen_random_uuid();
  v_seymore uuid := gen_random_uuid();
  v_third uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_choto_manager uuid := gen_random_uuid();
  v_seymore_manager uuid := gen_random_uuid();
  v_third_manager uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_transfer uuid := gen_random_uuid();
  v_intercompany uuid := gen_random_uuid();
  v_route uuid := gen_random_uuid();
BEGIN
  INSERT INTO transfer_rule_ids(key, value) VALUES
    ('org', v_org), ('other_org', v_other_org), ('brand1', v_brand1), ('brand2', v_brand2),
    ('choto', v_choto), ('seymore', v_seymore), ('third', v_third),
    ('owner', v_owner), ('branch', v_branch), ('choto_manager', v_choto_manager),
    ('seymore_manager', v_seymore_manager), ('third_manager', v_third_manager), ('ground', v_ground),
    ('transfer', v_transfer), ('intercompany', v_intercompany), ('route', v_route);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'transfer-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'transfer-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_choto_manager, 'authenticated', 'authenticated', 'transfer-choto@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_seymore_manager, 'authenticated', 'authenticated', 'transfer-seymore@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_third_manager, 'authenticated', 'authenticated', 'transfer-third@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'transfer-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES
    (v_org, 'Transfer Rule Org', 'transfer-rule-org', v_owner),
    (v_other_org, 'Transfer Rule Other Org', 'transfer-rule-other-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Craven Wings'),
    (v_brand2, v_org, 'Other Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name, is_commissary)
  VALUES
    (v_choto, v_brand1, v_org, 'Choto', true),
    (v_seymore, v_brand1, v_org, 'Seymore', false),
    (v_third, v_brand2, v_org, 'Unrelated Third', false);

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner, 'transfer-owner@example.test', 'Transfer Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_branch, 'transfer-branch@example.test', 'Transfer Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand'),
    (v_choto_manager, 'transfer-choto@example.test', 'Choto Manager', 'location_manager', v_org, v_brand1, v_choto, 'location'),
    (v_seymore_manager, 'transfer-seymore@example.test', 'Seymore Manager', 'location_manager', v_org, v_brand1, v_seymore, 'location'),
    (v_third_manager, 'transfer-third@example.test', 'Third Manager', 'location_manager', v_org, v_brand2, v_third, 'location'),
    (v_ground, 'transfer-ground@example.test', 'Ground Staff', 'ground_staff', v_org, v_brand1, v_choto, 'location')
  ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
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
    (v_org, v_choto_manager, 'location_manager'),
    (v_org, v_seymore_manager, 'location_manager'),
    (v_org, v_third_manager, 'location_manager'),
    (v_org, v_ground, 'ground_staff');

  INSERT INTO public.transfers (id, organization_id, from_location_id, to_location_id, status, items, created_by, notes)
  VALUES (v_transfer, v_org, v_choto, v_seymore, 'pending', '[{"product_name":"Sauce","quantity":2}]'::jsonb, v_choto_manager, 'Choto to Seymore');

  INSERT INTO public.intercompany_transfers (id, organization_id, from_location_id, to_location_id, items_json, total_amount, status, created_by)
  VALUES (v_intercompany, v_org, v_choto, v_seymore, '[{"name":"Batch Sauce","quantity":1}]'::jsonb, 25, 'pending', v_branch);

  INSERT INTO public.commissary_routes (id, organization_id, name, origin_location_id, status)
  VALUES (v_route, v_org, 'Choto to Seymore Route', v_choto, 'active');

  INSERT INTO public.commissary_route_stops (route_id, destination_location_id, stop_sequence, status)
  VALUES (v_route, v_seymore, 1, 'pending');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='choto_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO transfer_rule_results
SELECT 'choto_manager_sees_transfer_from_own_location',
       EXISTS (SELECT 1 FROM public.transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='transfer'))
       AND EXISTS (SELECT 1 FROM public.intercompany_transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='intercompany'))
       AND EXISTS (SELECT 1 FROM public.commissary_routes WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='route')),
       'from/origin endpoint visible';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.transfers (organization_id, from_location_id, to_location_id, status, items, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), 'pending', '[]'::jsonb, (SELECT value FROM transfer_rule_ids WHERE key='choto_manager'));
    INSERT INTO transfer_rule_results VALUES ('choto_manager_can_create_transfer_from_choto', true, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('choto_manager_can_create_transfer_from_choto', false, SQLERRM);
  END;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.transfers (organization_id, from_location_id, to_location_id, status, items, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), 'pending', '[]'::jsonb, (SELECT value FROM transfer_rule_ids WHERE key='choto_manager'));
    INSERT INTO transfer_rule_results VALUES ('choto_manager_cannot_create_transfer_from_seymore', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('choto_manager_cannot_create_transfer_from_seymore', true, SQLERRM);
  END;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.intercompany_transfers (organization_id, from_location_id, to_location_id, items_json, total_amount, status, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), '[]'::jsonb, 10, 'pending', (SELECT value FROM transfer_rule_ids WHERE key='choto_manager'));
    INSERT INTO transfer_rule_results VALUES ('location_manager_cannot_create_intercompany_transfer', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('location_manager_cannot_create_intercompany_transfer', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='seymore_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO transfer_rule_results
SELECT 'seymore_manager_sees_transfer_to_own_location',
       EXISTS (SELECT 1 FROM public.transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='transfer'))
       AND EXISTS (SELECT 1 FROM public.intercompany_transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='intercompany'))
       AND EXISTS (SELECT 1 FROM public.commissary_routes WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='route')),
       'to/destination endpoint visible';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='third_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO transfer_rule_results
SELECT 'unrelated_location_manager_cannot_see_transfer',
       NOT EXISTS (SELECT 1 FROM public.transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='transfer'))
       AND NOT EXISTS (SELECT 1 FROM public.intercompany_transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='intercompany'))
       AND NOT EXISTS (SELECT 1 FROM public.commissary_routes WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='route')),
       'third location is not an endpoint';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO transfer_rule_results
SELECT 'branch_manager_sees_brand_endpoint_transfers',
       EXISTS (SELECT 1 FROM public.transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='transfer'))
       AND EXISTS (SELECT 1 FROM public.intercompany_transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='intercompany'))
       AND EXISTS (SELECT 1 FROM public.commissary_routes WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='route')),
       'branch manager sees both brand locations';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.intercompany_transfers (organization_id, from_location_id, to_location_id, items_json, total_amount, status, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), '[]'::jsonb, 10, 'pending', (SELECT value FROM transfer_rule_ids WHERE key='branch'));
    INSERT INTO transfer_rule_results VALUES ('branch_manager_can_create_intercompany_transfer', true, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('branch_manager_can_create_intercompany_transfer', false, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO transfer_rule_results
SELECT 'org_manager_sees_transfer_tables',
       EXISTS (SELECT 1 FROM public.transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='transfer'))
       AND EXISTS (SELECT 1 FROM public.intercompany_transfers WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='intercompany'))
       AND EXISTS (SELECT 1 FROM public.commissary_routes WHERE id = (SELECT value FROM transfer_rule_ids WHERE key='route')),
       'org manager sees all org transfer rows';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM transfer_rule_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.transfers (organization_id, from_location_id, to_location_id, status, items, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), 'pending', '[]'::jsonb, (SELECT value FROM transfer_rule_ids WHERE key='ground'));
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_transfers', false, 'transfer insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_transfers', true, SQLERRM);
  END;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.intercompany_transfers (organization_id, from_location_id, to_location_id, items_json, total_amount, status, created_by)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), (SELECT value FROM transfer_rule_ids WHERE key='choto'), (SELECT value FROM transfer_rule_ids WHERE key='seymore'), '[]'::jsonb, 10, 'pending', (SELECT value FROM transfer_rule_ids WHERE key='ground'));
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_intercompany_transfers', false, 'intercompany insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_intercompany_transfers', true, SQLERRM);
  END;
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.commissary_routes (organization_id, name, origin_location_id, status)
    VALUES ((SELECT value FROM transfer_rule_ids WHERE key='org'), 'Bad Ground Route', (SELECT value FROM transfer_rule_ids WHERE key='choto'), 'draft');
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_commissary_routes', false, 'route insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('ground_staff_cannot_write_commissary_routes', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO transfer_rule_results
SELECT 'soft_deleted_transfer_hidden_not_applicable',
       NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('transfers','intercompany_transfers','commissary_routes')
           AND column_name = 'deleted_at'
       ),
       'live schema has no deleted_at on these three tables; no soft-delete predicate possible without a schema change';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.transfers;
    PERFORM count(*) FROM public.intercompany_transfers;
    PERFORM count(*) FROM public.commissary_routes;
    INSERT INTO transfer_rule_results VALUES ('anon_cannot_read_transfer_tables', false, 'anon read unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO transfer_rule_results VALUES ('anon_cannot_read_transfer_tables', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO transfer_rule_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.transfers', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.intercompany_transfers', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.commissary_routes', 'TRUNCATE'),
       'anon truncate revoked on all three';

SELECT * FROM transfer_rule_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM transfer_rule_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Transfer endpoint RLS acceptance failed';
  END IF;
END $$;

ROLLBACK;