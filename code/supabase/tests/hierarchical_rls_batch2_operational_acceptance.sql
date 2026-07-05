BEGIN;

CREATE TEMP TABLE batch2_rls_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE batch2_rls_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON batch2_rls_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch2_rls_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_choto uuid := gen_random_uuid();
  v_seymore uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_choto_manager uuid := gen_random_uuid();
  v_seymore_manager uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_product_deleted uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch2_rls_ids(key, value) VALUES
    ('org', v_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('choto', v_choto),
    ('seymore', v_seymore),
    ('owner', v_owner),
    ('branch', v_branch),
    ('choto_manager', v_choto_manager),
    ('seymore_manager', v_seymore_manager),
    ('ground', v_ground),
    ('product_deleted', v_product_deleted);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'batch2-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch2-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_choto_manager, 'authenticated', 'authenticated', 'batch2-choto-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_seymore_manager, 'authenticated', 'authenticated', 'batch2-seymore-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch2-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 2 Operational RLS Org', 'batch-2-operational-rls-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Batch 2 Brand 1'),
    (v_brand2, v_org, 'Batch 2 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_choto, v_brand1, v_org, 'Choto'),
    (v_seymore, v_brand1, v_org, 'Seymore');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id,
    access_level, invoice_approval_limit
  ) VALUES
    (v_owner, 'batch2-owner@example.test', 'Batch 2 Owner', 'org_owner', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'batch2-branch@example.test', 'Batch 2 Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_choto_manager, 'batch2-choto-manager@example.test', 'Batch 2 Choto Manager', 'location_manager', v_org, v_brand1, v_choto, 'location', 500),
    (v_seymore_manager, 'batch2-seymore-manager@example.test', 'Batch 2 Seymore Manager', 'location_manager', v_org, v_brand1, v_seymore, 'location', 500),
    (v_ground, 'batch2-ground@example.test', 'Batch 2 Ground', 'ground_staff', v_org, v_brand1, v_choto, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         invoice_approval_limit = EXCLUDED.invoice_approval_limit,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_owner'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_choto_manager, 'location_manager'),
    (v_org, v_seymore_manager, 'location_manager'),
    (v_org, v_ground, 'ground_staff');

  INSERT INTO public.vendors (name, organization_id, brand_id, location_id, created_by)
  VALUES
    ('US Foods', v_org, v_brand1, NULL, v_owner),
    ('Joe''s Corner Market', v_org, v_brand1, v_choto, v_owner),
    ('Seymore Produce', v_org, v_brand1, v_seymore, v_owner);

  INSERT INTO public.inventory (
    product_name, current_quantity, current_unit, organization_id, brand_id, location_id
  ) VALUES
    ('Choto Lettuce', 10, 'case', v_org, v_brand1, v_choto),
    ('Seymore Lettuce', 20, 'case', v_org, v_brand1, v_seymore);

  INSERT INTO public.wastage_logs (
    product_name, quantity, unit, reason, organization_id, brand_id, location_id, logged_by
  ) VALUES (
    'Choto Lettuce', 1, 'case', 'damaged', v_org, v_brand1, v_choto, v_ground
  );

  INSERT INTO public.products (
    id, name, organization_id, brand_id, location_id, deleted_at, deleted_by
  ) VALUES (
    v_product_deleted, 'Deleted Product', v_org, v_brand1, v_choto, now(), v_owner
  );
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch2_rls_ids WHERE key = 'choto_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch2_rls_results
SELECT 'choto_manager_sees_brand_shared_and_choto_vendor',
       array_agg(name ORDER BY name) = ARRAY['Joe''s Corner Market', 'US Foods'],
       'vendors=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.vendors
WHERE organization_id = (SELECT value FROM batch2_rls_ids WHERE key = 'org');

INSERT INTO public.vendors (
  name, organization_id, brand_id, location_id, created_by
) VALUES (
  'Choto Manager Vendor',
  (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'choto'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'choto_manager')
);

INSERT INTO batch2_rls_results VALUES (
  'location_manager_can_insert_location_vendor',
  true,
  'insert succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.vendors (
      name, organization_id, brand_id, location_id, created_by
    ) VALUES (
      'Forbidden Brand Shared Vendor',
      (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
      (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
      NULL,
      (SELECT value FROM batch2_rls_ids WHERE key = 'choto_manager')
    );

    INSERT INTO batch2_rls_results VALUES (
      'location_manager_cannot_insert_brand_shared_vendor',
      false,
      'insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO batch2_rls_results VALUES (
      'location_manager_cannot_insert_brand_shared_vendor',
      true,
      SQLERRM
    );
  END;
END $$;

INSERT INTO batch2_rls_results
SELECT 'location_manager_sees_only_own_inventory',
       array_agg(product_name ORDER BY product_name) = ARRAY['Choto Lettuce'],
       'inventory=' || COALESCE(array_agg(product_name ORDER BY product_name)::text, '{}')
FROM public.inventory
WHERE organization_id = (SELECT value FROM batch2_rls_ids WHERE key = 'org');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch2_rls_ids WHERE key = 'seymore_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch2_rls_results
SELECT 'seymore_manager_does_not_see_choto_vendor',
       count(*) = 0,
       'joe_count=' || count(*)
FROM public.vendors
WHERE name = 'Joe''s Corner Market';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch2_rls_ids WHERE key = 'branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch2_rls_results
SELECT 'branch_manager_sees_both_locations_and_brand_shared',
       array_agg(name ORDER BY name) = ARRAY['Choto Manager Vendor', 'Joe''s Corner Market', 'Seymore Produce', 'US Foods'],
       'vendors=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.vendors
WHERE organization_id = (SELECT value FROM batch2_rls_ids WHERE key = 'org');

INSERT INTO public.vendors (
  name, organization_id, brand_id, location_id, created_by
) VALUES (
  'Branch Shared Vendor',
  (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
  NULL,
  (SELECT value FROM batch2_rls_ids WHERE key = 'branch')
);

INSERT INTO batch2_rls_results VALUES (
  'branch_manager_can_insert_brand_shared_vendor',
  true,
  'insert succeeded'
);

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch2_rls_ids WHERE key = 'ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.wastage_logs (
  product_name, quantity, unit, reason, organization_id, brand_id, location_id, logged_by
) VALUES (
  'Ground Waste', 2, 'each', 'other',
  (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'choto'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'ground')
);

INSERT INTO public.inventory (
  product_name, current_quantity, current_unit, organization_id, brand_id, location_id
) VALUES (
  'Ground Inventory', 3, 'each',
  (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
  (SELECT value FROM batch2_rls_ids WHERE key = 'choto')
);

INSERT INTO batch2_rls_results VALUES (
  'ground_staff_can_insert_wastage_and_inventory',
  true,
  'both inserts succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.vendors (
      name, organization_id, brand_id, location_id, created_by
    ) VALUES (
      'Ground Vendor',
      (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
      (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
      (SELECT value FROM batch2_rls_ids WHERE key = 'choto'),
      (SELECT value FROM batch2_rls_ids WHERE key = 'ground')
    );

    INSERT INTO batch2_rls_results VALUES (
      'ground_staff_cannot_write_vendors_products_recipes',
      false,
      'vendor insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    BEGIN
      INSERT INTO public.products (
        name, organization_id, brand_id, location_id, created_by
      ) VALUES (
        'Ground Product',
        (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
        (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
        (SELECT value FROM batch2_rls_ids WHERE key = 'choto'),
        (SELECT value FROM batch2_rls_ids WHERE key = 'ground')
      );

      INSERT INTO batch2_rls_results VALUES (
        'ground_staff_cannot_write_vendors_products_recipes',
        false,
        'product insert unexpectedly succeeded after vendor denial'
      );
    EXCEPTION WHEN others THEN
      BEGIN
        INSERT INTO public.recipes (
          name, organization_id, brand_id, location_id, created_by
        ) VALUES (
          'Ground Recipe',
          (SELECT value FROM batch2_rls_ids WHERE key = 'org'),
          (SELECT value FROM batch2_rls_ids WHERE key = 'brand1'),
          (SELECT value FROM batch2_rls_ids WHERE key = 'choto'),
          (SELECT value FROM batch2_rls_ids WHERE key = 'ground')
        );

        INSERT INTO batch2_rls_results VALUES (
          'ground_staff_cannot_write_vendors_products_recipes',
          false,
          'recipe insert unexpectedly succeeded after vendor/product denial'
        );
      EXCEPTION WHEN others THEN
        INSERT INTO batch2_rls_results VALUES (
          'ground_staff_cannot_write_vendors_products_recipes',
          true,
          'all three reference writes denied'
        );
      END;
    END;
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch2_rls_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch2_rls_results
SELECT 'soft_deleted_product_hidden_from_all',
       count(*) = 0,
       'deleted_product_count=' || count(*)
FROM public.products
WHERE id = (SELECT value FROM batch2_rls_ids WHERE key = 'product_deleted');

RESET ROLE;

INSERT INTO batch2_rls_results VALUES (
  'anon_truncate_denied_on_inventory',
  NOT has_table_privilege('anon', 'public.inventory', 'TRUNCATE'),
  'anon truncate privilege=' || has_table_privilege('anon', 'public.inventory', 'TRUNCATE')
);

SELECT *
FROM batch2_rls_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch2_rls_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 2 operational RLS acceptance test failed';
  END IF;
END $$;

ROLLBACK;
