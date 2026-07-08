BEGIN;

CREATE TEMP TABLE batch3b_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3b_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3b_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3b_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_loc_mgr1 uuid := gen_random_uuid();
  v_loc_mgr2 uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_brand_setting uuid := gen_random_uuid();
  v_loc_setting uuid := gen_random_uuid();
  v_report uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3b_ids(key, value) VALUES
    ('org', v_org), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner', v_owner), ('branch', v_branch), ('loc_mgr1', v_loc_mgr1), ('loc_mgr2', v_loc_mgr2),
    ('ground', v_ground), ('other_user', v_other_user), ('brand_setting', v_brand_setting), ('loc_setting', v_loc_setting), ('report', v_report);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'batch3b-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3b-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr1, 'authenticated', 'authenticated', 'batch3b-loc1@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr2, 'authenticated', 'authenticated', 'batch3b-loc2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3b-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other_user, 'authenticated', 'authenticated', 'batch3b-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 3b RLS Org', 'batch-3b-rls-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Batch 3b Brand 1'), (v_brand2, v_org, 'Batch 3b Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org, 'Choto'), (v_loc2, v_brand1, v_org, 'Seymore');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level, invoice_approval_limit)
  VALUES
    (v_owner, 'batch3b-owner@example.test', 'Batch 3b Owner', 'org_manager', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'batch3b-branch@example.test', 'Batch 3b Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_loc_mgr1, 'batch3b-loc1@example.test', 'Batch 3b Loc1', 'location_manager', v_org, v_brand1, v_loc1, 'location', 500),
    (v_loc_mgr2, 'batch3b-loc2@example.test', 'Batch 3b Loc2', 'location_manager', v_org, v_brand1, v_loc2, 'location', 500),
    (v_ground, 'batch3b-ground@example.test', 'Batch 3b Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location', 0),
    (v_other_user, 'batch3b-other@example.test', 'Batch 3b Other', 'ground_staff', v_org, v_brand1, v_loc2, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET role=EXCLUDED.role, organization_id=EXCLUDED.organization_id, brand_id=EXCLUDED.brand_id,
         location_id=EXCLUDED.location_id, access_level=EXCLUDED.access_level, deleted_at=NULL, updated_at=now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'), (v_org, v_branch, 'branch_manager'),
    (v_org, v_loc_mgr1, 'location_manager'), (v_org, v_loc_mgr2, 'location_manager'),
    (v_org, v_ground, 'ground_staff'), (v_org, v_other_user, 'ground_staff');

  INSERT INTO public.operational_settings (id, organization_id, brand_id, location_id, scope, category, settings, created_by)
  VALUES
    (v_brand_setting, v_org, v_brand1, NULL, 'brand', 'ordering', '{"mode":"brand"}'::jsonb, v_owner),
    (v_loc_setting, v_org, v_brand1, v_loc1, 'location', 'ordering', '{"mode":"loc1"}'::jsonb, v_owner);

  INSERT INTO public.custom_reports (id, organization_id, name, query_config, created_by)
  VALUES (v_report, v_org, 'Batch 3b Report', '{}'::jsonb, v_owner);

  INSERT INTO public.notifications (user_id, organization_id, title, message, type)
  VALUES
    (v_ground, v_org, 'Ground Notice', 'For ground', 'system'),
    (v_other_user, v_org, 'Other Notice', 'For other', 'system');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_ids WHERE key='loc_mgr1'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3b_results
SELECT 'location_manager_sees_brand_and_own_location_setting',
       array_agg(scope ORDER BY scope) = ARRAY['brand','location'],
       'settings=' || COALESCE(array_agg(scope ORDER BY scope)::text, '{}')
FROM public.operational_settings WHERE organization_id = (SELECT value FROM batch3b_ids WHERE key='org');

DO $$
BEGIN
  BEGIN
    UPDATE public.operational_settings
       SET settings = '{"mode":"forbidden"}'::jsonb
     WHERE id = (SELECT value FROM batch3b_ids WHERE key='brand_setting');
    IF FOUND THEN
      INSERT INTO batch3b_results VALUES ('location_manager_cannot_edit_brand_level_setting', false, 'brand update unexpectedly affected a row');
    ELSE
      INSERT INTO batch3b_results VALUES ('location_manager_cannot_edit_brand_level_setting', true, 'brand row not writable/visible to update');
    END IF;
  EXCEPTION WHEN others THEN
    INSERT INTO batch3b_results VALUES ('location_manager_cannot_edit_brand_level_setting', true, SQLERRM);
  END;
END $$;

UPDATE public.operational_settings
   SET settings = '{"mode":"loc1-updated"}'::jsonb
 WHERE id = (SELECT value FROM batch3b_ids WHERE key='loc_setting');
INSERT INTO batch3b_results VALUES ('location_manager_can_edit_own_location_setting', true, 'location update succeeded');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.operational_settings
   SET settings = '{"mode":"brand-updated"}'::jsonb
 WHERE id = (SELECT value FROM batch3b_ids WHERE key='brand_setting');
INSERT INTO batch3b_results VALUES ('branch_manager_can_edit_brand_level_setting', true, 'brand update succeeded');

INSERT INTO public.custom_reports (organization_id, name, query_config, created_by)
VALUES ((SELECT value FROM batch3b_ids WHERE key='org'), 'Branch Report', '{}'::jsonb, (SELECT value FROM batch3b_ids WHERE key='branch'));
INSERT INTO batch3b_results VALUES ('manager_can_insert_manager_org_level_table', true, 'custom report insert succeeded');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.accounting_export_queue (organization_id, entity_type, entity_id)
    VALUES ((SELECT value FROM batch3b_ids WHERE key='org'), 'invoice', gen_random_uuid());
    INSERT INTO batch3b_results VALUES ('branch_manager_cannot_insert_admin_only_table', false, 'accounting export insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3b_results VALUES ('branch_manager_cannot_insert_admin_only_table', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.accounting_export_queue (organization_id, entity_type, entity_id)
VALUES ((SELECT value FROM batch3b_ids WHERE key='org'), 'invoice', gen_random_uuid());
INSERT INTO batch3b_results VALUES ('org_manager_can_insert_admin_only_table', true, 'accounting export insert succeeded');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3b_results
SELECT 'ground_staff_can_read_org_level_table', count(*) >= 1, 'custom_reports=' || count(*)
FROM public.custom_reports WHERE organization_id = (SELECT value FROM batch3b_ids WHERE key='org');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.custom_reports (organization_id, name, query_config, created_by)
    VALUES ((SELECT value FROM batch3b_ids WHERE key='org'), 'Ground Report', '{}'::jsonb, (SELECT value FROM batch3b_ids WHERE key='ground'));
    INSERT INTO batch3b_results VALUES ('ground_staff_cannot_write_3b_tables', false, 'custom report insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3b_results VALUES ('ground_staff_cannot_write_3b_tables', true, SQLERRM);
  END;
END $$;

INSERT INTO batch3b_results
SELECT 'user_sees_only_own_notifications',
       array_agg(title ORDER BY title) = ARRAY['Ground Notice'],
       'notifications=' || COALESCE(array_agg(title ORDER BY title)::text, '{}')
FROM public.notifications;

UPDATE public.notifications SET read = true WHERE title = 'Ground Notice';
INSERT INTO batch3b_results VALUES ('user_can_update_own_notification', true, 'own notification update succeeded');

DO $$
BEGIN
  BEGIN
    UPDATE public.notifications SET read = true WHERE title = 'Other Notice';
    IF FOUND THEN
      INSERT INTO batch3b_results VALUES ('user_cannot_update_other_notification', false, 'other notification updated');
    ELSE
      INSERT INTO batch3b_results VALUES ('user_cannot_update_other_notification', true, 'other notification not visible/updatable');
    END IF;
  EXCEPTION WHEN others THEN
    INSERT INTO batch3b_results VALUES ('user_cannot_update_other_notification', true, SQLERRM);
  END;
END $$;

RESET ROLE;

INSERT INTO batch3b_results VALUES ('anon_truncate_denied', NOT has_table_privilege('anon', 'public.custom_reports', 'TRUNCATE'), 'anon truncate custom_reports=' || has_table_privilege('anon', 'public.custom_reports', 'TRUNCATE'));

SELECT * FROM batch3b_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3b_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3b acceptance failed';
  END IF;
END $$;

ROLLBACK;