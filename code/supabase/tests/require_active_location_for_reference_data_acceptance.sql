-- Acceptance test for 20260721191500_require_active_location_for_reference_data.sql.
--
-- Proves: org_manager/tenant_super_admin/branch_manager see NOTHING in reference tables
-- (products) with no active location; once a location is active, they see that location's
-- specific rows AND the brand-shared rows for that location's brand -- but not a sibling
-- location's specific rows. Also proves location_manager can now see brand-shared rows too
-- (the incidental gap fix noted in the migration).

BEGIN;

CREATE TEMP TABLE refloc_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE refloc_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON refloc_ids TO authenticated;
GRANT SELECT, INSERT ON refloc_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_loc_b uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_org_mgr uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_branch_mgr uuid := gen_random_uuid();
  v_location_mgr uuid := gen_random_uuid();
BEGIN
  INSERT INTO refloc_ids(key, value) VALUES
    ('tenant', v_tenant), ('org', v_org), ('brand', v_brand),
    ('loc_a', v_loc_a), ('loc_b', v_loc_b), ('owner', v_owner),
    ('org_mgr', v_org_mgr), ('tenant_admin', v_tenant_admin),
    ('branch_mgr', v_branch_mgr), ('location_mgr', v_location_mgr);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'refloc-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_mgr, 'authenticated', 'authenticated', 'refloc-org-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_admin, 'authenticated', 'authenticated', 'refloc-tenant-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_mgr, 'authenticated', 'authenticated', 'refloc-branch-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_mgr, 'authenticated', 'authenticated', 'refloc-location-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Ref Loc Tenant', 'ref-loc-tenant', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Ref Loc Org', 'ref-loc-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Ref Loc Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_loc_a, v_brand, v_org, 'Ref Loc Location A'),
    (v_loc_b, v_brand, v_org, 'Ref Loc Location B');

  -- All start with location_id NULL -- nothing switched into yet.
  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_org_mgr, v_tenant, v_org, NULL, NULL, 'refloc-org-mgr@example.test', 'Ref Loc Org Mgr', 'org_manager', 'organization', 'active'),
    (v_tenant_admin, v_tenant, v_org, NULL, NULL, 'refloc-tenant-admin@example.test', 'Ref Loc Tenant Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_branch_mgr, v_tenant, v_org, v_brand, NULL, 'refloc-branch-mgr@example.test', 'Ref Loc Branch Mgr', 'branch_manager', 'brand', 'active'),
    (v_location_mgr, v_tenant, v_org, v_brand, v_loc_a, 'refloc-location-mgr@example.test', 'Ref Loc Location Mgr', 'location_manager', 'location', 'active')
  ON CONFLICT (id) DO UPDATE
     SET tenant_id = EXCLUDED.tenant_id,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         role = EXCLUDED.role,
         access_level = EXCLUDED.access_level,
         status = EXCLUDED.status,
         deleted_at = NULL,
         updated_at = now();

  -- Location-A-specific product, and a brand-shared product (location NULL).
  INSERT INTO public.products (name, organization_id, brand_id, location_id)
  VALUES
    ('Ref Loc Location A Product', v_org, v_brand, v_loc_a),
    ('Ref Loc Brand Shared Product', v_org, v_brand, NULL);
END $$;

-- ===================== org_manager: null sees nothing, active location unlocks both =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'org_manager_null_location_sees_zero_products',
       count(*) = 0,
       'count=' || count(*)
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM refloc_ids WHERE key = 'loc_a')
WHERE id = (SELECT value FROM refloc_ids WHERE key = 'org_mgr');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'org_manager_at_location_a_sees_specific_and_brand_shared',
       array_agg(name ORDER BY name) = ARRAY['Ref Loc Brand Shared Product', 'Ref Loc Location A Product'],
       'names=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

-- ===================== tenant_super_admin: null sees nothing, location B sees brand-shared but not A's =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'tenant_admin_null_location_sees_zero_products',
       count(*) = 0,
       'count=' || count(*)
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM refloc_ids WHERE key = 'loc_b')
WHERE id = (SELECT value FROM refloc_ids WHERE key = 'tenant_admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'tenant_admin_at_location_b_sees_brand_shared_not_location_a',
       array_agg(name ORDER BY name) = ARRAY['Ref Loc Brand Shared Product'],
       'names=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

-- ===================== branch_manager: same rule =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'branch_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'branch_manager_null_location_sees_zero_products',
       count(*) = 0,
       'count=' || count(*)
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM refloc_ids WHERE key = 'loc_a')
WHERE id = (SELECT value FROM refloc_ids WHERE key = 'branch_mgr');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'branch_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'branch_manager_at_location_a_sees_specific_and_brand_shared',
       array_agg(name ORDER BY name) = ARRAY['Ref Loc Brand Shared Product', 'Ref Loc Location A Product'],
       'names=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

-- ===================== location_manager: gap fix -- can now see the brand-shared row too =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM refloc_ids WHERE key = 'location_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO refloc_results
SELECT 'location_manager_sees_own_location_and_brand_shared',
       array_agg(name ORDER BY name) = ARRAY['Ref Loc Brand Shared Product', 'Ref Loc Location A Product'],
       'names=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.products
WHERE name IN ('Ref Loc Location A Product', 'Ref Loc Brand Shared Product');

RESET ROLE;

-- ===================== verdict =====================

SELECT *
FROM refloc_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM refloc_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'require_active_location_for_reference_data_acceptance failed';
  END IF;
END $$;

ROLLBACK;
