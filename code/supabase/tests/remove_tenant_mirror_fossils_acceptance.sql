-- Acceptance test for 20260628000000_remove_tenant_mirror_fossils.sql.
-- Run with psql. The test is rollback-scoped and leaves no persistent rows.

\set ON_ERROR_STOP on

BEGIN;

-- The invoice webhook trigger requires runtime settings even in local tests.
INSERT INTO private.workflow_runtime_settings (setting_name, setting_value)
VALUES ('service_role_key', 'local-test-service-role-key')
ON CONFLICT (setting_name) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

DO $test$
DECLARE
  fossil_trigger_count integer;
BEGIN
  SELECT count(*)
    INTO fossil_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('tenant_mirror_dual_write', 'auto_register_new_tenant_shared_public');

  IF fossil_trigger_count <> 0 THEN
    RAISE EXCEPTION 'Expected 0 fossil triggers after migration, found %', fossil_trigger_count;
  END IF;
END;
$test$;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000028000',
  'Fossil Acceptance Org',
  'fossil-acceptance-org'
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
  '00000000-0000-4000-8000-000000028001',
  '00000000-0000-4000-8000-000000028000',
  'Fossil Acceptance Vendor',
  'FOSSIL-AFTER-001',
  10.00
);

UPDATE public.invoices
SET total_amount = 12.50,
    validation_notes = 'fossil cleanup update ok'
WHERE id = '00000000-0000-4000-8000-000000028001';

DO $test$
DECLARE
  invoice_total numeric;
  invoice_notes text;
BEGIN
  SELECT total_amount, validation_notes
    INTO invoice_total, invoice_notes
  FROM public.invoices
  WHERE id = '00000000-0000-4000-8000-000000028001';

  IF invoice_total <> 12.50 OR invoice_notes <> 'fossil cleanup update ok' THEN
    RAISE EXCEPTION 'Invoice update assertion failed: total=%, notes=%', invoice_total, invoice_notes;
  END IF;
END;
$test$;

INSERT INTO public.invoice_line_items (
  id,
  invoice_id,
  organization_id,
  item_name,
  quantity,
  unit_price,
  total_price
)
VALUES (
  '00000000-0000-4000-8000-000000028002',
  '00000000-0000-4000-8000-000000028001',
  '00000000-0000-4000-8000-000000028000',
  'Fossil Acceptance Item',
  2,
  5.00,
  10.00
);

UPDATE public.invoice_line_items
SET quantity = 3,
    total_price = 15.00
WHERE id = '00000000-0000-4000-8000-000000028002';

DO $test$
DECLARE
  line_quantity numeric;
  line_total numeric;
BEGIN
  SELECT quantity, total_price
    INTO line_quantity, line_total
  FROM public.invoice_line_items
  WHERE id = '00000000-0000-4000-8000-000000028002';

  IF line_quantity <> 3 OR line_total <> 15.00 THEN
    RAISE EXCEPTION 'Invoice line item update assertion failed: quantity=%, total=%', line_quantity, line_total;
  END IF;
END;
$test$;

DELETE FROM public.invoice_line_items
WHERE id = '00000000-0000-4000-8000-000000028002';

DELETE FROM public.invoices
WHERE id = '00000000-0000-4000-8000-000000028001';

DO $test$
DECLARE
  remaining_lines integer;
  remaining_invoices integer;
BEGIN
  SELECT count(*) INTO remaining_lines
  FROM public.invoice_line_items
  WHERE id = '00000000-0000-4000-8000-000000028002';

  SELECT count(*) INTO remaining_invoices
  FROM public.invoices
  WHERE id = '00000000-0000-4000-8000-000000028001';

  IF remaining_lines <> 0 OR remaining_invoices <> 0 THEN
    RAISE EXCEPTION 'Delete assertion failed: invoices=%, lines=%', remaining_invoices, remaining_lines;
  END IF;
END;
$test$;

SELECT 'remove_tenant_mirror_fossils acceptance passed' AS result;

ROLLBACK;
