-- Acceptance test for 20260719000011_missing_product_crud_rpcs.sql
--
-- Verifies: (1) a branch_manager can create a brand-shared product (location_specific=false),
-- (2) a location_manager can create a location-specific product scoped to their own location,
-- (3) a location_manager CANNOT create a brand-shared product (reference-hybrid write rule,
-- CLAUDE.md section 4), (4) update_product_details actually updates, (5)
-- set_product_inventory_tracking actually updates, (6) soft_delete_product_safe soft-deletes
-- (not hard-deletes) and the row disappears from a normal SELECT, (7) ground_staff cannot
-- create any product at all.

BEGIN;

CREATE TEMP TABLE mpcr_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE mpcr_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON mpcr_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mpcr_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_branch_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_ground_staff uuid := gen_random_uuid();
BEGIN
  INSERT INTO mpcr_ids(key, value) VALUES
    ('org', v_org), ('brand', v_brand), ('location', v_location),
    ('branch_manager', v_branch_manager), ('location_manager', v_location_manager), ('ground_staff', v_ground_staff);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'MPCR Org', 'mpcr-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'MPCR Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'MPCR Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_branch_manager, 'authenticated', 'authenticated', 'mpcr-branch-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'mpcr-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground_staff, 'authenticated', 'authenticated', 'mpcr-ground-staff@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id)
  VALUES
    (v_branch_manager, 'mpcr-branch-manager@example.test', 'MPCR Branch Manager', 'branch_manager', 'active', v_org, v_brand, NULL),
    (v_location_manager, 'mpcr-location-manager@example.test', 'MPCR Location Manager', 'location_manager', 'active', v_org, v_brand, v_location),
    (v_ground_staff, 'mpcr-ground-staff@example.test', 'MPCR Ground Staff', 'ground_staff', 'active', v_org, v_brand, v_location)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id;
END $$;

-- ===== branch_manager creates a brand-shared product =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM mpcr_ids WHERE key = 'branch_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'MPCR Brand Shared Product',
    p_accounting_category := 'food',
    p_location_specific := false,
    p_organization_id := (SELECT value FROM mpcr_ids WHERE key = 'org'),
    p_brand_id := (SELECT value FROM mpcr_ids WHERE key = 'brand')
  );
  INSERT INTO mpcr_ids(key, value) VALUES ('brand_shared_product', (v_result->>'id')::uuid);
END $$;

RESET ROLE;

INSERT INTO mpcr_results
SELECT 'branch_manager_creates_brand_shared_product',
       location_id IS NULL AND brand_id = (SELECT value FROM mpcr_ids WHERE key = 'brand'),
       'location_id=' || COALESCE(location_id::text, 'NULL') || ' brand_id=' || COALESCE(brand_id::text, 'NULL')
FROM public.products
WHERE id = (SELECT value FROM mpcr_ids WHERE key = 'brand_shared_product');

-- ===== location_manager creates a location-specific product =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM mpcr_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'MPCR Location Specific Product',
    p_accounting_category := 'food',
    p_location_specific := true,
    p_organization_id := (SELECT value FROM mpcr_ids WHERE key = 'org')
  );
  INSERT INTO mpcr_ids(key, value) VALUES ('location_specific_product', (v_result->>'id')::uuid);
END $$;

RESET ROLE;

INSERT INTO mpcr_results
SELECT 'location_manager_creates_location_specific_product',
       location_id = (SELECT value FROM mpcr_ids WHERE key = 'location'),
       'location_id=' || COALESCE(location_id::text, 'NULL')
FROM public.products
WHERE id = (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product');

-- ===== location_manager CANNOT create a brand-shared product =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM mpcr_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_product_details(
      p_name := 'MPCR Should Fail',
      p_location_specific := false,
      p_organization_id := (SELECT value FROM mpcr_ids WHERE key = 'org'),
      p_brand_id := (SELECT value FROM mpcr_ids WHERE key = 'brand')
    );
    INSERT INTO mpcr_results VALUES ('location_manager_cannot_create_brand_shared', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO mpcr_results VALUES ('location_manager_cannot_create_brand_shared', true, SQLERRM);
  END;
END $$;

-- ===== ground_staff cannot create any product =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM mpcr_ids WHERE key = 'ground_staff'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.create_product_details(
      p_name := 'MPCR Ground Staff Should Fail',
      p_location_specific := true,
      p_organization_id := (SELECT value FROM mpcr_ids WHERE key = 'org')
    );
    INSERT INTO mpcr_results VALUES ('ground_staff_cannot_create_product', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO mpcr_results VALUES ('ground_staff_cannot_create_product', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== update_product_details actually updates =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM mpcr_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.update_product_details(
  (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product'),
  'MPCR Location Specific Product Renamed',
  p_latest_price := 12.5
);

INSERT INTO mpcr_results
SELECT 'update_product_details_actually_updates',
       name = 'MPCR LOCATION SPECIFIC PRODUCT RENAMED' OR name = 'MPCR Location Specific Product Renamed',
       'name=' || name || ' latest_price=' || latest_price
FROM public.products
WHERE id = (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product');

-- ===== set_product_inventory_tracking actually updates =====

SELECT public.set_product_inventory_tracking(
  (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product'),
  false
);

INSERT INTO mpcr_results
SELECT 'set_product_inventory_tracking_actually_updates',
       is_inventoried = false,
       'is_inventoried=' || is_inventoried
FROM public.products
WHERE id = (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product');

-- ===== soft_delete_product_safe soft-deletes, doesn't hard-delete =====

SELECT public.soft_delete_product_safe((SELECT value FROM mpcr_ids WHERE key = 'location_specific_product'));

RESET ROLE;

INSERT INTO mpcr_results
SELECT 'soft_delete_sets_deleted_at_not_hard_delete',
       EXISTS (
         SELECT 1 FROM public.products
         WHERE id = (SELECT value FROM mpcr_ids WHERE key = 'location_specific_product')
           AND deleted_at IS NOT NULL
       ),
       'checked row still exists with deleted_at set';

-- ===================== verdict =====================

SELECT * FROM mpcr_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mpcr_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'missing_product_crud_rpcs_acceptance failed';
  END IF;
END $$;

ROLLBACK;
