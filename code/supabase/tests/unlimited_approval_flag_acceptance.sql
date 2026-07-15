-- Acceptance test for 20260719000006_unlimited_approval_flag.sql
--
-- Verifies: (1) a location_manager with has_unlimited_approval=false and a $100 limit cannot
-- approve a $500 invoice, (2) an org_manager granting has_unlimited_approval=true to that
-- location_manager (within the existing cascade rules) succeeds, (3) the now-unlimited
-- location_manager CAN approve the $500 invoice, (4) NULL/zero numeric limit still blocks a
-- non-unlimited approver exactly as before (no regression), (5) the old 2-arg
-- update_user_approval_limit signature no longer exists (overload was dropped, not just
-- shadowed).

BEGIN;

CREATE TEMP TABLE uaf_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE uaf_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON uaf_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON uaf_results TO authenticated;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_branch_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_invoice_big uuid;
  v_invoice_small uuid;
BEGIN
  INSERT INTO uaf_ids(key, value) VALUES
    ('org', v_org), ('brand', v_brand), ('location', v_location),
    ('org_manager', v_org_manager), ('branch_manager', v_branch_manager), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'UAF Org', 'uaf-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'UAF Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'UAF Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'uaf-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_manager, 'authenticated', 'authenticated', 'uaf-branch-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'uaf-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id, invoice_approval_limit)
  VALUES
    (v_org_manager, 'uaf-org-manager@example.test', 'UAF Org Manager', 'org_manager', 'active', v_org, NULL, NULL, 1000000),
    (v_branch_manager, 'uaf-branch-manager@example.test', 'UAF Branch Manager', 'branch_manager', 'active', v_org, v_brand, NULL, 5000),
    (v_location_manager, 'uaf-location-manager@example.test', 'UAF Location Manager', 'location_manager', 'active', v_org, v_brand, v_location, 100)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id, invoice_approval_limit = EXCLUDED.invoice_approval_limit;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, 'UAF Vendor', 'UAF-INV-BIG', 500, 'pending_review')
  RETURNING id INTO v_invoice_big;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, 'UAF Vendor', 'UAF-INV-SMALL', 50, 'pending_review')
  RETURNING id INTO v_invoice_small;

  INSERT INTO uaf_ids(key, value) VALUES ('invoice_big', v_invoice_big), ('invoice_small', v_invoice_small);
END $$;

-- ===== location_manager with a $100 limit cannot approve the $500 invoice =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM uaf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_invoice_with_limit(
      (SELECT value FROM uaf_ids WHERE key = 'invoice_big'),
      (SELECT value FROM uaf_ids WHERE key = 'location_manager'),
      500
    );
    INSERT INTO uaf_results VALUES ('over_limit_blocked_before_unlimited', false, 'approval unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO uaf_results VALUES ('over_limit_blocked_before_unlimited', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== small invoice within the $100 limit still approves fine (no regression) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM uaf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM uaf_ids WHERE key = 'invoice_small'),
  (SELECT value FROM uaf_ids WHERE key = 'location_manager'),
  50
);

RESET ROLE;

INSERT INTO uaf_results
SELECT 'within_limit_still_approves',
       status = 'approved',
       'status=' || status
FROM public.invoices
WHERE id = (SELECT value FROM uaf_ids WHERE key = 'invoice_small');

-- ===== branch_manager grants unlimited to location_manager (within their brand) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM uaf_ids WHERE key = 'branch_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.update_user_approval_limit(
  (SELECT value FROM uaf_ids WHERE key = 'location_manager'),
  100,
  true
);

RESET ROLE;

INSERT INTO uaf_results
SELECT 'unlimited_flag_granted',
       has_unlimited_approval = true,
       'has_unlimited_approval=' || has_unlimited_approval
FROM public.profiles
WHERE id = (SELECT value FROM uaf_ids WHERE key = 'location_manager');

-- ===== now-unlimited location_manager CAN approve the $500 invoice =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM uaf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM uaf_ids WHERE key = 'invoice_big'),
  (SELECT value FROM uaf_ids WHERE key = 'location_manager'),
  500
);

RESET ROLE;

INSERT INTO uaf_results
SELECT 'unlimited_approves_over_limit_invoice',
       status = 'approved',
       'status=' || status
FROM public.invoices
WHERE id = (SELECT value FROM uaf_ids WHERE key = 'invoice_big');

-- ===== org_manager grants unlimited to branch_manager (the other cascade tier) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM uaf_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.update_user_approval_limit(
  (SELECT value FROM uaf_ids WHERE key = 'branch_manager'),
  5000,
  true
);

RESET ROLE;

INSERT INTO uaf_results
SELECT 'unlimited_flag_granted_to_branch_manager',
       has_unlimited_approval = true,
       'has_unlimited_approval=' || has_unlimited_approval
FROM public.profiles
WHERE id = (SELECT value FROM uaf_ids WHERE key = 'branch_manager');

-- ===== old 2-arg overload no longer exists =====

INSERT INTO uaf_results
SELECT 'old_two_arg_overload_dropped',
       NOT EXISTS (
         SELECT 1 FROM pg_proc
         WHERE proname = 'update_user_approval_limit'
           AND pg_get_function_identity_arguments(oid) = 'target_user_id uuid, new_limit numeric'
       ),
       'checked pg_proc for the old 2-arg signature';

-- ===================== verdict =====================

SELECT * FROM uaf_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM uaf_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'unlimited_approval_flag_acceptance failed';
  END IF;
END $$;

ROLLBACK;
