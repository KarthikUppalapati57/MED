BEGIN;

-- Remove retired schema-per-tenant dual-write triggers from shared public tables.
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.vendors;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.products;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.invoices;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.payments;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.inventory;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.wastage_logs;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.recipes;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.invoice_line_items;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.employees;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.employee_shifts;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.integrations;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.recipe_ingredients;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.inventory_movements;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.purchase_orders;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.ledger_bills;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.ledger_payments;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.ledger_entries;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.ai_insights;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.domain_events;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.processing_jobs;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.pos_items;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.pos_menu_mapping;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.pos_sales_data;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.receivings;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.count_sheets;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.count_sessions;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.closed_periods;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.location_groups;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.vendor_item_prices;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.api_keys;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.webhook_endpoints;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.operational_settings;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.budget_targets;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.smart_prep_plans;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.payment_accounts;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.invoice_documents;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.invoice_ingestion_jobs;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.vendor_items;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.vendor_item_mappings;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.invoice_allocations;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.approval_policies;
DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.scheduled_payments;

-- Remove the organization trigger that only maintained the retired tenant registry path.
DROP TRIGGER IF EXISTS auto_register_new_tenant_shared_public ON public.organizations;

-- Drop fossil trigger helpers after their triggers are detached.
DROP FUNCTION IF EXISTS public.mirror_public_row_to_tenant_schema();
DROP FUNCTION IF EXISTS public.install_tenant_mirror_triggers();
DROP FUNCTION IF EXISTS public.auto_register_new_tenant_shared_public();

COMMIT;
