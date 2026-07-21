-- Acceptance test for 20260721190000_require_exact_location_match_for_org_wide_roles.sql.
--
-- Proves: org_manager/tenant_super_admin/branch_manager see ZERO location-bearing rows while
-- profiles.location_id is NULL (nothing switched into yet), see ONLY their currently-active
-- location's rows once it's set (not a sibling location in the same org/brand), the
-- ledger_entries org-level exception still works regardless of location selection, and
-- location_manager/ground_staff are unaffected (unchanged from before).

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE exact_loc_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE exact_loc_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE ON exact_loc_ids TO authenticated;
GRANT SELECT, INSERT ON exact_loc_results TO authenticated;

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
  v_ground uuid := gen_random_uuid();
BEGIN
  INSERT INTO exact_loc_ids(key, value) VALUES
    ('tenant', v_tenant), ('org', v_org), ('brand', v_brand),
    ('loc_a', v_loc_a), ('loc_b', v_loc_b), ('owner', v_owner),
    ('org_mgr', v_org_mgr), ('tenant_admin', v_tenant_admin),
    ('branch_mgr', v_branch_mgr), ('location_mgr', v_location_mgr), ('ground', v_ground);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'exloc-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_mgr, 'authenticated', 'authenticated', 'exloc-org-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_admin, 'authenticated', 'authenticated', 'exloc-tenant-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_mgr, 'authenticated', 'authenticated', 'exloc-branch-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_mgr, 'authenticated', 'authenticated', 'exloc-location-mgr@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'exloc-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Exact Loc Tenant', 'exact-loc-tenant', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Exact Loc Org', 'exact-loc-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Exact Loc Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_loc_a, v_brand, v_org, 'Exact Loc Location A'),
    (v_loc_b, v_brand, v_org, 'Exact Loc Location B');

  -- All three org-wide profiles start with location_id NULL -- "nothing switched into yet".
  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_org_mgr, v_tenant, v_org, NULL, NULL, 'exloc-org-mgr@example.test', 'Exact Loc Org Mgr', 'org_manager', 'organization', 'active'),
    (v_tenant_admin, v_tenant, v_org, NULL, NULL, 'exloc-tenant-admin@example.test', 'Exact Loc Tenant Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_branch_mgr, v_tenant, v_org, v_brand, NULL, 'exloc-branch-mgr@example.test', 'Exact Loc Branch Mgr', 'branch_manager', 'brand', 'active'),
    (v_location_mgr, v_tenant, v_org, v_brand, v_loc_a, 'exloc-location-mgr@example.test', 'Exact Loc Location Mgr', 'location_manager', 'location', 'active'),
    (v_ground, v_tenant, v_org, v_brand, v_loc_a, 'exloc-ground@example.test', 'Exact Loc Ground', 'ground_staff', 'location', 'active')
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

  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES
    ('Exact Loc Vendor', 'EXLOC-A', 10, 'pending_review', 'processing', v_org, v_brand, v_loc_a, v_owner, 'manual_upload'),
    ('Exact Loc Vendor', 'EXLOC-B', 20, 'pending_review', 'processing', v_org, v_brand, v_loc_b, v_owner, 'manual_upload');

  -- Org-level row: ledger_entries has no brand_id/location_id columns at all -- always
  -- org-only by construction, gated via tenant_scope_visible(organization_id, NULL, NULL, NULL).
  INSERT INTO public.ledger_entries (organization_id, account_code, debit, credit, reference_type)
  VALUES (v_org, 'EXLOC-TEST-9999', 5, 0, 'adjustment');
END $$;

-- ===================== org_manager: NULL location sees nothing, set location sees only that one =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'org_manager_null_location_sees_zero_invoices',
       count(*) = 0,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

INSERT INTO exact_loc_results
SELECT 'org_manager_null_location_still_sees_ledger_entry',
       count(*) = 1,
       'count=' || count(*)
FROM public.ledger_entries
WHERE account_code = 'EXLOC-TEST-9999';

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM exact_loc_ids WHERE key = 'loc_a')
WHERE id = (SELECT value FROM exact_loc_ids WHERE key = 'org_mgr');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'org_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'org_manager_with_location_a_sees_only_location_a',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['EXLOC-A'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

-- ===================== tenant_super_admin: same rule =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'tenant_admin_null_location_sees_zero_invoices',
       count(*) = 0,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM exact_loc_ids WHERE key = 'loc_b')
WHERE id = (SELECT value FROM exact_loc_ids WHERE key = 'tenant_admin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'tenant_admin_with_location_b_sees_only_location_b',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['EXLOC-B'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

-- ===================== branch_manager: same rule =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'branch_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'branch_manager_null_location_sees_zero_invoices',
       count(*) = 0,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

UPDATE public.profiles SET location_id = (SELECT value FROM exact_loc_ids WHERE key = 'loc_a')
WHERE id = (SELECT value FROM exact_loc_ids WHERE key = 'branch_mgr');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'branch_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'branch_manager_with_location_a_sees_only_location_a_not_b',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['EXLOC-A'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

-- ===================== location_manager / ground_staff: unaffected =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'location_mgr'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'location_manager_still_sees_own_fixed_location_only',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['EXLOC-A'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM exact_loc_ids WHERE key = 'ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO exact_loc_results
SELECT 'ground_staff_still_sees_own_fixed_location_only',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['EXLOC-A'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('EXLOC-A', 'EXLOC-B');

RESET ROLE;

-- ===================== verdict =====================

SELECT *
FROM exact_loc_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM exact_loc_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'require_exact_location_match_acceptance failed';
  END IF;
END $$;

ROLLBACK;
