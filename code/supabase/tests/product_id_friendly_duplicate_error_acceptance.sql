-- Acceptance test for 20260719000013_product_id_friendly_duplicate_error.sql
--
-- Verifies: (1) creating a product with a product_id that's already in use raises a friendly,
-- actionable message (not the raw Postgres constraint-violation text), (2) updating a
-- DIFFERENT product to reuse an existing product_id also raises the friendly message,
-- (3) a normal, non-duplicate create/update still succeeds (no regression).

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE pfde_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE pfde_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON pfde_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pfde_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_branch_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO pfde_ids(key, value) VALUES ('org', v_org), ('brand', v_brand), ('branch_manager', v_branch_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'PFDE Org', 'pfde-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'PFDE Brand', v_org);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_branch_manager, 'authenticated', 'authenticated', 'pfde-branch-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id)
  VALUES (v_branch_manager, 'pfde-branch-manager@example.test', 'PFDE Branch Manager', 'branch_manager', 'active', v_org, v_brand)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role, brand_id = EXCLUDED.brand_id;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pfde_ids WHERE key = 'branch_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- first product with a specific product_id succeeds
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'PFDE Product One',
    p_restops_product_id := 'PFDE-SKU-001',
    p_accounting_category := 'food',
    p_organization_id := (SELECT value FROM pfde_ids WHERE key = 'org'),
    p_brand_id := (SELECT value FROM pfde_ids WHERE key = 'brand')
  );
  INSERT INTO pfde_ids(key, value) VALUES ('product_one', (v_result->>'id')::uuid);
  INSERT INTO pfde_results VALUES ('first_create_succeeds', true, 'created ' || (v_result->>'id'));
END $$;

-- second product reusing the same product_id fails with a friendly message
DO $$
BEGIN
  BEGIN
    PERFORM public.create_product_details(
      p_name := 'PFDE Product Two',
      p_restops_product_id := 'PFDE-SKU-001',
      p_accounting_category := 'food',
      p_organization_id := (SELECT value FROM pfde_ids WHERE key = 'org'),
    p_brand_id := (SELECT value FROM pfde_ids WHERE key = 'brand')
    );
    INSERT INTO pfde_results VALUES ('duplicate_create_friendly_error', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO pfde_results VALUES (
      'duplicate_create_friendly_error',
      SQLERRM ILIKE '%already in use%' AND SQLERRM NOT ILIKE '%constraint%',
      SQLERRM
    );
  END;
END $$;

-- a distinct product_id succeeds fine
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'PFDE Product Three',
    p_restops_product_id := 'PFDE-SKU-003',
    p_accounting_category := 'food',
    p_organization_id := (SELECT value FROM pfde_ids WHERE key = 'org'),
    p_brand_id := (SELECT value FROM pfde_ids WHERE key = 'brand')
  );
  INSERT INTO pfde_ids(key, value) VALUES ('product_three', (v_result->>'id')::uuid);
  INSERT INTO pfde_results VALUES ('distinct_sku_still_succeeds', true, 'created ' || (v_result->>'id'));
END $$;

-- updating product_three to reuse product_one's SKU also gets the friendly message
DO $$
BEGIN
  BEGIN
    PERFORM public.update_product_details(
      (SELECT value FROM pfde_ids WHERE key = 'product_three'),
      'PFDE Product Three Renamed',
      p_restops_product_id := 'PFDE-SKU-001'
    );
    INSERT INTO pfde_results VALUES ('duplicate_update_friendly_error', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO pfde_results VALUES (
      'duplicate_update_friendly_error',
      SQLERRM ILIKE '%already in use%' AND SQLERRM NOT ILIKE '%constraint%',
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM pfde_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pfde_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'product_id_friendly_duplicate_error_acceptance failed';
  END IF;
END $$;

ROLLBACK;
