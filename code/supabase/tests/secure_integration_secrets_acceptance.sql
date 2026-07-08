BEGIN;

CREATE TEMP TABLE batch3c1_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3c1_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c1_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c1_results TO authenticated, anon, service_role;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_integration uuid := gen_random_uuid();
  v_endpoint uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3c1_ids(key, value) VALUES
    ('org', v_org), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner', v_owner), ('branch', v_branch), ('location', v_location), ('ground', v_ground),
    ('integration', v_integration), ('endpoint', v_endpoint);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'batch3c1-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3c1-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location, 'authenticated', 'authenticated', 'batch3c1-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3c1-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 3c1 Org', 'batch-3c1-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Batch 3c1 Brand 1'), (v_brand2, v_org, 'Batch 3c1 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org, 'Batch 3c1 Location 1'), (v_loc2, v_brand2, v_org, 'Batch 3c1 Location 2');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner, 'batch3c1-owner@example.test', 'Batch 3c1 Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_branch, 'batch3c1-branch@example.test', 'Batch 3c1 Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand'),
    (v_location, 'batch3c1-location@example.test', 'Batch 3c1 Location', 'location_manager', v_org, v_brand1, v_loc1, 'location'),
    (v_ground, 'batch3c1-ground@example.test', 'Batch 3c1 Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location')
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
    (v_org, v_location, 'location_manager'),
    (v_org, v_ground, 'ground_staff');

  INSERT INTO public.integrations (id, organization_id, provider, access_token, refresh_token, metadata, is_active)
  VALUES (v_integration, v_org, 'email_imap', 'raw-access-token', 'raw-refresh-token', '{"password":"raw-password","host":"imap.example.test"}'::jsonb, true);

  INSERT INTO public.webhook_endpoints (id, organization_id, url, secret, status, secret_prefix)
  VALUES (v_endpoint, v_org, 'https://example.test/webhook', 'whsec_raw_secret', 'active', 'whsec_raw_se');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c1_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3c1_results
SELECT 'owner_can_select_integration_nonsecret_columns',
       EXISTS (SELECT 1 FROM public.integrations WHERE id = (SELECT value FROM batch3c1_ids WHERE key='integration') AND provider = 'email_imap'),
       'owner selected id/provider/is_active only';

INSERT INTO batch3c1_results
SELECT 'owner_can_select_webhook_nonsecret_columns',
       EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = (SELECT value FROM batch3c1_ids WHERE key='endpoint') AND secret_prefix = 'whsec_raw_se'),
       'owner selected id/url/status/secret_prefix only';

DO $$
BEGIN
  BEGIN
    PERFORM access_token, refresh_token, metadata FROM public.integrations WHERE id = (SELECT value FROM batch3c1_ids WHERE key='integration');
    INSERT INTO batch3c1_results VALUES ('owner_cannot_select_integration_secret_columns', false, 'secret column select unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c1_results VALUES ('owner_cannot_select_integration_secret_columns', true, SQLERRM);
  END;

  BEGIN
    PERFORM secret FROM public.webhook_endpoints WHERE id = (SELECT value FROM batch3c1_ids WHERE key='endpoint');
    INSERT INTO batch3c1_results VALUES ('owner_cannot_select_webhook_secret_column', false, 'secret column select unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c1_results VALUES ('owner_cannot_select_webhook_secret_column', true, SQLERRM);
  END;

  BEGIN
    PERFORM * FROM public.integrations WHERE id = (SELECT value FROM batch3c1_ids WHERE key='integration');
    INSERT INTO batch3c1_results VALUES ('owner_select_star_integrations_errors', false, 'SELECT * unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c1_results VALUES ('owner_select_star_integrations_errors', true, SQLERRM);
  END;

  BEGIN
    PERFORM * FROM public.webhook_endpoints WHERE id = (SELECT value FROM batch3c1_ids WHERE key='endpoint');
    INSERT INTO batch3c1_results VALUES ('owner_select_star_webhook_endpoints_errors', false, 'SELECT * unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c1_results VALUES ('owner_select_star_webhook_endpoints_errors', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c1_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c1_results
SELECT 'branch_manager_cannot_select_rows',
       (SELECT count(*) FROM public.integrations) = 0 AND (SELECT count(*) FROM public.webhook_endpoints) = 0,
       'branch_manager row counts hidden by admin-only RLS';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c1_ids WHERE key='location'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c1_results
SELECT 'location_manager_cannot_select_rows',
       (SELECT count(*) FROM public.integrations) = 0 AND (SELECT count(*) FROM public.webhook_endpoints) = 0,
       'location_manager row counts hidden by admin-only RLS';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c1_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c1_results
SELECT 'ground_staff_cannot_select_rows',
       (SELECT count(*) FROM public.integrations) = 0 AND (SELECT count(*) FROM public.webhook_endpoints) = 0,
       'ground_staff row counts hidden by admin-only RLS';
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
BEGIN
  BEGIN
    PERFORM id FROM public.integrations;
    PERFORM id FROM public.webhook_endpoints;
    INSERT INTO batch3c1_results VALUES ('anon_cannot_read_tables', false, 'anon reads unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c1_results VALUES ('anon_cannot_read_tables', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO batch3c1_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.integrations', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.webhook_endpoints', 'TRUNCATE'),
       'anon truncate integrations=' || has_table_privilege('anon', 'public.integrations', 'TRUNCATE') || ', webhook=' || has_table_privilege('anon', 'public.webhook_endpoints', 'TRUNCATE');

SET LOCAL ROLE service_role;
INSERT INTO batch3c1_results
SELECT 'service_role_can_read_all_secret_columns',
       EXISTS (SELECT 1 FROM public.integrations WHERE access_token = 'raw-access-token' AND refresh_token = 'raw-refresh-token' AND metadata->>'password' = 'raw-password')
       AND EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE secret = 'whsec_raw_secret'),
       'service_role selected raw secret columns';
RESET ROLE;

SELECT * FROM batch3c1_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3c1_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3c-1 secret acceptance failed';
  END IF;
END $$;

ROLLBACK;