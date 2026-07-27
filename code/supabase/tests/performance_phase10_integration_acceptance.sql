-- Phase 10 Performance integration acceptance tests.
--
-- Rollback-only deterministic fixture. This file seeds a compact cross-scope
-- Performance dataset, calls the secured location RPC wrappers, asserts exact
-- report values, and verifies common RPC attack paths are denied.

BEGIN;

SELECT plan(15);

CREATE TEMP TABLE perf_phase10_ids(k text primary key, id uuid) ON COMMIT DROP;
CREATE TEMP TABLE perf_phase10_results(
  test_name text primary key,
  passed boolean not null,
  detail text
) ON COMMIT DROP;

INSERT INTO perf_phase10_ids(k, id) VALUES
  ('tenant_a', gen_random_uuid()),
  ('tenant_b', gen_random_uuid()),
  ('org_a', gen_random_uuid()),
  ('org_b', gen_random_uuid()),
  ('brand_a', gen_random_uuid()),
  ('brand_b', gen_random_uuid()),
  ('brand_other_org', gen_random_uuid()),
  ('loc_a', gen_random_uuid()),
  ('loc_b_same_org_other_brand', gen_random_uuid()),
  ('loc_other_org', gen_random_uuid()),
  ('manager_a', gen_random_uuid()),
  ('ground_a', gen_random_uuid()),
  ('vendor_a', gen_random_uuid()),
  ('vendor_item_a', gen_random_uuid()),
  ('product_a', gen_random_uuid()),
  ('product_brand_shared', gen_random_uuid()),
  ('product_org_shared', gen_random_uuid()),
  ('product_deleted', gen_random_uuid()),
  ('invoice_current', gen_random_uuid()),
  ('invoice_previous', gen_random_uuid()),
  ('invoice_deleted', gen_random_uuid()),
  ('inventory_a', gen_random_uuid()),
  ('count_sheet_a', gen_random_uuid());

GRANT SELECT, INSERT, UPDATE, DELETE ON perf_phase10_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON perf_phase10_results TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION pg_temp.phase10_id(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM perf_phase10_ids WHERE k = p_key
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase10_record(
  p_test_name text,
  p_passed boolean,
  p_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO perf_phase10_results(test_name, passed, detail)
  VALUES (p_test_name, COALESCE(p_passed, false), p_detail)
  ON CONFLICT (test_name) DO UPDATE
  SET passed = EXCLUDED.passed,
      detail = EXCLUDED.detail;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase10_set_actor(p_key text, p_db_role text DEFAULT 'authenticated')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RESET ROLE;
  EXECUTE format('SET LOCAL ROLE %I', p_db_role);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(pg_temp.phase10_id(p_key)::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_db_role, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase10_expect_denied(
  p_test_name text,
  p_actor_key text,
  p_org_key text,
  p_location_key text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean := false;
  v_detail text;
BEGIN
  BEGIN
    PERFORM pg_temp.phase10_set_actor(p_actor_key);
    PERFORM public.get_location_category_performance_report(
      pg_temp.phase10_id(p_org_key),
      pg_temp.phase10_id(p_location_key),
      DATE '2026-07-01',
      DATE '2026-07-31'
    );
    v_allowed := true;
    v_detail := 'unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    v_allowed := false;
    v_detail := SQLERRM;
  END;

  RESET ROLE;
  PERFORM pg_temp.phase10_record(p_test_name, NOT v_allowed, v_detail);
END;
$$;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  (pg_temp.phase10_id('manager_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'performance-phase10-manager@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.phase10_id('ground_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'performance-phase10-ground@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, owner_id)
VALUES
  (pg_temp.phase10_id('tenant_a'), 'Performance Phase 10 Tenant A', 'performance-phase10-tenant-a-' || substr(pg_temp.phase10_id('tenant_a')::text, 1, 8), pg_temp.phase10_id('manager_a')),
  (pg_temp.phase10_id('tenant_b'), 'Performance Phase 10 Tenant B', 'performance-phase10-tenant-b-' || substr(pg_temp.phase10_id('tenant_b')::text, 1, 8), pg_temp.phase10_id('manager_a'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id, enabled_modules)
VALUES
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('tenant_a'), 'Performance Phase 10 Org A', 'performance-phase10-org-a-' || substr(pg_temp.phase10_id('org_a')::text, 1, 8), pg_temp.phase10_id('manager_a'), '[]'::jsonb),
  (pg_temp.phase10_id('org_b'), pg_temp.phase10_id('tenant_b'), 'Performance Phase 10 Org B', 'performance-phase10-org-b-' || substr(pg_temp.phase10_id('org_b')::text, 1, 8), pg_temp.phase10_id('manager_a'), '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES
  (pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('org_a'), 'Performance Phase 10 Brand A'),
  (pg_temp.phase10_id('brand_b'), pg_temp.phase10_id('org_a'), 'Performance Phase 10 Brand B'),
  (pg_temp.phase10_id('brand_other_org'), pg_temp.phase10_id('org_b'), 'Performance Phase 10 Brand Other Org')
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO public.locations (id, organization_id, brand_id, name, timezone, deleted_at)
VALUES
  (pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), 'Performance Phase 10 Location A', 'America/New_York', NULL),
  (pg_temp.phase10_id('loc_b_same_org_other_brand'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_b'), 'Performance Phase 10 Other Brand Location', 'America/Chicago', NULL),
  (pg_temp.phase10_id('loc_other_org'), pg_temp.phase10_id('org_b'), pg_temp.phase10_id('brand_other_org'), 'Performance Phase 10 Other Org Location', 'UTC', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
)
VALUES
  (pg_temp.phase10_id('manager_a'), pg_temp.phase10_id('tenant_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), 'performance-phase10-manager@example.test', 'Performance Phase 10 Manager', 'location_manager', 'location', 'active'),
  (pg_temp.phase10_id('ground_a'), pg_temp.phase10_id('tenant_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), 'performance-phase10-ground@example.test', 'Performance Phase 10 Ground', 'ground_staff', 'location', 'active')
ON CONFLICT (id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    role = EXCLUDED.role,
    access_level = EXCLUDED.access_level,
    status = EXCLUDED.status,
    deleted_at = NULL;

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('manager_a'), 'location_manager'),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('ground_a'), 'ground_staff')
ON CONFLICT DO NOTHING;

INSERT INTO public.vendors (id, organization_id, brand_id, location_id, name)
VALUES (pg_temp.phase10_id('vendor_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), 'Performance Phase 10 Vendor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (
  id, product_id, organization_id, brand_id, location_id, name, category,
  accounting_category, report_by_unit, base_unit, latest_price, deleted_at
)
VALUES
  (pg_temp.phase10_id('product_a'), 'PHASE10-PROD-A', pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), 'Phase 10 Flour', 'Food', 'food', 'lb', 'lb', 5, NULL),
  (pg_temp.phase10_id('product_brand_shared'), 'PHASE10-BRAND-SHARED', pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), NULL, 'Phase 10 Brand Shared', 'Food', 'food', 'each', 'each', 1, NULL),
  (pg_temp.phase10_id('product_org_shared'), 'PHASE10-ORG-SHARED', pg_temp.phase10_id('org_a'), NULL, NULL, 'Phase 10 Org Shared', 'Food', 'food', 'each', 'each', 1, NULL),
  (pg_temp.phase10_id('product_deleted'), 'PHASE10-DELETED', pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), 'Phase 10 Deleted Product', 'Food', 'food', 'each', 'each', 1, now())
ON CONFLICT (id) DO UPDATE
SET deleted_at = EXCLUDED.deleted_at;

INSERT INTO public.vendor_items (
  id, organization_id, vendor_id, vendor_item_code, vendor_item_name, vendor_unit, default_price, pack_size
)
VALUES (
  pg_temp.phase10_id('vendor_item_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('vendor_a'),
  'PHASE10-FLOUR', 'Phase 10 Flour', 'lb', 4, '1 lb'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vendor_item_mappings (
  organization_id, vendor_item_id, internal_product_id, conversion_multiplier, is_verified
)
VALUES (
  pg_temp.phase10_id('org_a'), pg_temp.phase10_id('vendor_item_a'), pg_temp.phase10_id('product_a'), 1, true
)
ON CONFLICT (vendor_item_id, internal_product_id) DO UPDATE
SET conversion_multiplier = EXCLUDED.conversion_multiplier,
    is_verified = EXCLUDED.is_verified;

INSERT INTO public.invoices (
  id, organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number,
  invoice_date, total_amount, subtotal, status, ap_status, payment_status, paid_amount,
  credit_applied, source, created_by, deleted_at
)
VALUES
  (pg_temp.phase10_id('invoice_current'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('vendor_a'), 'Performance Phase 10 Vendor', 'PHASE10-CURRENT', DATE '2026-07-15', 1000, 1000, 'pending_review', 'processing', 'unpaid', 0, 20, 'manual_upload', pg_temp.phase10_id('manager_a'), NULL),
  (pg_temp.phase10_id('invoice_previous'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('vendor_a'), 'Performance Phase 10 Vendor', 'PHASE10-PREVIOUS', DATE '2026-06-15', 800, 800, 'pending_review', 'processing', 'unpaid', 0, 0, 'manual_upload', pg_temp.phase10_id('manager_a'), NULL),
  (pg_temp.phase10_id('invoice_deleted'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('vendor_a'), 'Performance Phase 10 Vendor', 'PHASE10-DELETED', DATE '2026-07-18', 999, 999, 'pending_review', 'processing', 'unpaid', 0, 0, 'manual_upload', pg_temp.phase10_id('manager_a'), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_allocations (
  organization_id, invoice_id, allocation_type, category_name, location_id, amount
)
VALUES
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('invoice_current'), 'line_items', 'Food', pg_temp.phase10_id('loc_a'), 1000),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('invoice_previous'), 'line_items', 'Food', pg_temp.phase10_id('loc_a'), 800),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('invoice_deleted'), 'line_items', 'Food', pg_temp.phase10_id('loc_a'), 999);

INSERT INTO public.invoice_line_items (
  invoice_id, organization_id, internal_product_id, vendor_item_id, vendor_item_code, item_name,
  quantity, vendor_unit, unit_price, total_price
)
VALUES
  (pg_temp.phase10_id('invoice_current'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('product_a'), pg_temp.phase10_id('vendor_item_a'), 'PHASE10-FLOUR', 'Phase 10 Flour', 5, 'lb', 5, 25),
  (pg_temp.phase10_id('invoice_previous'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('product_a'), pg_temp.phase10_id('vendor_item_a'), 'PHASE10-FLOUR', 'Phase 10 Flour', 5, 'lb', 4, 20);

SELECT pg_temp.phase10_set_actor('manager_a');

UPDATE public.invoices
SET status = 'approved', ap_status = 'approved',
    payment_status = CASE WHEN id = pg_temp.phase10_id('invoice_current') THEN 'partial' WHEN id = pg_temp.phase10_id('invoice_previous') THEN 'paid' ELSE 'unpaid' END,
    paid_amount = CASE WHEN id IN (pg_temp.phase10_id('invoice_current'), pg_temp.phase10_id('invoice_previous')) THEN 800 ELSE 0 END
WHERE id IN (pg_temp.phase10_id('invoice_current'), pg_temp.phase10_id('invoice_previous'), pg_temp.phase10_id('invoice_deleted'));

RESET ROLE;

INSERT INTO public.budget_targets (
  organization_id, brand_id, location_id, period_start, period_end, category, target_amount, created_by, updated_by
)
VALUES (
  pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'),
  DATE '2026-07-01', DATE '2026-07-31', 'Food', 900, pg_temp.phase10_id('manager_a'), pg_temp.phase10_id('manager_a')
)
ON CONFLICT DO NOTHING;

INSERT INTO public.inventory (
  id, organization_id, brand_id, location_id, internal_product_id, product_id, product_name,
  category, current_quantity, current_unit, current_value, unit_cost, reorder_point,
  par_level, last_counted_date, deleted_at
)
VALUES (
  pg_temp.phase10_id('inventory_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'),
  pg_temp.phase10_id('product_a'), 'PHASE10-PROD-A', 'Phase 10 Flour', 'Food',
  10, 'lb', 50, 5, 10, 12, DATE '2026-07-31', NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.count_sheets (
  id, organization_id, brand_id, location_id, name, items, created_by, status
)
VALUES (
  pg_temp.phase10_id('count_sheet_a'), pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'),
  pg_temp.phase10_id('loc_a'), 'Performance Phase 10 Sheet', '[]'::jsonb,
  pg_temp.phase10_id('manager_a'), 'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.count_sessions (
  organization_id, brand_id, location_id, count_sheet_id, status, counted_data,
  completed_at, count_date, counted_by, created_by
)
VALUES
  (
    pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'),
    pg_temp.phase10_id('count_sheet_a'), 'completed',
    jsonb_build_object(pg_temp.phase10_id('inventory_a')::text, jsonb_build_object('counted_quantity', 20, 'unit', 'lb')),
    TIMESTAMPTZ '2026-07-01 03:30:00+00', DATE '2026-06-30', pg_temp.phase10_id('manager_a'), pg_temp.phase10_id('manager_a')
  ),
  (
    pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'),
    pg_temp.phase10_id('count_sheet_a'), 'completed',
    jsonb_build_object(pg_temp.phase10_id('inventory_a')::text, jsonb_build_object('counted_quantity', 13, 'unit', 'lb')),
    TIMESTAMPTZ '2026-08-01 03:30:00+00', DATE '2026-07-31', pg_temp.phase10_id('manager_a'), pg_temp.phase10_id('manager_a')
  );

INSERT INTO public.inventory_movements (
  organization_id, location_id, inventory_id, movement_type, quantity, source_type, created_by, created_at
)
VALUES
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('inventory_a'), 'invoice_received', 10, 'invoice', pg_temp.phase10_id('manager_a'), TIMESTAMPTZ '2026-07-10 16:00:00+00'),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('inventory_a'), 'transfer_in', 3, 'transfer', pg_temp.phase10_id('manager_a'), TIMESTAMPTZ '2026-07-11 16:00:00+00'),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('inventory_a'), 'transfer_out', 4, 'transfer', pg_temp.phase10_id('manager_a'), TIMESTAMPTZ '2026-07-12 16:00:00+00'),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('inventory_a'), 'manual_adjustment', -4, 'adjustment', pg_temp.phase10_id('manager_a'), TIMESTAMPTZ '2026-07-13 16:00:00+00'),
  (pg_temp.phase10_id('org_a'), pg_temp.phase10_id('loc_a'), pg_temp.phase10_id('inventory_a'), 'wastage', 2, 'wastage_log', pg_temp.phase10_id('manager_a'), TIMESTAMPTZ '2026-07-14 16:00:00+00');

INSERT INTO public.wastage_logs (
  organization_id, brand_id, location_id, product_id, product_name, quantity, unit, value, reason, logged_by, created_at
)
VALUES (
  pg_temp.phase10_id('org_a'), pg_temp.phase10_id('brand_a'), pg_temp.phase10_id('loc_a'),
  'PHASE10-PROD-A', 'Phase 10 Flour', 2, 'lb', 10, 'spoiled', pg_temp.phase10_id('manager_a'),
  TIMESTAMPTZ '2026-07-14 16:00:00+00'
);

SELECT pg_temp.phase10_set_actor('manager_a');

DO $$
DECLARE
  v_category jsonb;
  v_price jsonb;
  v_inventory jsonb;
  v_category_row jsonb;
  v_price_row jsonb;
  v_inventory_row jsonb;
  v_empty jsonb;
  v_outstanding numeric;
  v_visible_products int;
BEGIN
  v_category := public.get_location_category_performance_report(
    pg_temp.phase10_id('org_a'),
    pg_temp.phase10_id('loc_a'),
    DATE '2026-07-01',
    DATE '2026-07-31',
    DATE '2026-06-01',
    DATE '2026-06-30'
  );

  v_category_row := (
    SELECT elem FROM jsonb_array_elements(v_category->'tableRows') elem
    WHERE elem->>'category' = 'Food'
    LIMIT 1
  );

  PERFORM pg_temp.phase10_record(
    'category_spend_reconciles_to_exact_fixture',
    (v_category->'summary'->>'totalSpend')::numeric = 1000,
    v_category->'summary'->>'totalSpend'
  );
  PERFORM pg_temp.phase10_record(
    'deleted_invoice_excluded_from_category_spend',
    (v_category->'summary'->>'totalSpend')::numeric <> 1999,
    v_category->'summary'->>'totalSpend'
  );
  PERFORM pg_temp.phase10_record(
    'budget_reconciliation_uses_exact_location_brand_period',
    (v_category_row->>'budget')::numeric = 900
      AND (v_category_row->>'budgetVariance')::numeric = 100,
    COALESCE(v_category_row::text, '<missing row>')
  );
  PERFORM pg_temp.phase10_record(
    'location_timezone_returned_in_metadata',
    v_category->'metadata'->>'timezone' = 'America/New_York',
    v_category->'metadata'->>'timezone'
  );

  v_price := public.get_location_price_movers_report(
    pg_temp.phase10_id('org_a'),
    pg_temp.phase10_id('loc_a'),
    DATE '2026-07-01',
    DATE '2026-07-31',
    DATE '2026-06-01',
    DATE '2026-06-30'
  );

  v_price_row := (
    SELECT elem FROM jsonb_array_elements(v_price->'ranking') elem
    WHERE elem->>'product' = 'Phase 10 Flour'
    LIMIT 1
  );

  PERFORM pg_temp.phase10_record(
    'price_impact_arithmetic_reconciles',
    (v_price_row->>'normalizedPurchasedQuantity')::numeric = 5
      AND (v_price_row->>'unitPriceDifference')::numeric = 1
      AND (v_price_row->>'estimatedImpact')::numeric = 5,
    COALESCE(v_price_row::text, '<missing row>')
  );
  PERFORM pg_temp.phase10_record(
    'price_impact_evidence_is_complete_for_verified_mapping',
    (v_price_row->>'impactEvidenceComplete')::boolean IS TRUE
      AND v_price_row->>'mappingConfidence' = 'verified'
      AND v_price_row->>'impactFormula' = 'unitPriceDifference * normalizedPurchasedQuantity',
    COALESCE(v_price_row::text, '<missing row>')
  );

  v_inventory := public.get_location_inventory_usage_report(
    pg_temp.phase10_id('org_a'),
    pg_temp.phase10_id('loc_a'),
    DATE '2026-07-01',
    DATE '2026-07-31'
  );

  v_inventory_row := (
    SELECT elem FROM jsonb_array_elements(v_inventory->'tableRows') elem
    WHERE elem->>'product' = 'Phase 10 Flour'
    LIMIT 1
  );

  PERFORM pg_temp.phase10_record(
    'inventory_usage_arithmetic_reconciles',
    (v_inventory_row->>'actualUsage')::numeric = 12
      AND (v_inventory->'summary'->>'actualInventoryUsage')::numeric = 60,
    COALESCE(v_inventory_row::text, '<missing row>')
  );
  PERFORM pg_temp.phase10_record(
    'reorder_and_current_value_reconcile',
    (v_inventory_row->>'currentOnHandQuantity')::numeric = 10
      AND (v_inventory_row->>'reorderPoint')::numeric = 10
      AND (v_inventory_row->>'currentInventoryValue')::numeric = 50
      AND v_inventory_row->>'unitCostSource' = 'inventory.unit_cost',
    COALESCE(v_inventory_row::text, '<missing row>')
  );
  PERFORM pg_temp.phase10_record(
    'waste_remains_separate_from_actual_usage',
    (v_inventory_row->>'wasteQuantity')::numeric = 2
      AND (v_inventory_row->>'actualUsage')::numeric = 12,
    COALESCE(v_inventory_row::text, '<missing row>')
  );

  v_empty := public.get_location_category_performance_report(
    pg_temp.phase10_id('org_a'),
    pg_temp.phase10_id('loc_a'),
    DATE '2026-08-01',
    DATE '2026-08-31'
  );
  PERFORM pg_temp.phase10_record(
    'empty_scope_returns_empty_not_fixture_totals',
    (v_empty->'summary'->>'totalSpend')::numeric = 0
      AND jsonb_array_length(v_empty->'tableRows') = 0,
    v_empty->'summary'->>'totalSpend'
  );

  SELECT greatest(0, COALESCE(total_amount, 0) - COALESCE(paid_amount, 0) - COALESCE(credit_applied, 0))
    INTO v_outstanding
  FROM public.invoices
  WHERE id = pg_temp.phase10_id('invoice_current');

  PERFORM pg_temp.phase10_record(
    'payment_outstanding_balance_fixture_is_exact',
    v_outstanding = 180,
    v_outstanding::text
  );

  SELECT count(*)
    INTO v_visible_products
  FROM public.products p
  WHERE p.organization_id = pg_temp.phase10_id('org_a')
    AND p.deleted_at IS NULL
    AND (
      p.location_id = pg_temp.phase10_id('loc_a')
      OR (p.location_id IS NULL AND p.brand_id = pg_temp.phase10_id('brand_a'))
      OR (p.location_id IS NULL AND p.brand_id IS NULL)
    );

  PERFORM pg_temp.phase10_record(
    'product_inheritance_fixture_includes_org_brand_location_and_excludes_deleted',
    v_visible_products = 3,
    v_visible_products::text
  );
END $$;

RESET ROLE;

SELECT pg_temp.phase10_expect_denied('ground_staff_report_rpc_denied', 'ground_a', 'org_a', 'loc_a');
SELECT pg_temp.phase10_expect_denied('cross_location_report_rpc_attack_denied', 'manager_a', 'org_a', 'loc_b_same_org_other_brand');
SELECT pg_temp.phase10_expect_denied('cross_organization_report_rpc_attack_denied', 'manager_a', 'org_b', 'loc_other_org');

SELECT ok(passed, test_name)
FROM perf_phase10_results
ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
