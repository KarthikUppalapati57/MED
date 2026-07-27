-- Phase 6 Performance active-hierarchy security acceptance matrix.
-- This is a rollback-only seeded test: it validates the Performance guard
-- function without preserving test data.

BEGIN;

CREATE TEMP TABLE perf_phase6_ids(k text primary key, id uuid) ON COMMIT DROP;
CREATE TEMP TABLE perf_phase6_results(
  scenario text primary key,
  passed boolean not null,
  detail text
) ON COMMIT DROP;

INSERT INTO perf_phase6_ids(k, id) VALUES
  ('org_a', gen_random_uuid()),
  ('org_b', gen_random_uuid()),
  ('brand_a', gen_random_uuid()),
  ('brand_b', gen_random_uuid()),
  ('loc_a', gen_random_uuid()),
  ('loc_b_same_org_other_brand', gen_random_uuid()),
  ('loc_deleted', gen_random_uuid()),
  ('loc_other_org', gen_random_uuid()),
  ('ground_staff', gen_random_uuid()),
  ('location_manager', gen_random_uuid()),
  ('branch_manager', gen_random_uuid()),
  ('brand_manager', gen_random_uuid()),
  ('org_manager', gen_random_uuid()),
  ('tenant_super_admin', gen_random_uuid()),
  ('platform_admin', gen_random_uuid());

GRANT SELECT, INSERT, UPDATE, DELETE ON perf_phase6_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON perf_phase6_results TO authenticated, anon, service_role;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id,
       '00000000-0000-0000-0000-000000000000',
       'authenticated',
       'authenticated',
       k || '@performance-phase6.test',
       '{}'::jsonb,
       '{}'::jsonb,
       now(),
       now()
FROM perf_phase6_ids
WHERE k IN ('ground_staff','location_manager','branch_manager','brand_manager','org_manager','tenant_super_admin','platform_admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, enabled_modules)
VALUES
  ((SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), 'Performance Phase 6 Org A', 'perf-phase6-org-a-' || substr((SELECT id::text FROM perf_phase6_ids WHERE k = 'org_a'), 1, 8), '[]'::jsonb),
  ((SELECT id FROM perf_phase6_ids WHERE k = 'org_b'), 'Performance Phase 6 Org B', 'perf-phase6-org-b-' || substr((SELECT id::text FROM perf_phase6_ids WHERE k = 'org_b'), 1, 8), '[]'::jsonb);

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES
  ((SELECT id FROM perf_phase6_ids WHERE k = 'brand_a'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), 'Phase 6 Brand A'),
  ((SELECT id FROM perf_phase6_ids WHERE k = 'brand_b'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), 'Phase 6 Brand B');

INSERT INTO public.locations (id, organization_id, brand_id, name, deleted_at)
VALUES
  ((SELECT id FROM perf_phase6_ids WHERE k = 'loc_a'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), (SELECT id FROM perf_phase6_ids WHERE k = 'brand_a'), 'Phase 6 Active Location', NULL),
  ((SELECT id FROM perf_phase6_ids WHERE k = 'loc_b_same_org_other_brand'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), (SELECT id FROM perf_phase6_ids WHERE k = 'brand_b'), 'Phase 6 Other Brand Location', NULL),
  ((SELECT id FROM perf_phase6_ids WHERE k = 'loc_deleted'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), (SELECT id FROM perf_phase6_ids WHERE k = 'brand_a'), 'Phase 6 Deleted Location', now()),
  ((SELECT id FROM perf_phase6_ids WHERE k = 'loc_other_org'), (SELECT id FROM perf_phase6_ids WHERE k = 'org_b'), NULL, 'Phase 6 Other Org Location', NULL);

INSERT INTO public.profiles (
  id, email, full_name, role, organization_id, brand_id, location_id, access_level, status
)
SELECT id,
       k || '@performance-phase6.test',
       initcap(replace(k, '_', ' ')),
       k,
       CASE WHEN k = 'platform_admin' THEN NULL ELSE (SELECT id FROM perf_phase6_ids WHERE k = 'org_a') END,
       CASE WHEN k = 'platform_admin' THEN NULL ELSE (SELECT id FROM perf_phase6_ids WHERE k = 'brand_a') END,
       CASE WHEN k = 'platform_admin' THEN NULL ELSE (SELECT id FROM perf_phase6_ids WHERE k = 'loc_a') END,
       CASE WHEN k = 'platform_admin' THEN 'platform' ELSE 'location' END,
       'active'
FROM perf_phase6_ids
WHERE k IN ('ground_staff','location_manager','branch_manager','brand_manager','org_manager','tenant_super_admin','platform_admin')
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    access_level = EXCLUDED.access_level,
    status = EXCLUDED.status,
    deleted_at = NULL;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT (SELECT id FROM perf_phase6_ids WHERE k = 'org_a'), id, k
FROM perf_phase6_ids
WHERE k IN ('ground_staff','location_manager','branch_manager','brand_manager','org_manager','tenant_super_admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.set_phase6_actor(p_key text, p_db_role text DEFAULT 'authenticated')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE((SELECT id::text FROM perf_phase6_ids WHERE k = p_key), ''), true);
  PERFORM set_config('request.jwt.claim.role', p_db_role, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_performance_access(
  p_scenario text,
  p_actor_key text,
  p_db_role text,
  p_org_key text,
  p_location_key text,
  p_write boolean,
  p_should_allow boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean := false;
  v_detail text := NULL;
BEGIN
  BEGIN
    IF p_db_role = 'anon' THEN
      RESET ROLE;
      SET LOCAL ROLE anon;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claim.role', 'anon', true);
    ELSIF p_db_role = 'service_role' THEN
      RESET ROLE;
      SET LOCAL ROLE service_role;
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    ELSE
      RESET ROLE;
      SET LOCAL ROLE authenticated;
      PERFORM pg_temp.set_phase6_actor(p_actor_key, 'authenticated');
    END IF;

    PERFORM public.assert_performance_location_access(
      (SELECT id FROM perf_phase6_ids WHERE k = p_org_key),
      (SELECT id FROM perf_phase6_ids WHERE k = p_location_key),
      p_write
    );
    v_allowed := true;
    v_detail := 'allowed';
  EXCEPTION WHEN OTHERS THEN
    v_allowed := false;
    v_detail := SQLERRM;
  END;

  RESET ROLE;

  INSERT INTO perf_phase6_results(scenario, passed, detail)
  VALUES (p_scenario, v_allowed = p_should_allow, v_detail);
END;
$$;

SELECT pg_temp.expect_performance_access('anonymous_request_denied', NULL, 'anon', 'org_a', 'loc_a', false, false);
SELECT pg_temp.expect_performance_access('ground_staff_denied', 'ground_staff', 'authenticated', 'org_a', 'loc_a', false, false);
SELECT pg_temp.expect_performance_access('location_manager_active_location_allowed', 'location_manager', 'authenticated', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('location_manager_different_location_denied', 'location_manager', 'authenticated', 'org_a', 'loc_b_same_org_other_brand', false, false);
SELECT pg_temp.expect_performance_access('branch_manager_active_location_allowed', 'branch_manager', 'authenticated', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('branch_manager_inactive_location_denied', 'branch_manager', 'authenticated', 'org_a', 'loc_b_same_org_other_brand', false, false);
SELECT pg_temp.expect_performance_access('brand_manager_active_brand_location_allowed', 'brand_manager', 'authenticated', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('brand_manager_other_brand_denied', 'brand_manager', 'authenticated', 'org_a', 'loc_b_same_org_other_brand', false, false);
SELECT pg_temp.expect_performance_access('org_manager_active_location_allowed', 'org_manager', 'authenticated', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('org_manager_inactive_location_denied', 'org_manager', 'authenticated', 'org_a', 'loc_b_same_org_other_brand', false, false);
SELECT pg_temp.expect_performance_access('tenant_super_admin_active_hierarchy_allowed', 'tenant_super_admin', 'authenticated', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('cross_organization_request_denied', 'location_manager', 'authenticated', 'org_b', 'loc_other_org', false, false);
SELECT pg_temp.expect_performance_access('deleted_location_denied', 'location_manager', 'authenticated', 'org_a', 'loc_deleted', false, false);
SELECT pg_temp.expect_performance_access('service_role_valid_location_allowed', NULL, 'service_role', 'org_a', 'loc_a', false, true);
SELECT pg_temp.expect_performance_access('service_role_missing_location_denied', NULL, 'service_role', 'org_a', 'missing_location', false, false);
SELECT pg_temp.expect_performance_access('location_manager_budget_write_allowed', 'location_manager', 'authenticated', 'org_a', 'loc_a', true, true);
SELECT pg_temp.expect_performance_access('ground_staff_budget_write_denied', 'ground_staff', 'authenticated', 'org_a', 'loc_a', true, false);

DO $$
DECLARE
  v_failed text;
BEGIN
  SELECT string_agg(scenario || ': ' || detail, E'\n' ORDER BY scenario)
    INTO v_failed
  FROM perf_phase6_results
  WHERE NOT passed;

  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION 'Performance Phase 6 security matrix failed:%', E'\n' || v_failed;
  END IF;

  RAISE NOTICE 'performance_active_hierarchy_security_acceptance: PASSED';
END $$;

ROLLBACK;