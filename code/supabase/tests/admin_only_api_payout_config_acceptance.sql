BEGIN;

CREATE TEMP TABLE batch3c3_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3c3_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c3_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c3_results TO authenticated, anon, service_role;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_payment_a uuid := gen_random_uuid();
  v_payment_b uuid := gen_random_uuid();
  v_api_a uuid := gen_random_uuid();
  v_api_b uuid := gen_random_uuid();
  v_dev_a uuid := gen_random_uuid();
  v_dev_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3c3_ids(key, value) VALUES
    ('org_a', v_org_a), ('org_b', v_org_b), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner_a', v_owner_a), ('owner_b', v_owner_b), ('branch', v_branch), ('location', v_location), ('ground', v_ground),
    ('payment_a', v_payment_a), ('payment_b', v_payment_b), ('api_a', v_api_a), ('api_b', v_api_b), ('dev_a', v_dev_a), ('dev_b', v_dev_b);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'authenticated', 'authenticated', 'batch3c3-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_b, 'authenticated', 'authenticated', 'batch3c3-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3c3-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location, 'authenticated', 'authenticated', 'batch3c3-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3c3-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES
    (v_org_a, 'Batch 3c3 Org A', 'batch-3c3-org-a', v_owner_a),
    (v_org_b, 'Batch 3c3 Org B', 'batch-3c3-org-b', v_owner_b);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org_a, 'Batch 3c3 Brand 1'), (v_brand2, v_org_a, 'Batch 3c3 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org_a, 'Batch 3c3 Location 1'), (v_loc2, v_brand2, v_org_a, 'Batch 3c3 Location 2');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner_a, 'batch3c3-owner-a@example.test', 'Batch 3c3 Owner A', 'org_owner', v_org_a, NULL, NULL, 'organization'),
    (v_owner_b, 'batch3c3-owner-b@example.test', 'Batch 3c3 Owner B', 'org_owner', v_org_b, NULL, NULL, 'organization'),
    (v_branch, 'batch3c3-branch@example.test', 'Batch 3c3 Branch', 'branch_manager', v_org_a, v_brand1, NULL, 'brand'),
    (v_location, 'batch3c3-location@example.test', 'Batch 3c3 Location', 'location_manager', v_org_a, v_brand1, v_loc1, 'location'),
    (v_ground, 'batch3c3-ground@example.test', 'Batch 3c3 Ground', 'ground_staff', v_org_a, v_brand1, v_loc1, 'location')
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
    (v_org_a, v_owner_a, 'org_owner'),
    (v_org_b, v_owner_b, 'org_owner'),
    (v_org_a, v_branch, 'branch_manager'),
    (v_org_a, v_location, 'location_manager'),
    (v_org_a, v_ground, 'ground_staff');

  INSERT INTO public.payment_accounts (id, organization_id, brand_id, location_id, name, account_type, payment_method, provider, last_four, metadata, created_by, updated_by)
  VALUES
    (v_payment_a, v_org_a, v_brand1, v_loc1, 'Org A Operating', 'checking', 'ach', 'dwolla', '1234', '{}'::jsonb, v_owner_a, v_owner_a),
    (v_payment_b, v_org_b, NULL, NULL, 'Org B Operating', 'checking', 'ach', 'dwolla', '9876', '{}'::jsonb, v_owner_b, v_owner_b);

  INSERT INTO public.api_keys (id, organization_id, name, key_hash, prefix)
  VALUES
    (v_api_a, v_org_a, 'Org A API', 'hash-a', 'sk_live_a'),
    (v_api_b, v_org_b, 'Org B API', 'hash-b', 'sk_live_b');

  INSERT INTO public.developer_api_keys (id, organization_id, name, key_hash, prefix)
  VALUES
    (v_dev_a, v_org_a, 'Org A Dev API', 'dev-hash-a', 'dev_a'),
    (v_dev_b, v_org_b, 'Org B Dev API', 'dev-hash-b', 'dev_b');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c3_ids WHERE key='owner_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3c3_results
SELECT 'org_owner_can_select_own_org_rows',
       (SELECT count(*) FROM public.payment_accounts) = 1
       AND (SELECT count(*) FROM public.api_keys) = 1
       AND (SELECT count(*) FROM public.developer_api_keys) = 1,
       'owner sees one row in each table';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.payment_accounts (organization_id, name, account_type, metadata)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Owner Insert Account', 'checking', '{}'::jsonb);
    INSERT INTO public.api_keys (organization_id, name, key_hash, prefix)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Owner Insert API', 'owner-hash', 'owner_api');
    INSERT INTO public.developer_api_keys (organization_id, name, key_hash, prefix)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Owner Insert Dev', 'owner-dev-hash', 'owner_dev');
    UPDATE public.payment_accounts SET name = 'Owner Updated Account' WHERE id = (SELECT value FROM batch3c3_ids WHERE key='payment_a');
    UPDATE public.api_keys SET name = 'Owner Updated API' WHERE id = (SELECT value FROM batch3c3_ids WHERE key='api_a');
    UPDATE public.developer_api_keys SET name = 'Owner Updated Dev' WHERE id = (SELECT value FROM batch3c3_ids WHERE key='dev_a');
    INSERT INTO batch3c3_results VALUES ('org_owner_can_insert_update_all_three', true, 'admin insert/update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c3_results VALUES ('org_owner_can_insert_update_all_three', false, SQLERRM);
  END;
END $$;

INSERT INTO batch3c3_results
SELECT 'org_owner_cannot_read_cross_org_rows',
       NOT EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = (SELECT value FROM batch3c3_ids WHERE key='payment_b'))
       AND NOT EXISTS (SELECT 1 FROM public.api_keys WHERE id = (SELECT value FROM batch3c3_ids WHERE key='api_b'))
       AND NOT EXISTS (SELECT 1 FROM public.developer_api_keys WHERE id = (SELECT value FROM batch3c3_ids WHERE key='dev_b')),
       'org B rows hidden from org A admin';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c3_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c3_results
SELECT 'branch_manager_cannot_read_rows',
       (SELECT count(*) FROM public.payment_accounts) = 0
       AND (SELECT count(*) FROM public.api_keys) = 0
       AND (SELECT count(*) FROM public.developer_api_keys) = 0,
       'branch manager sees no rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.api_keys (organization_id, name, key_hash, prefix)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Branch Bad API', 'branch-hash', 'branch');
    INSERT INTO batch3c3_results VALUES ('branch_manager_cannot_write', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c3_results VALUES ('branch_manager_cannot_write', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c3_ids WHERE key='location'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c3_results
SELECT 'location_manager_cannot_read_rows',
       (SELECT count(*) FROM public.payment_accounts) = 0
       AND (SELECT count(*) FROM public.api_keys) = 0
       AND (SELECT count(*) FROM public.developer_api_keys) = 0,
       'location manager sees no rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.payment_accounts (organization_id, name, account_type, metadata)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Location Bad Account', 'checking', '{}'::jsonb);
    INSERT INTO batch3c3_results VALUES ('location_manager_cannot_write', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c3_results VALUES ('location_manager_cannot_write', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c3_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c3_results
SELECT 'ground_staff_cannot_read_rows',
       (SELECT count(*) FROM public.payment_accounts) = 0
       AND (SELECT count(*) FROM public.api_keys) = 0
       AND (SELECT count(*) FROM public.developer_api_keys) = 0,
       'ground staff sees no rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.developer_api_keys (organization_id, name, key_hash, prefix)
    VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Ground Bad Dev', 'ground-hash', 'ground');
    INSERT INTO batch3c3_results VALUES ('ground_staff_cannot_write', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c3_results VALUES ('ground_staff_cannot_write', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.payment_accounts;
    PERFORM count(*) FROM public.api_keys;
    PERFORM count(*) FROM public.developer_api_keys;
    INSERT INTO batch3c3_results VALUES ('anon_cannot_read_tables', false, 'anon read unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c3_results VALUES ('anon_cannot_read_tables', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO batch3c3_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.payment_accounts', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.api_keys', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.developer_api_keys', 'TRUNCATE'),
       'anon truncate revoked on all three';

SET LOCAL ROLE service_role;
INSERT INTO public.payment_accounts (organization_id, name, account_type, metadata)
VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Service Account', 'checking', '{}'::jsonb);
INSERT INTO public.api_keys (organization_id, name, key_hash, prefix)
VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Service API', 'svc-hash', 'svc_api');
INSERT INTO public.developer_api_keys (organization_id, name, key_hash, prefix)
VALUES ((SELECT value FROM batch3c3_ids WHERE key='org_a'), 'Service Dev', 'svc-dev-hash', 'svc_dev');
UPDATE public.api_keys SET last_used_at = now() WHERE key_hash = 'svc-hash';
DELETE FROM public.api_keys WHERE key_hash = 'svc-hash';
INSERT INTO batch3c3_results VALUES ('service_role_retains_full_access', true, 'service insert/update/delete succeeded');
RESET ROLE;

INSERT INTO batch3c3_results
SELECT 'api_key_tables_have_no_raw_secret_column',
       NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('api_keys', 'developer_api_keys')
           AND column_name IN ('key', 'api_key', 'raw_key', 'secret', 'token', 'access_token', 'refresh_token')
       ),
       'api key tables store key_hash/prefix only';

INSERT INTO batch3c3_results
SELECT 'scheduled_payments_policies_left_untouched',
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_payments' AND policyname='Manage scheduled payments')
       AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scheduled_payments' AND policyname='View scheduled payments'),
       'deferred scheduled_payments policies still present';

SELECT * FROM batch3c3_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3c3_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3c-3 admin-only API/payout config acceptance failed';
  END IF;
END $$;

ROLLBACK;