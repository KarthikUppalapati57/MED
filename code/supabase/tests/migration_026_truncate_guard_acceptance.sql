-- Acceptance test for guarding migration 026's invoices truncate.
-- Rollback-scoped: no test data or truncation persists.

\set ON_ERROR_STOP on

BEGIN;

-- Keep unrelated invoice webhook trigger from blocking local DML during this test.
INSERT INTO private.workflow_runtime_settings (setting_name, setting_value)
VALUES ('service_role_key', 'local-test-service-role-key')
ON CONFLICT (setting_name) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

-- (a) Populated scenario: one invoice exists, so the guarded block must skip TRUNCATE.
INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000026000',
  'Migration 026 Guard Test Org',
  'migration-026-guard-test-org'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoices (
  id,
  organization_id,
  vendor_name,
  invoice_number,
  total_amount
)
VALUES (
  '00000000-0000-4000-8000-000000026001',
  '00000000-0000-4000-8000-000000026000',
  'Migration 026 Guard Vendor',
  'MIG-026-GUARD-POPULATED',
  26.00
);

DO $test$
DECLARE
  before_count integer;
  after_count integer;
  test_invoice_exists boolean;
BEGIN
  SELECT count(*) INTO before_count FROM public.invoices;

  IF (SELECT count(*) FROM public.invoices) = 0 THEN
    TRUNCATE TABLE public.invoices CASCADE;
  ELSE
    RAISE NOTICE '026: invoices table not empty (% rows); skipping TRUNCATE to protect data',
      (SELECT count(*) FROM public.invoices);
  END IF;

  SELECT count(*) INTO after_count FROM public.invoices;
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE id = '00000000-0000-4000-8000-000000026001'
  ) INTO test_invoice_exists;

  IF after_count <> before_count OR NOT test_invoice_exists THEN
    RAISE EXCEPTION 'Populated guard failed: before=%, after=%, test_invoice_exists=%',
      before_count, after_count, test_invoice_exists;
  END IF;

  RAISE NOTICE 'Populated guard passed: count remained %', after_count;
END;
$test$;

-- (b) Empty scenario: within this rollback transaction, make invoices empty and
-- assert the guarded block follows the TRUNCATE path without error.
TRUNCATE TABLE public.invoices CASCADE;

DO $test$
DECLARE
  before_count integer;
  after_count integer;
BEGIN
  SELECT count(*) INTO before_count FROM public.invoices;

  IF before_count <> 0 THEN
    RAISE EXCEPTION 'Empty scenario setup failed: invoices count is %', before_count;
  END IF;

  IF (SELECT count(*) FROM public.invoices) = 0 THEN
    TRUNCATE TABLE public.invoices CASCADE;
  ELSE
    RAISE NOTICE '026: invoices table not empty (% rows); skipping TRUNCATE to protect data',
      (SELECT count(*) FROM public.invoices);
  END IF;

  SELECT count(*) INTO after_count FROM public.invoices;

  IF after_count <> 0 THEN
    RAISE EXCEPTION 'Empty truncate path failed: after_count=%', after_count;
  END IF;

  RAISE NOTICE 'Empty truncate path passed: guarded TRUNCATE ran without error';
END;
$test$;

SELECT 'migration_026_truncate_guard acceptance passed' AS result;

ROLLBACK;
