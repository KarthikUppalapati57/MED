BEGIN;

CREATE TEMP TABLE batch3b_cont_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3b_cont_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3b_cont_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3b_cont_results TO authenticated;

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
  v_customer1 uuid := gen_random_uuid();
  v_customer2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3b_cont_ids(key, value) VALUES
    ('org', v_org), ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner', v_owner), ('branch', v_branch), ('loc_mgr1', v_loc_mgr1), ('loc_mgr2', v_loc_mgr2), ('ground', v_ground),
    ('customer1', v_customer1), ('customer2', v_customer2);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'batch3bc-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3bc-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr1, 'authenticated', 'authenticated', 'batch3bc-loc1@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_loc_mgr2, 'authenticated', 'authenticated', 'batch3bc-loc2@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3bc-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 3b Cont Org', 'batch-3b-cont-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Batch 3b Cont Brand 1'), (v_brand2, v_org, 'Batch 3b Cont Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org, 'Choto'), (v_loc2, v_brand1, v_org, 'Seymore');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level, invoice_approval_limit)
  VALUES
    (v_owner, 'batch3bc-owner@example.test', 'Batch 3bC Owner', 'org_manager', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'batch3bc-branch@example.test', 'Batch 3bC Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_loc_mgr1, 'batch3bc-loc1@example.test', 'Batch 3bC Loc1', 'location_manager', v_org, v_brand1, v_loc1, 'location', 500),
    (v_loc_mgr2, 'batch3bc-loc2@example.test', 'Batch 3bC Loc2', 'location_manager', v_org, v_brand1, v_loc2, 'location', 500),
    (v_ground, 'batch3bc-ground@example.test', 'Batch 3bC Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET role=EXCLUDED.role, organization_id=EXCLUDED.organization_id, brand_id=EXCLUDED.brand_id,
         location_id=EXCLUDED.location_id, access_level=EXCLUDED.access_level, deleted_at=NULL, updated_at=now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'), (v_org, v_branch, 'branch_manager'),
    (v_org, v_loc_mgr1, 'location_manager'), (v_org, v_loc_mgr2, 'location_manager'), (v_org, v_ground, 'ground_staff');

  INSERT INTO public.customers (id, organization_id, first_name, last_name, email)
  VALUES
    (v_customer1, v_org, 'Choto', 'Customer', 'choto-customer@example.test'),
    (v_customer2, v_org, 'Seymore', 'Customer', 'seymore-customer@example.test');

  INSERT INTO public.loyalty_memberships (organization_id, customer_id, points_balance, tier)
  VALUES (v_org, v_customer1, 10, 'bronze'), (v_org, v_customer2, 20, 'gold');

  INSERT INTO public.marketing_campaigns (organization_id, name, type, status, content)
  VALUES (v_org, 'Batch 3bC Campaign', 'email', 'draft', 'Hello');

  INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name)
  VALUES (v_org, 'food', '5000', 'Food Cost');

  INSERT INTO public.tolerance_configurations (organization_id, category)
  VALUES (v_org, 'food');

  INSERT INTO public.closed_periods (organization_id, period_name, start_date, end_date, closed_by)
  VALUES (v_org, 'P1', CURRENT_DATE - 30, CURRENT_DATE - 1, v_owner);

  INSERT INTO public.pos_configurations (organization_id, location_id, provider)
  VALUES (v_org, v_loc1, 'toast');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_cont_ids WHERE key='loc_mgr1'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3b_cont_results
SELECT 'location_manager_sees_all_org_customers', count(*) = 2, 'customers=' || count(*)
FROM public.customers WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org');

INSERT INTO batch3b_cont_results
SELECT 'location_manager_sees_all_org_loyalty', count(*) = 2, 'loyalty=' || count(*)
FROM public.loyalty_memberships WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org');

INSERT INTO batch3b_cont_results
SELECT 'location_manager_sees_org_settings',
       (SELECT count(*) FROM public.gl_mappings WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org')) = 1
       AND (SELECT count(*) FROM public.pos_configurations WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org')) = 1,
       'gl=' || (SELECT count(*) FROM public.gl_mappings WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org')) || ', pos=' ||
       (SELECT count(*) FROM public.pos_configurations WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org'));

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_cont_ids WHERE key='loc_mgr2'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3b_cont_results
SELECT 'sibling_location_manager_also_sees_all_org_customers', count(*) = 2, 'customers=' || count(*)
FROM public.customers WHERE organization_id = (SELECT value FROM batch3b_cont_ids WHERE key='org');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_cont_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.customers (organization_id, first_name, last_name)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'Branch', 'Customer');
INSERT INTO public.marketing_campaigns (organization_id, name, type, status, content)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'Branch Campaign', 'email', 'draft', 'Hi');
INSERT INTO batch3b_cont_results VALUES ('manager_can_write_customers_and_marketing', true, 'customer/campaign insert succeeded');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name)
    VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'labor', '6000', 'Labor');
    INSERT INTO batch3b_cont_results VALUES ('manager_cannot_write_admin_config', false, 'gl mapping insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3b_cont_results VALUES ('manager_cannot_write_admin_config', true, SQLERRM);
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_cont_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.gl_mappings (organization_id, category, gl_code, gl_name)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'labor', '6000', 'Labor');
INSERT INTO public.tolerance_configurations (organization_id, category)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'labor');
INSERT INTO public.closed_periods (organization_id, period_name, start_date, end_date, closed_by)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'P2', CURRENT_DATE, CURRENT_DATE + 30, (SELECT value FROM batch3b_cont_ids WHERE key='owner'));
INSERT INTO public.pos_configurations (organization_id, location_id, provider)
VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), (SELECT value FROM batch3b_cont_ids WHERE key='loc2'), 'square');
INSERT INTO batch3b_cont_results VALUES ('admin_can_write_all_config_tables', true, 'admin inserts succeeded');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3b_cont_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.customers (organization_id, first_name, last_name)
    VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), 'Ground', 'Customer');
    INSERT INTO batch3b_cont_results VALUES ('ground_staff_cannot_write_customers_or_config', false, 'customer insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    BEGIN
      INSERT INTO public.pos_configurations (organization_id, location_id, provider)
      VALUES ((SELECT value FROM batch3b_cont_ids WHERE key='org'), (SELECT value FROM batch3b_cont_ids WHERE key='loc1'), 'clover');
      INSERT INTO batch3b_cont_results VALUES ('ground_staff_cannot_write_customers_or_config', false, 'pos config insert unexpectedly succeeded after customer denial');
    EXCEPTION WHEN others THEN
      INSERT INTO batch3b_cont_results VALUES ('ground_staff_cannot_write_customers_or_config', true, 'customer and config writes denied');
    END;
  END;
END $$;

RESET ROLE;

INSERT INTO batch3b_cont_results VALUES ('anon_truncate_denied', NOT has_table_privilege('anon', 'public.customers', 'TRUNCATE'), 'anon truncate customers=' || has_table_privilege('anon', 'public.customers', 'TRUNCATE'));

SELECT * FROM batch3b_cont_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3b_cont_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3b-cont acceptance failed';
  END IF;
END $$;

ROLLBACK;