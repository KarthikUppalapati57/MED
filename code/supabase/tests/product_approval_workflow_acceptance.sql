-- Acceptance test for 20260719000014_product_approval_workflow.sql
--
-- Verifies: (1) the toggle is off by default -- location_manager writes apply directly,
-- (2) org_manager can turn it on, a location_manager without approval-tier role cannot,
-- (3) once on, a location_manager's CREATE is live immediately but flagged pending,
-- (4) a location_manager's UPDATE applies immediately, flagged pending, with a correct
-- snapshot of the prior values, (5) a location_manager's DELETE does NOT soft-delete yet --
-- flagged pending, product stays visible, (6) branch_manager approving a pending CREATE just
-- clears the flag, (7) branch_manager approving a pending DELETE performs the real
-- soft-delete, (8) branch_manager rejecting a pending UPDATE reverts to the snapshot,
-- (9) branch_manager's OWN writes are never gated even with the toggle on,
-- (10) a location_manager cannot approve/reject their own pending change.

BEGIN;

CREATE TEMP TABLE pawf_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE pawf_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON pawf_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pawf_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_branch_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO pawf_ids(key, value) VALUES
    ('org', v_org), ('brand', v_brand), ('location', v_location),
    ('org_manager', v_org_manager), ('branch_manager', v_branch_manager), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'PAWF Org', 'pawf-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'PAWF Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'PAWF Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'pawf-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_manager, 'authenticated', 'authenticated', 'pawf-branch-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'pawf-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id)
  VALUES
    (v_org_manager, 'pawf-org-manager@example.test', 'PAWF Org Manager', 'org_manager', 'active', v_org, NULL, NULL),
    (v_branch_manager, 'pawf-branch-manager@example.test', 'PAWF Branch Manager', 'branch_manager', 'active', v_org, v_brand, NULL),
    (v_location_manager, 'pawf-location-manager@example.test', 'PAWF Location Manager', 'location_manager', 'active', v_org, v_brand, v_location)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id;
END $$;

-- ===== toggle off by default: location_manager create applies directly =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'PAWF Product Before Toggle',
    p_accounting_category := 'food',
    p_location_specific := true,
    p_organization_id := (SELECT value FROM pawf_ids WHERE key = 'org')
  );
  INSERT INTO pawf_ids(key, value) VALUES ('product_before_toggle', (v_result->>'id')::uuid);
END $$;

RESET ROLE;

INSERT INTO pawf_results
SELECT 'toggle_off_by_default_no_gating',
       pending_approval = false,
       'pending_approval=' || pending_approval
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'product_before_toggle');

-- ===== location_manager cannot turn on the toggle =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.set_product_approval_setting((SELECT value FROM pawf_ids WHERE key = 'org'), true);
    INSERT INTO pawf_results VALUES ('location_manager_cannot_toggle_setting', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO pawf_results VALUES ('location_manager_cannot_toggle_setting', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== org_manager turns the toggle on =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.set_product_approval_setting((SELECT value FROM pawf_ids WHERE key = 'org'), true);

RESET ROLE;

INSERT INTO pawf_results
SELECT 'toggle_now_on', public.get_product_approval_setting((SELECT value FROM pawf_ids WHERE key = 'org')), 'checked toggle state';

-- ===== location_manager CREATE is live immediately but flagged pending =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'PAWF Pending Create Product',
    p_accounting_category := 'food',
    p_location_specific := true,
    p_organization_id := (SELECT value FROM pawf_ids WHERE key = 'org')
  );
  INSERT INTO pawf_ids(key, value) VALUES ('pending_create_product', (v_result->>'id')::uuid);
END $$;

INSERT INTO pawf_results
SELECT 'gated_create_is_live_and_flagged',
       pending_approval = true AND pending_action = 'create' AND name = 'PAWF Pending Create Product',
       'pending_approval=' || pending_approval || ' pending_action=' || COALESCE(pending_action, 'NULL') || ' name=' || name
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'pending_create_product');

-- ===== location_manager UPDATE (on an unrelated, non-pending product) applies immediately,
-- flagged pending, snapshot captured =====

SELECT public.update_product_details(
  (SELECT value FROM pawf_ids WHERE key = 'product_before_toggle'),
  'PAWF Product Renamed',
  p_latest_price := 99.99
);

RESET ROLE;

INSERT INTO pawf_results
SELECT 'gated_update_is_live_and_flagged',
       pending_approval = true AND pending_action = 'update' AND name = 'PAWF Product Renamed'
         AND (pending_snapshot->>'name') = 'PAWF Product Before Toggle',
       'name=' || name || ' snapshot_name=' || (pending_snapshot->>'name')
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'product_before_toggle');

-- ===== location_manager DELETE does NOT soft-delete yet =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
  v_id uuid;
BEGIN
  v_id := (public.create_product_details(
    p_name := 'PAWF To Be Deleted',
    p_accounting_category := 'food',
    p_location_specific := true,
    p_organization_id := (SELECT value FROM pawf_ids WHERE key = 'org')
  ))->>'id';
  -- clear the pending flag from its own creation so this test isolates the delete path
  UPDATE public.products SET pending_approval = false, pending_action = NULL WHERE id = v_id::uuid;
  INSERT INTO pawf_ids(key, value) VALUES ('product_to_delete', v_id::uuid);
END $$;

SELECT public.soft_delete_product_safe((SELECT value FROM pawf_ids WHERE key = 'product_to_delete'));

RESET ROLE;

INSERT INTO pawf_results
SELECT 'gated_delete_not_hard_applied_yet',
       deleted_at IS NULL AND pending_approval = true AND pending_action = 'delete',
       'deleted_at=' || COALESCE(deleted_at::text, 'NULL') || ' pending_action=' || COALESCE(pending_action, 'NULL')
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'product_to_delete');

-- ===== location_manager cannot approve/reject their own pending change =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_product_change((SELECT value FROM pawf_ids WHERE key = 'pending_create_product'));
    INSERT INTO pawf_results VALUES ('location_manager_cannot_approve', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO pawf_results VALUES ('location_manager_cannot_approve', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== branch_manager approves the pending CREATE: just clears the flag =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM pawf_ids WHERE key = 'branch_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.approve_product_change((SELECT value FROM pawf_ids WHERE key = 'pending_create_product'));

INSERT INTO pawf_results
SELECT 'approve_create_clears_flag',
       pending_approval = false AND deleted_at IS NULL,
       'pending_approval=' || pending_approval || ' deleted_at=' || COALESCE(deleted_at::text, 'NULL')
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'pending_create_product');

-- ===== branch_manager approves the pending DELETE: performs the real soft-delete =====

SELECT public.approve_product_change((SELECT value FROM pawf_ids WHERE key = 'product_to_delete'));

INSERT INTO pawf_results
SELECT 'approve_delete_performs_soft_delete',
       deleted_at IS NOT NULL AND pending_approval = false,
       'deleted_at=' || COALESCE(deleted_at::text, 'NULL')
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'product_to_delete');

-- ===== branch_manager rejects the pending UPDATE: reverts to the snapshot =====

SELECT public.reject_product_change((SELECT value FROM pawf_ids WHERE key = 'product_before_toggle'), 'name change not appropriate');

INSERT INTO pawf_results
SELECT 'reject_update_reverts_to_snapshot',
       name = 'PAWF Product Before Toggle' AND pending_approval = false,
       'name=' || name || ' pending_approval=' || pending_approval
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'product_before_toggle');

-- ===== branch_manager's OWN writes are never gated, even with the toggle on =====

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_product_details(
    p_name := 'PAWF Branch Manager Direct Product',
    p_accounting_category := 'food',
    p_location_specific := false,
    p_organization_id := (SELECT value FROM pawf_ids WHERE key = 'org'),
    p_brand_id := (SELECT value FROM pawf_ids WHERE key = 'brand')
  );
  INSERT INTO pawf_ids(key, value) VALUES ('branch_manager_direct_product', (v_result->>'id')::uuid);
END $$;

RESET ROLE;

INSERT INTO pawf_results
SELECT 'branch_manager_writes_never_gated',
       pending_approval = false,
       'pending_approval=' || pending_approval
FROM public.products WHERE id = (SELECT value FROM pawf_ids WHERE key = 'branch_manager_direct_product');

-- ===================== verdict =====================

SELECT * FROM pawf_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pawf_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'product_approval_workflow_acceptance failed';
  END IF;
END $$;

ROLLBACK;
