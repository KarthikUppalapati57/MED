-- Acceptance test for the waste_trend location-scope fix in
-- 20260721000050_inventory_usage_report.sql (get_inventory_usage_report).
--
-- Proves: waste_trend now calls tenant_scope_visible() like every other data source in this
-- function (scoped_inventory already did; waste_trend was the one exception, summing
-- wastage_logs.value/quantity directly with no independent server-side scope check beyond the
-- caller-supplied p_location_ids array). An org_manager-tier caller active at Location A must
-- see only Location A's waste in the report, never Location B's, regardless of what
-- p_location_ids they pass.
--
-- NOTE: get_inventory_usage_report is not yet applied to this local DB (part of the
-- unapplied 20260721+ migration backlog) -- this test cannot be executed until that backlog is
-- caught up. Written and reviewed against the corrected CTE so it's ready to run then.

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE waste_scope_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE waste_scope_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON waste_scope_ids TO authenticated;
GRANT SELECT, INSERT ON waste_scope_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_loc_b uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_org_mgr uuid := gen_random_uuid();
BEGIN
  INSERT INTO waste_scope_ids(key, value) VALUES
    ('tenant', v_tenant), ('org', v_org), ('brand', v_brand),
    ('loc_a', v_loc_a), ('loc_b', v_loc_b), ('owner', v_owner), ('org_mgr', v_org_mgr);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'waste-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_mgr, 'authenticated', 'authenticated', 'waste-org-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Waste Scope Tenant', 'waste-scope-tenant', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Waste Scope Org', 'waste-scope-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Waste Scope Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_loc_a, v_brand, v_org, 'Waste Scope Location A'),
    (v_loc_b, v_brand, v_org, 'Waste Scope Location B');

  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_org_mgr, v_tenant, v_org, v_brand, v_loc_a, 'waste-org-mgr@example.test', 'Waste Scope Org Mgr', 'org_manager', 'organization', 'active')
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

  INSERT INTO public.wastage_logs (
    organization_id, brand_id, location_id, product_name, quantity, unit, value, reason, created_at
  ) VALUES
    (v_org, v_brand, v_loc_a, 'Waste Scope Product A', 5, 'lb', 42.50, 'spoiled', now()),
    (v_org, v_brand, v_loc_b, 'Waste Scope Product B', 9, 'lb', 99.00, 'spoiled', now());
END $$;

-- ===================== org_manager active at Location A sees only Location A's waste =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM waste_scope_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO waste_scope_results
SELECT 'org_manager_at_location_a_sees_only_location_a_waste',
       (
         SELECT COALESCE(sum((elem->>'wasteValue')::numeric), 0)
         FROM jsonb_array_elements(
           public.get_inventory_usage_report(
             p_organization_id := (SELECT value FROM waste_scope_ids WHERE key = 'org'),
             p_location_ids := NULL,
             p_date_from := (current_date - interval '7 days')::date,
             p_date_to := current_date
           ) -> 'wasteTrend'
         ) elem
       ) = 42.50,
       'summed wasteValue across wasteTrend buckets';

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM waste_scope_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM waste_scope_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'inventory_usage_waste_trend_scope_acceptance failed';
  END IF;
END $$;

ROLLBACK;
