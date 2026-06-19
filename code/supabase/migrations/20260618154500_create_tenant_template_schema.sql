-- Phase 2: Tenant template schema for future schema-per-tenant provisioning.
-- This creates empty blueprint tables only. The application continues to read/write
-- the current public shared tables until later migration phases switch modes.

BEGIN;

CREATE SCHEMA IF NOT EXISTS tenant_template;

COMMENT ON SCHEMA tenant_template IS
  'Blueprint schema used to provision per-tenant operational schemas. Contains no tenant data.';

-- The template must not be queried directly by browser/API roles.
REVOKE ALL ON SCHEMA tenant_template FROM PUBLIC;
REVOKE ALL ON SCHEMA tenant_template FROM anon;
REVOKE ALL ON SCHEMA tenant_template FROM authenticated;
GRANT USAGE ON SCHEMA tenant_template TO service_role;

DO $$
DECLARE
  table_name TEXT;
  template_tables TEXT[] := ARRAY[
    -- Core finance/AP
    'invoices',
    'invoice_line_items',
    'invoice_allocations',
    'invoice_documents',
    'invoice_ingestion_jobs',
    'invoice_action_reasons',
    'invoice_audit_events',
    'payments',
    'payment_accounts',
    'scheduled_payments',
    'scheduled_payment_invoices',
    'ledger_bills',
    'ledger_payments',
    'ledger_entries',
    'general_ledger_entries',
    'accounting_export_queue',
    'accounting_sync_logs',
    'gl_mappings',

    -- Inventory/products/recipes/prep
    'products',
    'inventory',
    'inventory_movements',
    'count_sheets',
    'count_sessions',
    'wastage_logs',
    'recipes',
    'recipe_ingredients',
    'smart_prep_plans',

    -- Vendors/procurement/receiving
    'vendors',
    'vendor_aliases',
    'vendor_items',
    'vendor_item_mappings',
    'vendor_item_prices',
    'vendor_statements',
    'vendor_statement_lines',
    'vendor_issues',
    'purchase_orders',
    'purchase_order_items',
    'receivings',
    'receiving_items',
    'transfers',
    'intercompany_transfers',

    -- Operations/POS/AI/workflow
    'operational_settings',
    'budget_targets',
    'closed_periods',
    'location_groups',
    'pos_items',
    'pos_menu_mapping',
    'pos_sales_data',
    'ai_insights',
    'domain_events',
    'processing_jobs',
    'approval_policies',
    'approval_instances',
    'approval_steps',
    'credit_requests',
    'tolerance_configurations',
    'invoice_line_matches',
    'reconciliation_variances',

    -- Labor and integrations
    'employees',
    'employee_shifts',
    'integrations',
    'api_keys',
    'webhook_endpoints',
    'webhook_subscriptions',
    'webhook_events_queue',
    'webhook_delivery_logs',
    'edi_transmissions'
  ];
BEGIN
  FOREACH table_name IN ARRAY template_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE NOTICE 'Skipping tenant_template.% because public.% does not exist', table_name, table_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS tenant_template.%I (LIKE public.%I INCLUDING ALL)',
      table_name,
      table_name
    );

    EXECUTE format('ALTER TABLE tenant_template.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE tenant_template.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE tenant_template.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL ON TABLE tenant_template.%I FROM authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE tenant_template.%I TO service_role', table_name);

    EXECUTE format(
      'COMMENT ON TABLE tenant_template.%I IS %L',
      table_name,
      'Tenant schema template cloned from public.' || table_name || '. Do not store live tenant data here.'
    );
  END LOOP;
END;
$$;

-- Track the intended template contents in a public control table so Phase 3 can
-- provision tenant schemas from a single authoritative ordered list.
CREATE TABLE IF NOT EXISTS public.tenant_template_tables (
  table_name TEXT PRIMARY KEY,
  table_group TEXT NOT NULL,
  copy_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_template_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_template_tables_platform_admin_all" ON public.tenant_template_tables;
CREATE POLICY "tenant_template_tables_platform_admin_all"
ON public.tenant_template_tables
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_template_tables_org_read" ON public.tenant_template_tables;
CREATE POLICY "tenant_template_tables_org_read"
ON public.tenant_template_tables
FOR SELECT
USING (auth.uid() IS NOT NULL);

INSERT INTO public.tenant_template_tables (table_name, table_group, copy_order, is_required)
VALUES
  ('invoices', 'finance', 10, true),
  ('invoice_line_items', 'finance', 20, true),
  ('invoice_allocations', 'finance', 30, false),
  ('invoice_documents', 'finance', 40, false),
  ('invoice_ingestion_jobs', 'finance', 50, false),
  ('payments', 'finance', 60, true),
  ('payment_accounts', 'finance', 70, false),
  ('scheduled_payments', 'finance', 80, false),
  ('ledger_bills', 'finance', 90, false),
  ('ledger_payments', 'finance', 100, false),
  ('ledger_entries', 'finance', 110, false),
  ('products', 'inventory', 200, true),
  ('inventory', 'inventory', 210, true),
  ('inventory_movements', 'inventory', 220, false),
  ('count_sheets', 'inventory', 230, false),
  ('count_sessions', 'inventory', 240, false),
  ('wastage_logs', 'inventory', 250, false),
  ('recipes', 'inventory', 260, true),
  ('recipe_ingredients', 'inventory', 270, false),
  ('smart_prep_plans', 'inventory', 280, false),
  ('vendors', 'procurement', 300, true),
  ('vendor_items', 'procurement', 310, false),
  ('vendor_item_mappings', 'procurement', 320, false),
  ('vendor_item_prices', 'procurement', 330, false),
  ('purchase_orders', 'procurement', 340, false),
  ('purchase_order_items', 'procurement', 350, false),
  ('receivings', 'procurement', 360, false),
  ('receiving_items', 'procurement', 370, false),
  ('operational_settings', 'operations', 400, true),
  ('budget_targets', 'operations', 410, false),
  ('closed_periods', 'operations', 420, false),
  ('location_groups', 'operations', 430, false),
  ('pos_items', 'operations', 440, false),
  ('pos_menu_mapping', 'operations', 450, false),
  ('pos_sales_data', 'operations', 460, false),
  ('ai_insights', 'operations', 470, false),
  ('domain_events', 'operations', 480, false),
  ('processing_jobs', 'operations', 490, false),
  ('approval_policies', 'workflow', 500, false),
  ('approval_instances', 'workflow', 510, false),
  ('approval_steps', 'workflow', 520, false),
  ('employees', 'labor', 600, false),
  ('employee_shifts', 'labor', 610, false),
  ('integrations', 'integrations', 700, false),
  ('api_keys', 'integrations', 710, false),
  ('webhook_endpoints', 'integrations', 720, false)
ON CONFLICT (table_name) DO UPDATE SET
  table_group = EXCLUDED.table_group,
  copy_order = EXCLUDED.copy_order,
  is_required = EXCLUDED.is_required;

COMMENT ON TABLE public.tenant_template_tables IS
  'Ordered manifest of operational tables intended for schema-per-tenant provisioning.';

COMMIT;