BEGIN;

-- Step 1: make the profiles-based resolver canonical while preserving the get_auth_org() name used by existing policies.
CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_org();
$$;

-- Existing and new RLS policies call the canonical resolver directly.
GRANT EXECUTE ON FUNCTION public.get_my_org() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO anon, authenticated, service_role;

-- Step 2: replace literal-true insert policies with tenant-scoped checks.
-- Service-role Edge Function clients use BYPASSRLS, so no explicit service-role policy branch is needed.
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can insert telemetry" ON public.web_vitals_telemetry;
CREATE POLICY "Users can insert telemetry"
ON public.web_vitals_telemetry
FOR INSERT
WITH CHECK (organization_id = public.get_my_org());

-- Step 3: force RLS on every public shared-tenant table with an organization_id column.
ALTER TABLE public.accounting_export_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_sync_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approval_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approval_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.archived_brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.archived_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.archived_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.archived_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs_default FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs_y2025 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs_y2026 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auto_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.brand_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.brands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.budget_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.closed_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.commissary_routes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.count_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.count_sheets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.custom_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_action_status FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_escalation_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_handoff_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_report_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_report_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_review_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.developer_api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dim_product FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dim_user FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dim_vendor FORCE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.edi_transmissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fact_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fact_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fact_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fact_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fact_wastage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.general_ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gl_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_ingestion_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_matches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.iot_sensors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.labor_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.location_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.location_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_coupon_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_payment_methods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_step_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_workflow_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operational_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pos_configurations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pos_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu_mapping FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_data FORCE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_bids FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receivings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_variances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.smart_prep_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.temperature_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_schema_retirement_archive FORCE ROW LEVEL SECURITY;
ALTER TABLE public.time_clocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tolerance_configurations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_item_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_item_prices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_statements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wastage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_vitals_telemetry FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events_queue FORCE ROW LEVEL SECURITY;

COMMIT;
