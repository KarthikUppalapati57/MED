-- Add vendor statement parent rows to tenant routing manifest.
-- Statement lines are child-scoped by statement_id and need a dedicated adapter.

BEGIN;

INSERT INTO public.tenant_template_tables (table_name, table_group, copy_order, is_required)
VALUES
  ('vendor_statements', 'procurement', 380, false)
ON CONFLICT (table_name) DO UPDATE SET
  table_group = EXCLUDED.table_group,
  copy_order = EXCLUDED.copy_order,
  is_required = EXCLUDED.is_required;

COMMIT;
