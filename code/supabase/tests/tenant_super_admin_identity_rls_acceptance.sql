-- Acceptance test that actually exercises RLS (not just helper-function booleans) for the
-- 20260718000001-3 identity/hierarchy fixes: profiles, organizations, brands, locations.
--
-- The existing tenant_super_admin_org_manager_acceptance.sql only asserts access_role_rank()/
-- normalize_app_role() as the postgres superuser (which bypasses RLS entirely) -- it never
-- caught the profiles/brands/locations/organizations gaps because it never ran a real query
-- under RLS as an impersonated user. This test uses the SET LOCAL ROLE authenticated +
-- request.jwt.claim.sub impersonation pattern already established in
-- hierarchical_rls_batch1_financial_acceptance.sql.
--
-- Order matches apply order: organizations is exercised first since brands/locations INSERT/
-- UPDATE policies depend on organizations RLS being correct (see the plan's Ordering note).

BEGIN;

CREATE TEMP TABLE identity_rls_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE identity_rls_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON identity_rls_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity_rls_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_brand_a1 uuid := gen_random_uuid();
  v_brand_b1 uuid := gen_random_uuid();
  v_loc_a1 uuid := gen_random_uuid();
  v_org_manager_a uuid := gen_random_uuid();
  v_org_manager_b uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_branch_mgr_a uuid := gen_random_uuid();
  v_location_mgr_a uuid := gen_random_uuid();
BEGIN
  INSERT INTO identity_rls_ids(key, value) VALUES
    ('tenant', v_tenant), ('org_a', v_org_a), ('org_b', v_org_b),
    ('brand_a1', v_brand_a1), ('brand_b1', v_brand_b1), ('loc_a1', v_loc_a1),
    ('org_manager_a', v_org_manager_a), ('org_manager_b', v_org_manager_b),
    ('tenant_admin', v_tenant_admin), ('branch_mgr_a', v_branch_mgr_a),
    ('location_mgr_a', v_location_mgr_a);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager_a, 'authenticated', 'authenticated', 'irls-org-manager-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_manager_b, 'authenticated', 'authenticated', 'irls-org-manager-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_admin, 'authenticated', 'authenticated', 'irls-tenant-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_mgr_a, 'authenticated', 'authenticated', 'irls-branch-mgr-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_mgr_a, 'authenticated', 'authenticated', 'irls-location-mgr-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Identity RLS Tenant', 'identity-rls-tenant', v_tenant_admin);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES
    (v_org_a, v_tenant, 'Identity RLS Org A', 'identity-rls-org-a', v_org_manager_a),
    (v_org_b, v_tenant, 'Identity RLS Org B', 'identity-rls-org-b', v_org_manager_b);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand_a1, v_org_a, 'Identity RLS Brand A1'),
    (v_brand_b1, v_org_b, 'Identity RLS Brand B1');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc_a1, v_brand_a1, v_org_a, 'Identity RLS Location A1');

  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_org_manager_a, v_tenant, v_org_a, NULL, NULL, 'irls-org-manager-a@example.test', 'Org Manager A', 'org_manager', 'organization', 'active'),
    (v_org_manager_b, v_tenant, v_org_b, NULL, NULL, 'irls-org-manager-b@example.test', 'Org Manager B', 'org_manager', 'organization', 'active'),
    (v_tenant_admin, v_tenant, v_org_a, NULL, NULL, 'irls-tenant-admin@example.test', 'Tenant Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_branch_mgr_a, v_tenant, v_org_a, v_brand_a1, NULL, 'irls-branch-mgr-a@example.test', 'Branch Mgr A', 'branch_manager', 'brand', 'active'),
    (v_location_mgr_a, v_tenant, v_org_a, v_brand_a1, v_loc_a1, 'irls-location-mgr-a@example.test', 'Location Mgr A', 'location_manager', 'location', 'active');
END $$;

-- ===================== organizations (must pass before brands/locations below) =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO identity_rls_results
SELECT 'tenant_admin_sees_both_orgs_in_tenant',
       count(*) = 2,
       'count=' || count(*)
FROM public.organizations
WHERE id IN (SELECT value FROM identity_rls_ids WHERE key IN ('org_a', 'org_b'));

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'org_manager_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO identity_rls_results
SELECT 'org_manager_sees_only_own_org',
       array_agg(id) = ARRAY[(SELECT value FROM identity_rls_ids WHERE key = 'org_a')],
       'ids=' || COALESCE(array_agg(id)::text, '{}')
FROM public.organizations
WHERE id IN (SELECT value FROM identity_rls_ids WHERE key IN ('org_a', 'org_b'));

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.organizations
  SET name = 'HIJACKED'
  WHERE id = (SELECT value FROM identity_rls_ids WHERE key = 'org_b');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO identity_rls_results VALUES (
    'org_manager_cannot_update_other_org',
    v_rows = 0,
    'rows_affected=' || v_rows
  );
END $$;

RESET ROLE;

-- ===================== profiles =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'org_manager_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO identity_rls_results
SELECT 'org_manager_sees_profile_in_own_org',
       count(*) = 1,
       'count=' || count(*)
FROM public.profiles
WHERE id = (SELECT value FROM identity_rls_ids WHERE key = 'location_mgr_a');

INSERT INTO identity_rls_results
SELECT 'org_manager_cannot_see_profile_in_other_org',
       count(*) = 0,
       'count=' || count(*)
FROM public.profiles
WHERE id = (SELECT value FROM identity_rls_ids WHERE key = 'org_manager_b');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO identity_rls_results
SELECT 'tenant_admin_sees_profiles_across_both_orgs',
       count(*) = 2,
       'count=' || count(*)
FROM public.profiles
WHERE id IN (SELECT value FROM identity_rls_ids WHERE key IN ('org_manager_a', 'org_manager_b'));

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'location_mgr_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO identity_rls_results
SELECT 'location_manager_unchanged_scoped_to_self',
       array_agg(id) = ARRAY[(SELECT value FROM identity_rls_ids WHERE key = 'location_mgr_a')],
       'ids=' || COALESCE(array_agg(id)::text, '{}')
FROM public.profiles
WHERE id IN (SELECT value FROM identity_rls_ids WHERE key IN ('location_mgr_a', 'org_manager_a', 'branch_mgr_a'));

RESET ROLE;

-- ===================== brands =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'org_manager_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES (gen_random_uuid(), (SELECT value FROM identity_rls_ids WHERE key = 'org_a'), 'Org Manager Created Brand A2');

INSERT INTO identity_rls_results VALUES (
  'org_manager_can_create_brand_in_own_org',
  true,
  'insert succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.brands (brand_id, organization_id, name)
    VALUES (gen_random_uuid(), (SELECT value FROM identity_rls_ids WHERE key = 'org_b'), 'Org Manager Cross-Org Brand Attempt');

    INSERT INTO identity_rls_results VALUES (
      'org_manager_cannot_create_brand_in_other_org',
      false,
      'cross-org insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'org_manager_cannot_create_brand_in_other_org',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES (gen_random_uuid(), (SELECT value FROM identity_rls_ids WHERE key = 'org_b'), 'Tenant Admin Cross-Org Brand');

INSERT INTO identity_rls_results VALUES (
  'tenant_admin_can_create_brand_in_either_org',
  true,
  'cross-org insert succeeded'
);

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'branch_mgr_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.brands (brand_id, organization_id, name)
    VALUES (gen_random_uuid(), (SELECT value FROM identity_rls_ids WHERE key = 'org_a'), 'Branch Manager Sibling Brand Attempt');

    INSERT INTO identity_rls_results VALUES (
      'branch_manager_cannot_create_brand',
      false,
      'branch_manager brand insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'branch_manager_cannot_create_brand',
      true,
      SQLERRM
    );
  END;
END $$;

UPDATE public.brands
SET name = 'Identity RLS Brand A1 Updated'
WHERE brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1');

INSERT INTO identity_rls_results
SELECT 'branch_manager_can_update_own_brand',
       name = 'Identity RLS Brand A1 Updated',
       name
FROM public.brands
WHERE brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1');

-- Re-parenting guard: branch_manager cannot move their own brand to another org.
DO $$
BEGIN
  BEGIN
    UPDATE public.brands
    SET organization_id = (SELECT value FROM identity_rls_ids WHERE key = 'org_b')
    WHERE brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1');

    INSERT INTO identity_rls_results VALUES (
      'brand_reparent_across_org_denied',
      false,
      're-parent update unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'brand_reparent_across_org_denied',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

-- Confirm org_a's brand was not actually moved by any of the above (belt-and-suspenders,
-- run as postgres so it's unaffected by RLS).
INSERT INTO identity_rls_results
SELECT 'brand_a1_organization_id_unchanged',
       organization_id = (SELECT value FROM identity_rls_ids WHERE key = 'org_a'),
       'organization_id=' || organization_id
FROM public.brands
WHERE brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1');

-- ===================== locations =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM identity_rls_ids WHERE key = 'branch_mgr_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.locations (id, brand_id, organization_id, name)
VALUES (
  gen_random_uuid(),
  (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1'),
  (SELECT value FROM identity_rls_ids WHERE key = 'org_a'),
  'Branch Manager Created Location'
);

INSERT INTO identity_rls_results VALUES (
  'branch_manager_can_create_location_under_own_brand',
  true,
  'insert succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.locations (id, brand_id, organization_id, name)
    VALUES (
      gen_random_uuid(),
      (SELECT value FROM identity_rls_ids WHERE key = 'brand_b1'),
      (SELECT value FROM identity_rls_ids WHERE key = 'org_b'),
      'Branch Manager Out-Of-Scope Location Attempt'
    );

    INSERT INTO identity_rls_results VALUES (
      'branch_manager_cannot_create_location_outside_accessible_brand',
      false,
      'out-of-scope location insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'branch_manager_cannot_create_location_outside_accessible_brand',
      true,
      SQLERRM
    );
  END;
END $$;

DO $$
BEGIN
  BEGIN
    -- accessible brand (brand_a1) but organization_id deliberately mismatched -> integrity check.
    INSERT INTO public.locations (id, brand_id, organization_id, name)
    VALUES (
      gen_random_uuid(),
      (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1'),
      (SELECT value FROM identity_rls_ids WHERE key = 'org_b'),
      'Mismatched Org Location Attempt'
    );

    INSERT INTO identity_rls_results VALUES (
      'location_insert_with_mismatched_org_denied',
      false,
      'mismatched-org location insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'location_insert_with_mismatched_org_denied',
      true,
      SQLERRM
    );
  END;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.locations
    SET brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_b1')
    WHERE id = (SELECT value FROM identity_rls_ids WHERE key = 'loc_a1');

    INSERT INTO identity_rls_results VALUES (
      'location_reparent_to_inaccessible_brand_denied',
      false,
      're-parent update unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO identity_rls_results VALUES (
      'location_reparent_to_inaccessible_brand_denied',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

INSERT INTO identity_rls_results
SELECT 'loc_a1_brand_id_unchanged',
       brand_id = (SELECT value FROM identity_rls_ids WHERE key = 'brand_a1'),
       'brand_id=' || brand_id
FROM public.locations
WHERE id = (SELECT value FROM identity_rls_ids WHERE key = 'loc_a1');

-- ===================== verdict =====================

SELECT *
FROM identity_rls_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity_rls_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'tenant_super_admin_identity_rls_acceptance failed';
  END IF;
END $$;

ROLLBACK;
