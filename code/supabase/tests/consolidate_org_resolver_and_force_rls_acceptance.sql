-- Acceptance test for 20260628000001_consolidate_org_resolver_and_force_rls.sql.
-- Rollback-scoped: leaves no persistent test rows.

\set ON_ERROR_STOP on

BEGIN;

-- Keep unrelated DB-to-Edge triggers from blocking local DML during tests.
INSERT INTO private.workflow_runtime_settings (setting_name, setting_value)
VALUES ('service_role_key', 'local-test-service-role-key')
ON CONFLICT (setting_name) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

-- Seed two tenants and one user/profile in each as the privileged setup role.
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000281001',
    'authenticated',
    'authenticated',
    'org-a-resolver-test@example.test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000282001',
    'authenticated',
    'authenticated',
    'org-b-resolver-test@example.test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('00000000-0000-4000-8000-000000281000', 'Resolver Test Org A', 'resolver-test-org-a'),
  ('00000000-0000-4000-8000-000000282000', 'Resolver Test Org B', 'resolver-test-org-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000281100', '00000000-0000-4000-8000-000000281000', 'Resolver Test Org A Brand'),
  ('00000000-0000-4000-8000-000000282100', '00000000-0000-4000-8000-000000282000', 'Resolver Test Org B Brand')
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO public.locations (id, brand_id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000281200', '00000000-0000-4000-8000-000000281100', '00000000-0000-4000-8000-000000281000', 'Resolver Test Org A Location'),
  ('00000000-0000-4000-8000-000000282200', '00000000-0000-4000-8000-000000282100', '00000000-0000-4000-8000-000000282000', 'Resolver Test Org B Location')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, organization_id, brand_id, location_id, full_name, email, role, access_level, status)
VALUES
  (
    '00000000-0000-4000-8000-000000281001',
    '00000000-0000-4000-8000-000000281000',
    '00000000-0000-4000-8000-000000281100',
    NULL,
    'Resolver User A',
    'org-a-resolver-test@example.test',
    'branch_manager',
    'brand',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000282001',
    '00000000-0000-4000-8000-000000282000',
    '00000000-0000-4000-8000-000000282100',
    NULL,
    'Resolver User B',
    'org-b-resolver-test@example.test',
    'branch_manager',
    'brand',
    'active'
  )
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    role = EXCLUDED.role,
    access_level = EXCLUDED.access_level,
    status = EXCLUDED.status;

INSERT INTO public.invoices (id, organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, deleted_at)
VALUES
  (
    '00000000-0000-4000-8000-000000281010',
    '00000000-0000-4000-8000-000000281000',
    '00000000-0000-4000-8000-000000281100',
    '00000000-0000-4000-8000-000000281200',
    'Resolver Vendor A',
    'RESOLVER-A-001',
    101.00,
    NULL
  ),
  (
    '00000000-0000-4000-8000-000000282010',
    '00000000-0000-4000-8000-000000282000',
    '00000000-0000-4000-8000-000000282100',
    '00000000-0000-4000-8000-000000282200',
    'Resolver Vendor B',
    'RESOLVER-B-001',
    202.00,
    NULL
  );

-- Transaction-scoped table grants let the simulated authenticated role reach RLS.
-- They are rolled back with this test and do not change persistent privileges.
GRANT SELECT, INSERT ON public.invoices TO authenticated;
GRANT SELECT, INSERT ON public.invoice_line_items TO authenticated;

INSERT INTO public.invoice_line_items (id, invoice_id, organization_id, item_name, quantity, unit_price, total_price)
VALUES
  (
    '00000000-0000-4000-8000-000000281020',
    '00000000-0000-4000-8000-000000281010',
    '00000000-0000-4000-8000-000000281000',
    'Resolver Line A',
    1,
    101.00,
    101.00
  ),
  (
    '00000000-0000-4000-8000-000000282020',
    '00000000-0000-4000-8000-000000282010',
    '00000000-0000-4000-8000-000000282000',
    'Resolver Line B',
    1,
    202.00,
    202.00
  );

SET LOCAL ROLE authenticated;

-- User A profile is Org A. The JWT app_metadata intentionally lies and says Org B.
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000281001',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'organization_id', '00000000-0000-4000-8000-000000282000',
      'role', 'manager'
    ),
    'user_metadata', jsonb_build_object(
      'organization_id', '00000000-0000-4000-8000-000000281000',
      'role', 'manager'
    )
  )::text,
  true
);

-- (3) Regression assertion: get_auth_org() now returns the profile-backed Org A,
-- even though JWT app_metadata intentionally claims Org B.
DO $test$
DECLARE
  auth_org uuid;
BEGIN
  SELECT public.get_auth_org()
    INTO auth_org;

  IF auth_org <> '00000000-0000-4000-8000-000000281000'::uuid THEN
    RAISE EXCEPTION 'get_auth_org expected profile Org A, got %', auth_org;
  END IF;

  IF auth_org = '00000000-0000-4000-8000-000000282000'::uuid THEN
    RAISE EXCEPTION 'get_auth_org still trusts JWT app_metadata organization_id';
  END IF;

  RAISE NOTICE 'Resolver assertion passed: get_auth_org() returned profile Org A despite JWT app_metadata Org B';
END;
$test$;

-- (1) User A can only see Org-A invoices and line items.
DO $test$
DECLARE
  invoice_count integer;
  invoice_wrong_org_count integer;
  line_count integer;
  line_wrong_org_count integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE organization_id <> '00000000-0000-4000-8000-000000281000'::uuid)
    INTO invoice_count, invoice_wrong_org_count
  FROM public.invoices
  WHERE id IN (
    '00000000-0000-4000-8000-000000281010'::uuid,
    '00000000-0000-4000-8000-000000282010'::uuid
  );

  SELECT count(*), count(*) FILTER (WHERE organization_id <> '00000000-0000-4000-8000-000000281000'::uuid)
    INTO line_count, line_wrong_org_count
  FROM public.invoice_line_items
  WHERE id IN (
    '00000000-0000-4000-8000-000000281020'::uuid,
    '00000000-0000-4000-8000-000000282020'::uuid
  );

  IF invoice_count <> 1 OR invoice_wrong_org_count <> 0 THEN
    RAISE EXCEPTION 'Invoice SELECT isolation failed: visible=%, wrong_org=%', invoice_count, invoice_wrong_org_count;
  END IF;

  IF line_count <> 1 OR line_wrong_org_count <> 0 THEN
    RAISE EXCEPTION 'Invoice line SELECT isolation failed: visible=%, wrong_org=%', line_count, line_wrong_org_count;
  END IF;

  RAISE NOTICE 'SELECT isolation passed: user A sees only Org-A invoice and invoice_line_item rows';
END;
$test$;

-- (2) User A cannot insert Org-B invoice or invoice line rows.
DO $test$
DECLARE
  invoice_rejected boolean := false;
  line_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.invoices (id, organization_id, vendor_name, invoice_number, total_amount)
    VALUES (
      '00000000-0000-4000-8000-000000282011',
      '00000000-0000-4000-8000-000000282000',
      'Rejected Vendor B',
      'RESOLVER-B-REJECTED',
      303.00
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
    invoice_rejected := true;
  END;

  BEGIN
    INSERT INTO public.invoice_line_items (id, invoice_id, organization_id, item_name, quantity, unit_price, total_price)
    VALUES (
      '00000000-0000-4000-8000-000000282021',
      '00000000-0000-4000-8000-000000282010',
      '00000000-0000-4000-8000-000000282000',
      'Rejected Org B Line',
      1,
      303.00,
      303.00
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
    line_rejected := true;
  END;

  IF NOT invoice_rejected THEN
    RAISE EXCEPTION 'Org-B invoice insert was not rejected for user A';
  END IF;

  IF NOT line_rejected THEN
    RAISE EXCEPTION 'Org-B invoice_line_items insert was not rejected for user A';
  END IF;

  RAISE NOTICE 'INSERT isolation passed: user A cannot insert Org-B invoice or invoice_line_item rows';
END;
$test$;

SELECT 'consolidate_org_resolver_and_force_rls acceptance passed' AS result;

ROLLBACK;
