BEGIN;

CREATE TEMP TABLE batch3a_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3a_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3a_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3a_results TO authenticated;

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
  v_vendor_brand uuid := gen_random_uuid();
  v_vendor_loc1 uuid := gen_random_uuid();
  v_vendor_loc2 uuid := gen_random_uuid();
  v_vi_brand uuid := gen_random_uuid();
  v_vi_loc1 uuid := gen_random_uuid();
  v_vi_loc2 uuid := gen_random_uuid();
  v_count_sheet1 uuid := gen_random_uuid();
  v_count_sheet2 uuid := gen_random_uuid();
  v_recipe_active uuid := gen_random_uuid();
  v_recipe_deleted uuid := gen_random_uuid();
  v_pos_item uuid := gen_random_uuid();
  v_sensor uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3a_ids(key, value) VALUES
    ('org', v_org), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner', v_owner), ('branch', v_branch), ('loc_mgr1', v_loc_mgr1), ('loc_mgr2', v_loc_mgr2), ('ground', v_ground),
    ('vendor_brand', v_vendor_brand), ('vendor_loc1', v_vendor_loc1), ('vendor_loc2', v_vendor_loc2),
    ('vi_brand', v_vi_brand), ('vi_loc1', v_vi_loc1), ('vi_loc2', v_vi_loc2),
    ('count_sheet1', v_count_sheet1), ('count_sheet2', v_count_sheet2),
    ('recipe_active', v_recipe_active), ('recipe_deleted', v_recipe_deleted), ('pos_item', v_pos_item), ('sensor', v_sensor), ('product', v_product);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'batch3a-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3a-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr1, 'authenticated', 'authenticated', 'batch3a-loc1@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr2, 'authenticated', 'authenticated', 'batch3a-loc2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3a-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 3a RLS Org', 'batch-3a-rls-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Batch 3a Brand 1'), (v_brand2, v_org, 'Batch 3a Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org, 'Choto'), (v_loc2, v_brand1, v_org, 'Seymore');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level, invoice_approval_limit)
  VALUES
    (v_owner, 'batch3a-owner@example.test', 'Batch 3a Owner', 'org_manager', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'batch3a-branch@example.test', 'Batch 3a Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_loc_mgr1, 'batch3a-loc1@example.test', 'Batch 3a Loc1', 'location_manager', v_org, v_brand1, v_loc1, 'location', 500),
    (v_loc_mgr2, 'batch3a-loc2@example.test', 'Batch 3a Loc2', 'location_manager', v_org, v_brand1, v_loc2, 'location', 500),
    (v_ground, 'batch3a-ground@example.test', 'Batch 3a Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role, organization_id = EXCLUDED.organization_id, brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id, access_level = EXCLUDED.access_level, deleted_at = NULL, updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'), (v_org, v_branch, 'branch_manager'),
    (v_org, v_loc_mgr1, 'location_manager'), (v_org, v_loc_mgr2, 'location_manager'), (v_org, v_ground, 'ground_staff');

  INSERT INTO public.vendors (id, name, organization_id, brand_id, location_id, created_by)
  VALUES
    (v_vendor_brand, 'US Foods 3a', v_org, v_brand1, NULL, v_owner),
    (v_vendor_loc1, 'Choto Vendor 3a', v_org, v_brand1, v_loc1, v_owner),
    (v_vendor_loc2, 'Seymore Vendor 3a', v_org, v_brand1, v_loc2, v_owner);

  INSERT INTO public.vendor_items (id, organization_id, vendor_id, vendor_item_name)
  VALUES
    (v_vi_brand, v_org, v_vendor_brand, 'Brand Shared Item'),
    (v_vi_loc1, v_org, v_vendor_loc1, 'Choto Item'),
    (v_vi_loc2, v_org, v_vendor_loc2, 'Seymore Item');

  INSERT INTO public.count_sheets (id, organization_id, location_id, name)
  VALUES (v_count_sheet1, v_org, v_loc1, 'Choto Count'), (v_count_sheet2, v_org, v_loc2, 'Seymore Count');

  INSERT INTO public.count_sessions (organization_id, count_sheet_id, counted_by)
  VALUES (v_org, v_count_sheet1, v_ground), (v_org, v_count_sheet2, v_loc_mgr2);

  INSERT INTO public.products (id, name, organization_id, brand_id, location_id, created_by)
  VALUES (v_product, 'Batch 3a Product', v_org, v_brand1, v_loc1, v_owner);

  INSERT INTO public.recipes (id, name, organization_id, brand_id, location_id)
  VALUES (v_recipe_active, 'Active Recipe 3a', v_org, v_brand1, v_loc1), (v_recipe_deleted, 'Deleted Recipe 3a', v_org, v_brand1, v_loc1);
  UPDATE public.recipes SET deleted_at = now(), deleted_by = v_owner WHERE id = v_recipe_deleted;

  INSERT INTO public.recipe_ingredients (organization_id, recipe_id, product_id, quantity, unit)
  VALUES (v_org, v_recipe_active, v_product, 1, 'each'), (v_org, v_recipe_deleted, v_product, 1, 'each');

  INSERT INTO public.pos_items (id, organization_id, location_id, pos_provider, pos_item_id, item_name)
  VALUES (v_pos_item, v_org, v_loc1, 'toast', 'batch3a-pos-item', 'POS Item 3a');

  INSERT INTO public.pos_sales_data (organization_id, location_id, date, pos_item_id, quantity_sold, revenue)
  VALUES (v_org, v_loc1, CURRENT_DATE, v_pos_item, 2, 20), (v_org, v_loc2, CURRENT_DATE, v_pos_item, 3, 30);

  INSERT INTO public.iot_sensors (id, organization_id, location_id, mac_address, name)
  VALUES (v_sensor, v_org, v_loc1, 'batch3a-sensor', 'Batch 3a Sensor');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3a_ids WHERE key='loc_mgr1'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3a_results
SELECT 'location_manager_sees_only_own_count_sheet', array_agg(name ORDER BY name) = ARRAY['Choto Count'], 'count_sheets=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.count_sheets WHERE organization_id = (SELECT value FROM batch3a_ids WHERE key='org');

INSERT INTO batch3a_results
SELECT 'location_manager_sees_brand_shared_and_own_reference', array_agg(vendor_item_name ORDER BY vendor_item_name) = ARRAY['Brand Shared Item','Choto Item'], 'vendor_items=' || COALESCE(array_agg(vendor_item_name ORDER BY vendor_item_name)::text, '{}')
FROM public.vendor_items WHERE organization_id = (SELECT value FROM batch3a_ids WHERE key='org');

INSERT INTO batch3a_results
SELECT 'parent_child_follows_parent_scope', count(*) = 1, 'count_sessions=' || count(*)
FROM public.count_sessions WHERE organization_id = (SELECT value FROM batch3a_ids WHERE key='org');

INSERT INTO batch3a_results
SELECT 'soft_deleted_parent_hides_recipe_child', count(*) = 0, 'deleted_recipe_child_count=' || count(*)
FROM public.recipe_ingredients WHERE recipe_id = (SELECT value FROM batch3a_ids WHERE key='recipe_deleted');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.budget_targets (organization_id, brand_id, location_id, period_start, period_end, category, target_amount)
    VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='brand1'), NULL, CURRENT_DATE, CURRENT_DATE + 7, 'food', 100);
    INSERT INTO batch3a_results VALUES ('location_manager_cannot_insert_brand_shared_reference', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3a_results VALUES ('location_manager_cannot_insert_brand_shared_reference', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3a_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3a_results
SELECT 'branch_manager_sees_brand_both_locations', array_agg(name ORDER BY name) = ARRAY['Choto Count','Seymore Count'], 'count_sheets=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.count_sheets WHERE organization_id = (SELECT value FROM batch3a_ids WHERE key='org');

INSERT INTO public.budget_targets (organization_id, brand_id, location_id, period_start, period_end, category, target_amount)
VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='brand1'), NULL, CURRENT_DATE, CURRENT_DATE + 7, 'food', 200);
INSERT INTO batch3a_results VALUES ('branch_manager_can_insert_brand_shared_reference', true, 'insert succeeded');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3a_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.time_clocks (organization_id, location_id, employee_profile_id)
VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='loc1'), (SELECT value FROM batch3a_ids WHERE key='ground'));
INSERT INTO public.count_sheets (organization_id, location_id, name)
VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='loc1'), 'Ground Count');
INSERT INTO public.temperature_logs (organization_id, sensor_id, temperature_f)
VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='sensor'), 38);
INSERT INTO public.pos_sales_data (organization_id, location_id, date, pos_item_id, quantity_sold, revenue)
VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='loc1'), CURRENT_DATE, (SELECT value FROM batch3a_ids WHERE key='pos_item'), 1, 10);
INSERT INTO batch3a_results VALUES ('ground_staff_can_write_allowed_operational_tables', true, 'time_clocks/count_sheets/temperature_logs/pos_sales_data inserts succeeded');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.vendor_items (organization_id, vendor_id, vendor_item_name)
    VALUES ((SELECT value FROM batch3a_ids WHERE key='org'), (SELECT value FROM batch3a_ids WHERE key='vendor_loc1'), 'Ground Forbidden Item');
    INSERT INTO batch3a_results VALUES ('ground_staff_cannot_write_catalogs', false, 'vendor item insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3a_results VALUES ('ground_staff_cannot_write_catalogs', true, SQLERRM);
  END;
END $$;

RESET ROLE;

INSERT INTO batch3a_results VALUES ('anon_truncate_denied', NOT has_table_privilege('anon', 'public.count_sheets', 'TRUNCATE'), 'anon truncate count_sheets=' || has_table_privilege('anon', 'public.count_sheets', 'TRUNCATE'));

SELECT * FROM batch3a_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3a_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3a acceptance failed';
  END IF;
END $$;

ROLLBACK;