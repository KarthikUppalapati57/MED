BEGIN;

CREATE TEMP TABLE batch3c2_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3c2_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c2_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c2_results TO authenticated, anon, service_role;

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
  v_gl_a uuid := gen_random_uuid();
  v_gl_b uuid := gen_random_uuid();
  v_audit_a uuid := gen_random_uuid();
  v_audit_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3c2_ids(key, value) VALUES
    ('org_a', v_org_a), ('org_b', v_org_b), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner_a', v_owner_a), ('owner_b', v_owner_b), ('branch', v_branch), ('location', v_location), ('ground', v_ground),
    ('gl_a', v_gl_a), ('gl_b', v_gl_b), ('audit_a', v_audit_a), ('audit_b', v_audit_b);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'authenticated', 'authenticated', 'batch3c2-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_b, 'authenticated', 'authenticated', 'batch3c2-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3c2-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location, 'authenticated', 'authenticated', 'batch3c2-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3c2-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES
    (v_org_a, 'Batch 3c2 Org A', 'batch-3c2-org-a', v_owner_a),
    (v_org_b, 'Batch 3c2 Org B', 'batch-3c2-org-b', v_owner_b);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org_a, 'Batch 3c2 Brand 1'), (v_brand2, v_org_a, 'Batch 3c2 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org_a, 'Batch 3c2 Location 1'), (v_loc2, v_brand2, v_org_a, 'Batch 3c2 Location 2');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner_a, 'batch3c2-owner-a@example.test', 'Batch 3c2 Owner A', 'org_owner', v_org_a, NULL, NULL, 'organization'),
    (v_owner_b, 'batch3c2-owner-b@example.test', 'Batch 3c2 Owner B', 'org_owner', v_org_b, NULL, NULL, 'organization'),
    (v_branch, 'batch3c2-branch@example.test', 'Batch 3c2 Branch', 'branch_manager', v_org_a, v_brand1, NULL, 'brand'),
    (v_location, 'batch3c2-location@example.test', 'Batch 3c2 Location', 'location_manager', v_org_a, v_brand1, v_loc1, 'location'),
    (v_ground, 'batch3c2-ground@example.test', 'Batch 3c2 Ground', 'ground_staff', v_org_a, v_brand1, v_loc1, 'location')
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

  INSERT INTO public.general_ledger_entries (id, organization_id, reference, description, debit_account, credit_account, amount, created_by)
  VALUES
    (v_gl_a, v_org_a, 'GL-A', 'Org A ledger', '1000', '2000', 100, v_owner_a),
    (v_gl_b, v_org_b, 'GL-B', 'Org B ledger', '1000', '2000', 200, v_owner_b);

  INSERT INTO public.audit_logs (id, organization_id, user_id, action, table_name, record_id, old_data, new_data, created_at)
  VALUES
    (v_audit_a, v_org_a, v_owner_a, 'batch3c2.test', 'general_ledger_entries', v_gl_a, '{}'::jsonb, '{"org":"a"}'::jsonb, now()),
    (v_audit_b, v_org_b, v_owner_b, 'batch3c2.test', 'general_ledger_entries', v_gl_b, '{}'::jsonb, '{"org":"b"}'::jsonb, now());
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c2_ids WHERE key='owner_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3c2_results
SELECT 'org_owner_can_select_own_org_gl_and_audit',
       (SELECT count(*) FROM public.general_ledger_entries) = 1
       AND (SELECT count(*) FROM public.audit_logs) = 1,
       'gl=' || (SELECT count(*) FROM public.general_ledger_entries) || ', audit=' || (SELECT count(*) FROM public.audit_logs);

INSERT INTO batch3c2_results
SELECT 'org_owner_cannot_read_cross_org_gl_and_audit',
       NOT EXISTS (SELECT 1 FROM public.general_ledger_entries WHERE id = (SELECT value FROM batch3c2_ids WHERE key='gl_b'))
       AND NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE id = (SELECT value FROM batch3c2_ids WHERE key='audit_b')),
       'org B rows hidden from org A admin';

DO $$
BEGIN
  BEGIN
    UPDATE public.general_ledger_entries SET amount = 999 WHERE id = (SELECT value FROM batch3c2_ids WHERE key='gl_a');
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_update_gl', false, 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_update_gl', true, SQLERRM);
  END;

  BEGIN
    DELETE FROM public.general_ledger_entries WHERE id = (SELECT value FROM batch3c2_ids WHERE key='gl_a');
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_delete_gl', false, 'DELETE unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_delete_gl', true, SQLERRM);
  END;

  BEGIN
    UPDATE public.audit_logs SET action = 'forged' WHERE id = (SELECT value FROM batch3c2_ids WHERE key='audit_a');
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_update_audit', false, 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_update_audit', true, SQLERRM);
  END;

  BEGIN
    DELETE FROM public.audit_logs WHERE id = (SELECT value FROM batch3c2_ids WHERE key='audit_a');
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_delete_audit', false, 'DELETE unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('org_owner_cannot_delete_audit', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, created_at)
    VALUES ((SELECT value FROM batch3c2_ids WHERE key='org_a'), (SELECT value FROM batch3c2_ids WHERE key='owner_a'), 'forged', 'audit_logs', now());
    INSERT INTO batch3c2_results VALUES ('authenticated_cannot_insert_audit_directly', false, 'direct audit insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('authenticated_cannot_insert_audit_directly', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c2_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c2_results
SELECT 'branch_manager_cannot_read_gl_or_audit',
       (SELECT count(*) FROM public.general_ledger_entries) = 0 AND (SELECT count(*) FROM public.audit_logs) = 0,
       'branch manager sees no rows';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c2_ids WHERE key='location'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c2_results
SELECT 'location_manager_cannot_read_gl_or_audit',
       (SELECT count(*) FROM public.general_ledger_entries) = 0 AND (SELECT count(*) FROM public.audit_logs) = 0,
       'location manager sees no rows';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c2_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c2_results
SELECT 'ground_staff_cannot_read_gl_or_audit',
       (SELECT count(*) FROM public.general_ledger_entries) = 0 AND (SELECT count(*) FROM public.audit_logs) = 0,
       'ground staff sees no rows';
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.general_ledger_entries;
    PERFORM count(*) FROM public.audit_logs;
    INSERT INTO batch3c2_results VALUES ('anon_cannot_read_gl_or_audit', false, 'anon read unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c2_results VALUES ('anon_cannot_read_gl_or_audit', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO batch3c2_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.general_ledger_entries', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.audit_logs', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.audit_logs_default', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.audit_logs_y2025', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.audit_logs_y2026', 'TRUNCATE'),
       'anon truncate revoked on GL/audit parent+partitions';

SET LOCAL ROLE service_role;
INSERT INTO public.general_ledger_entries (organization_id, reference, description, debit_account, credit_account, amount)
VALUES ((SELECT value FROM batch3c2_ids WHERE key='org_a'), 'GL-SVC', 'service insert', '1000', '2000', 300);
INSERT INTO public.audit_logs (organization_id, action, table_name, created_at)
VALUES ((SELECT value FROM batch3c2_ids WHERE key='org_a'), 'service.insert', 'audit_logs', now());
INSERT INTO batch3c2_results VALUES ('service_role_can_insert_gl_and_audit', true, 'service inserts succeeded');
RESET ROLE;

SELECT * FROM batch3c2_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3c2_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3c-2 append-only ledger/audit acceptance failed';
  END IF;
END $$;

ROLLBACK;