-- Acceptance test for 20260722000014_org_level_reference_scope_visible.sql
--
-- Proves:
--   * Org-level products (brand_id NULL, location_id NULL) are visible in the same org
--   * Brand-shared and location-specific rules still require / match active location
--   * Cross-organization and cross-tenant products stay hidden

BEGIN;

CREATE TEMP TABLE orgvis_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE orgvis_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON orgvis_ids TO authenticated;
GRANT SELECT, INSERT ON orgvis_results TO authenticated;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b_same_tenant uuid := gen_random_uuid();
  v_org_other_tenant uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_brand_other uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_loc_b uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();
BEGIN
  INSERT INTO orgvis_ids(key, value) VALUES
    ('tenant_a', v_tenant_a),
    ('tenant_b', v_tenant_b),
    ('org_a', v_org_a),
    ('org_b_same_tenant', v_org_b_same_tenant),
    ('org_other_tenant', v_org_other_tenant),
    ('brand_a', v_brand_a),
    ('brand_other', v_brand_other),
    ('loc_a', v_loc_a),
    ('loc_b', v_loc_b),
    ('owner', v_owner),
    ('viewer', v_viewer);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'orgvis-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_viewer, 'authenticated', 'authenticated', 'orgvis-viewer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id) VALUES
    (v_tenant_a, 'OrgVis Tenant A', 'orgvis-tenant-a', v_owner),
    (v_tenant_b, 'OrgVis Tenant B', 'orgvis-tenant-b', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id) VALUES
    (v_org_a, v_tenant_a, 'OrgVis Org A', 'orgvis-org-a', v_owner),
    (v_org_b_same_tenant, v_tenant_a, 'OrgVis Org B', 'orgvis-org-b', v_owner),
    (v_org_other_tenant, v_tenant_b, 'OrgVis Other Tenant Org', 'orgvis-other-tenant-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES
    (v_brand_a, v_org_a, 'OrgVis Brand A'),
    (v_brand_other, v_org_b_same_tenant, 'OrgVis Brand Other');

  INSERT INTO public.locations (id, brand_id, organization_id, name) VALUES
    (v_loc_a, v_brand_a, v_org_a, 'OrgVis Location A'),
    (v_loc_b, v_brand_a, v_org_a, 'OrgVis Location B');

  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES (
    v_viewer, v_tenant_a, v_org_a, v_brand_a, v_loc_a,
    'orgvis-viewer@example.test', 'OrgVis Viewer', 'tenant_super_admin', 'organization', 'active'
  )
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

  INSERT INTO public.products (name, organization_id, brand_id, location_id) VALUES
    ('OrgVis Org Level', v_org_a, NULL, NULL),
    ('OrgVis Brand Shared', v_org_a, v_brand_a, NULL),
    ('OrgVis Location A', v_org_a, v_brand_a, v_loc_a),
    ('OrgVis Location B', v_org_a, v_brand_a, v_loc_b),
    ('OrgVis Cross Org', v_org_b_same_tenant, NULL, NULL),
    ('OrgVis Cross Tenant', v_org_other_tenant, NULL, NULL);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM orgvis_ids WHERE key = 'viewer'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO orgvis_results
SELECT 'org_level_visible_same_org',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_a'), NULL, NULL, NULL
       ) IS TRUE,
       'org-level same org';

INSERT INTO orgvis_results
SELECT 'brand_shared_visible_for_active_brand',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_a'),
         (SELECT value FROM orgvis_ids WHERE key = 'brand_a'),
         NULL,
         NULL
       ) IS TRUE,
       'brand-shared active brand';

INSERT INTO orgvis_results
SELECT 'location_specific_visible_exact_match',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_a'),
         (SELECT value FROM orgvis_ids WHERE key = 'brand_a'),
         (SELECT value FROM orgvis_ids WHERE key = 'loc_a'),
         NULL
       ) IS TRUE,
       'location A exact';

INSERT INTO orgvis_results
SELECT 'location_specific_hidden_sibling',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_a'),
         (SELECT value FROM orgvis_ids WHERE key = 'brand_a'),
         (SELECT value FROM orgvis_ids WHERE key = 'loc_b'),
         NULL
       ) IS FALSE,
       'location B sibling';

INSERT INTO orgvis_results
SELECT 'cross_organization_hidden',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_b_same_tenant'), NULL, NULL, NULL
       ) IS FALSE,
       'same tenant different org';

INSERT INTO orgvis_results
SELECT 'cross_tenant_hidden',
       public.reference_scope_visible(
         (SELECT value FROM orgvis_ids WHERE key = 'org_other_tenant'), NULL, NULL, NULL
       ) IS FALSE,
       'different tenant org';

INSERT INTO orgvis_results
SELECT 'products_rls_shows_org_brand_and_location_a',
       array_agg(name ORDER BY name) = ARRAY[
         'OrgVis Brand Shared',
         'OrgVis Location A',
         'OrgVis Org Level'
       ],
       'names=' || COALESCE(array_agg(name ORDER BY name)::text, '{}')
FROM public.products
WHERE name LIKE 'OrgVis %';

INSERT INTO orgvis_results
SELECT 'catalog_with_active_scope_includes_org_level',
       count(*) FILTER (WHERE name = 'OrgVis Org Level') = 1
         AND count(*) FILTER (WHERE name = 'OrgVis Brand Shared') = 1
         AND count(*) FILTER (WHERE name = 'OrgVis Location A') = 1
         AND count(*) FILTER (WHERE name = 'OrgVis Location B') = 0
         AND count(*) FILTER (WHERE name = 'OrgVis Cross Org') = 0
         AND count(*) FILTER (WHERE name = 'OrgVis Cross Tenant') = 0,
       'count=' || count(*)
FROM public.get_product_catalog(
  (SELECT value FROM orgvis_ids WHERE key = 'org_a'),
  (SELECT value FROM orgvis_ids WHERE key = 'brand_a'),
  (SELECT value FROM orgvis_ids WHERE key = 'loc_a'),
  NULL,
  'name',
  0,
  50
);

RESET ROLE;

SELECT * FROM orgvis_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orgvis_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'org_level_reference_scope_visible_acceptance failed: %',
      (SELECT string_agg(test_name || ' => ' || detail, ', ') FROM orgvis_results WHERE NOT passed);
  END IF;
END $$;

ROLLBACK;
