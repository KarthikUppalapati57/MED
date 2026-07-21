-- Acceptance test for 20260721000011_capture_tenant_super_admin_tenant_wide_scope.sql.
--
-- Exercises tenant_scope_visible/reference_scope_visible under real RLS (impersonation
-- pattern from tenant_super_admin_identity_rls_acceptance.sql), on the actual gated
-- tables (invoices, vendors) rather than just asserting the helper function's boolean
-- return value. Proves: tenant_super_admin sees a sibling org's rows within their own
-- tenant, does NOT see rows in a different tenant, and org_manager's own-org-only
-- behavior is unchanged.

BEGIN;

CREATE TEMP TABLE tsa_scope_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tsa_scope_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON tsa_scope_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tsa_scope_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_tenant_other uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_org_c uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_org_manager_b uuid := gen_random_uuid();
  v_org_manager_c uuid := gen_random_uuid();
BEGIN
  INSERT INTO tsa_scope_ids(key, value) VALUES
    ('tenant', v_tenant), ('tenant_other', v_tenant_other),
    ('org_a', v_org_a), ('org_b', v_org_b), ('org_c', v_org_c),
    ('tenant_admin', v_tenant_admin),
    ('org_manager_b', v_org_manager_b), ('org_manager_c', v_org_manager_c);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_tenant_admin, 'authenticated', 'authenticated', 'tsa-scope-tenant-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_manager_b, 'authenticated', 'authenticated', 'tsa-scope-org-manager-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_manager_c, 'authenticated', 'authenticated', 'tsa-scope-org-manager-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES
    (v_tenant, 'TSA Scope Tenant', 'tsa-scope-tenant', v_tenant_admin),
    (v_tenant_other, 'TSA Scope Other Tenant', 'tsa-scope-other-tenant', v_org_manager_c);

  -- org_a and org_b share v_tenant; org_c belongs to a different tenant entirely.
  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES
    (v_org_a, v_tenant, 'TSA Scope Org A', 'tsa-scope-org-a', v_tenant_admin),
    (v_org_b, v_tenant, 'TSA Scope Org B', 'tsa-scope-org-b', v_org_manager_b),
    (v_org_c, v_tenant_other, 'TSA Scope Org C', 'tsa-scope-org-c', v_org_manager_c);

  INSERT INTO public.profiles (
    id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status
  ) VALUES
    (v_tenant_admin, v_tenant, v_org_a, NULL, NULL, 'tsa-scope-tenant-admin@example.test', 'TSA Scope Tenant Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_org_manager_b, v_tenant, v_org_b, NULL, NULL, 'tsa-scope-org-manager-b@example.test', 'TSA Scope Org Manager B', 'org_manager', 'organization', 'active'),
    (v_org_manager_c, v_tenant_other, v_org_c, NULL, NULL, 'tsa-scope-org-manager-c@example.test', 'TSA Scope Org Manager C', 'org_manager', 'organization', 'active')
  ON CONFLICT (id) DO UPDATE
     SET tenant_id = EXCLUDED.tenant_id,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         access_level = EXCLUDED.access_level,
         status = EXCLUDED.status,
         deleted_at = NULL,
         updated_at = now();

  -- Financial table (gated by tenant_scope_visible): one invoice per org.
  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES
    ('TSA Scope Vendor', 'TSA-ORG-A', 10, 'pending_review', 'processing', v_org_a, NULL, NULL, v_tenant_admin, 'manual_upload'),
    ('TSA Scope Vendor', 'TSA-ORG-B', 20, 'pending_review', 'processing', v_org_b, NULL, NULL, v_org_manager_b, 'manual_upload'),
    ('TSA Scope Vendor', 'TSA-ORG-C', 30, 'pending_review', 'processing', v_org_c, NULL, NULL, v_org_manager_c, 'manual_upload');

  -- Reference table (gated by reference_scope_visible): brand-shared (location NULL) vendor per org.
  INSERT INTO public.vendors (name, organization_id, brand_id, location_id, created_by)
  VALUES
    ('TSA Scope Vendor Org A', v_org_a, NULL, NULL, v_tenant_admin),
    ('TSA Scope Vendor Org B', v_org_b, NULL, NULL, v_org_manager_b),
    ('TSA Scope Vendor Org C', v_org_c, NULL, NULL, v_org_manager_c);
END $$;

-- ===================== tenant_super_admin: sees across orgs within own tenant =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tsa_scope_ids WHERE key = 'tenant_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO tsa_scope_results
SELECT 'tenant_admin_sees_invoice_in_sibling_org_same_tenant',
       count(*) = 1,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number = 'TSA-ORG-B';

INSERT INTO tsa_scope_results
SELECT 'tenant_admin_sees_vendor_in_sibling_org_same_tenant',
       count(*) = 1,
       'count=' || count(*)
FROM public.vendors
WHERE name = 'TSA Scope Vendor Org B';

INSERT INTO tsa_scope_results
SELECT 'tenant_admin_sees_own_org_invoice',
       count(*) = 1,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number = 'TSA-ORG-A';

-- ===================== tenant_super_admin: does NOT see across tenants =====================

INSERT INTO tsa_scope_results
SELECT 'tenant_admin_cannot_see_invoice_in_other_tenant',
       count(*) = 0,
       'count=' || count(*)
FROM public.invoices
WHERE invoice_number = 'TSA-ORG-C';

INSERT INTO tsa_scope_results
SELECT 'tenant_admin_cannot_see_vendor_in_other_tenant',
       count(*) = 0,
       'count=' || count(*)
FROM public.vendors
WHERE name = 'TSA Scope Vendor Org C';

RESET ROLE;

-- ===================== org_manager: unaffected, still capped to own org =====================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tsa_scope_ids WHERE key = 'org_manager_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO tsa_scope_results
SELECT 'org_manager_still_scoped_to_own_org_only',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['TSA-ORG-B'],
       'invoice_numbers=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE invoice_number IN ('TSA-ORG-A', 'TSA-ORG-B', 'TSA-ORG-C');

RESET ROLE;

-- ===================== verdict =====================

SELECT *
FROM tsa_scope_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tsa_scope_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'tenant_super_admin_scope_visible_acceptance failed';
  END IF;
END $$;

ROLLBACK;
