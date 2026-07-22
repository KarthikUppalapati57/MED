-- Acceptance test for 20260722000014_audit_logs_hierarchy_visibility.sql.
--
-- Proves the hierarchy predicate audit_log_scope_visible(): platform_admin sees everything;
-- tenant_super_admin sees every org in their own tenant (not a sibling tenant); org_manager
-- sees their whole org across every brand/location plus org-level (NULL-tier) rows, but not
-- another org; branch_manager sees only their own brand's rows, not a sibling brand in the
-- same org and not the org-level NULL-tier; location_manager and ground_staff each see only
-- their own location's rows. The ground_staff case is the one that fails without the local
-- OR-fallback in the function (get_my_accessible_location_ids() has no ground_staff branch)
-- -- it's the proof that regression never shipped. Also proves the write side: the
-- process_audit_log() trigger captures brand_id/location_id from the source row, and the
-- log_audit_event() RPC persists brand_id/location_id when supplied.

BEGIN;

CREATE TEMP TABLE alh_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE alh_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON alh_ids TO authenticated;
GRANT SELECT, INSERT ON alh_results TO authenticated;

DO $$
DECLARE
  v_tenant1 uuid := gen_random_uuid();
  v_tenant2 uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_org_c uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_platform_admin uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_org_mgr uuid := gen_random_uuid();
  v_branch_mgr uuid := gen_random_uuid();
  v_location_mgr uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_inventory_id uuid;
BEGIN
  INSERT INTO alh_ids(key, value) VALUES
    ('tenant1', v_tenant1), ('tenant2', v_tenant2),
    ('org_a', v_org_a), ('org_b', v_org_b), ('org_c', v_org_c),
    ('brand1', v_brand1), ('brand2', v_brand2),
    ('loc1', v_loc1), ('loc2', v_loc2), ('owner', v_owner),
    ('platform_admin', v_platform_admin), ('tenant_admin', v_tenant_admin),
    ('org_mgr', v_org_mgr), ('branch_mgr', v_branch_mgr),
    ('location_mgr', v_location_mgr), ('ground', v_ground);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'alh-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_platform_admin, 'authenticated', 'authenticated', 'alh-platform-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_admin, 'authenticated', 'authenticated', 'alh-tenant-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_mgr, 'authenticated', 'authenticated', 'alh-org-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_mgr, 'authenticated', 'authenticated', 'alh-branch-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_mgr, 'authenticated', 'authenticated', 'alh-location-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'alh-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id) VALUES
    (v_tenant1, 'ALH Tenant One', 'alh-tenant-one', v_owner),
    (v_tenant2, 'ALH Tenant Two', 'alh-tenant-two', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id) VALUES
    (v_org_a, v_tenant1, 'ALH Org A', 'alh-org-a', v_owner),
    (v_org_b, v_tenant1, 'ALH Org B', 'alh-org-b', v_owner),
    (v_org_c, v_tenant2, 'ALH Org C', 'alh-org-c', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES
    (v_brand1, v_org_a, 'ALH Brand One'),
    (v_brand2, v_org_a, 'ALH Brand Two');

  INSERT INTO public.locations (id, brand_id, organization_id, name) VALUES
    (v_loc1, v_brand1, v_org_a, 'ALH Location One'),
    (v_loc2, v_brand2, v_org_a, 'ALH Location Two');

  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_platform_admin, NULL, NULL, NULL, NULL, 'alh-platform-admin@example.test', 'ALH Platform Admin', 'platform_admin', 'platform', 'active'),
    (v_tenant_admin, v_tenant1, v_org_a, NULL, NULL, 'alh-tenant-admin@example.test', 'ALH Tenant Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_org_mgr, v_tenant1, v_org_a, NULL, NULL, 'alh-org-mgr@example.test', 'ALH Org Mgr', 'org_manager', 'organization', 'active'),
    (v_branch_mgr, v_tenant1, v_org_a, v_brand1, NULL, 'alh-branch-mgr@example.test', 'ALH Branch Mgr', 'branch_manager', 'brand', 'active'),
    (v_location_mgr, v_tenant1, v_org_a, v_brand1, v_loc1, 'alh-location-mgr@example.test', 'ALH Location Mgr', 'location_manager', 'location', 'active'),
    (v_ground, v_tenant1, v_org_a, v_brand1, v_loc1, 'alh-ground@example.test', 'ALH Ground', 'ground_staff', 'location', 'active')
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

  -- Seed 5 audit_logs rows directly (as postgres, bypassing RLS) covering every tier.
  INSERT INTO public.audit_logs (organization_id, brand_id, location_id, action, table_name) VALUES
    (v_org_a, NULL, NULL, 'ALH_SEED_ORG_A_NULL_TIER', 'test_seed'),
    (v_org_a, v_brand1, v_loc1, 'ALH_SEED_ORG_A_BRAND1_LOC1', 'test_seed'),
    (v_org_a, v_brand2, v_loc2, 'ALH_SEED_ORG_A_BRAND2_LOC2', 'test_seed'),
    (v_org_b, NULL, NULL, 'ALH_SEED_ORG_B_NULL_TIER', 'test_seed'),
    (v_org_c, NULL, NULL, 'ALH_SEED_ORG_C_NULL_TIER', 'test_seed');

  -- Case 7: trigger captures brand_id/location_id on a real inventory insert (as postgres,
  -- to isolate this from inventory's own RLS -- the point here is process_audit_log(), not
  -- inventory's insert policy).
  INSERT INTO public.inventory (organization_id, brand_id, location_id, product_name)
  VALUES (v_org_a, v_brand1, v_loc1, 'ALH Trigger Test Product')
  RETURNING id INTO v_inventory_id;

  INSERT INTO alh_results
  SELECT 'trigger_captures_brand_and_location_on_inventory_insert',
         organization_id = v_org_a AND brand_id = v_brand1 AND location_id = v_loc1,
         'org=' || organization_id || ' brand=' || brand_id || ' location=' || location_id
  FROM public.audit_logs
  WHERE table_name = 'inventory' AND record_id = v_inventory_id;
END $$;

-- ===================== platform_admin: sees everything =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'platform_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'platform_admin_sees_all_five_seeded_rows',
       count(*) = 5,
       'count=' || count(*)
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== tenant_super_admin: whole tenant, not a sibling tenant =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'tenant_admin_sees_org_a_and_org_b_not_org_c',
       array_agg(action ORDER BY action) = ARRAY[
         'ALH_SEED_ORG_A_BRAND1_LOC1', 'ALH_SEED_ORG_A_BRAND2_LOC2',
         'ALH_SEED_ORG_A_NULL_TIER', 'ALH_SEED_ORG_B_NULL_TIER'
       ],
       'actions=' || COALESCE(array_agg(action ORDER BY action)::text, '{}')
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== org_manager: whole org_a, not org_b/org_c =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'org_manager_sees_whole_org_a_not_org_b_or_org_c',
       array_agg(action ORDER BY action) = ARRAY[
         'ALH_SEED_ORG_A_BRAND1_LOC1', 'ALH_SEED_ORG_A_BRAND2_LOC2', 'ALH_SEED_ORG_A_NULL_TIER'
       ],
       'actions=' || COALESCE(array_agg(action ORDER BY action)::text, '{}')
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== branch_manager: only own brand1/loc1, not brand2, not NULL tier =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'branch_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'branch_manager_sees_only_own_brand1_loc1_row',
       array_agg(action ORDER BY action) = ARRAY['ALH_SEED_ORG_A_BRAND1_LOC1'],
       'actions=' || COALESCE(array_agg(action ORDER BY action)::text, '{}')
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== location_manager: only own location =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'location_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'location_manager_sees_only_own_location_row',
       array_agg(action ORDER BY action) = ARRAY['ALH_SEED_ORG_A_BRAND1_LOC1'],
       'actions=' || COALESCE(array_agg(action ORDER BY action)::text, '{}')
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== ground_staff: only own location =====================
-- This is the case that fails without the OR-fallback fix in audit_log_scope_visible() --
-- get_my_accessible_location_ids() has no ground_staff branch, so composing it alone would
-- silently return zero rows here.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'ground_staff_sees_only_own_location_row',
       array_agg(action ORDER BY action) = ARRAY['ALH_SEED_ORG_A_BRAND1_LOC1'],
       'actions=' || COALESCE(array_agg(action ORDER BY action)::text, '{}')
FROM public.audit_logs
WHERE action LIKE 'ALH_SEED_%';

RESET ROLE;

-- ===================== log_audit_event RPC persists brand_id/location_id =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM alh_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO alh_results
SELECT 'log_audit_event_rpc_persists_brand_and_location',
       (r.result->>'brand_id')::uuid = (SELECT value FROM alh_ids WHERE key = 'brand1')
       AND (r.result->>'location_id')::uuid = (SELECT value FROM alh_ids WHERE key = 'loc1'),
       'result=' || r.result::text
FROM (
  SELECT public.log_audit_event(jsonb_build_object(
    'organization_id', (SELECT value::text FROM alh_ids WHERE key = 'org_a'),
    'brand_id', (SELECT value::text FROM alh_ids WHERE key = 'brand1'),
    'location_id', (SELECT value::text FROM alh_ids WHERE key = 'loc1'),
    'action', 'ALH_RPC_TEST',
    'table_name', 'test_rpc'
  )) AS result
) r;

RESET ROLE;

-- ===================== verdict =====================

SELECT *
FROM alh_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM alh_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'audit_logs_hierarchy_visibility_acceptance failed';
  END IF;
END $$;

ROLLBACK;
