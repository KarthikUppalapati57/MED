BEGIN;

-- Excluded after live verification:
-- customers, marketing_campaigns: no location_id, so requested LOCATION-SCOPED rule cannot be applied.
-- loyalty_memberships: FK to customers verified, but parent has no location scope to inherit.
-- gl_mappings, tolerance_configurations, closed_periods: no brand_id/location_id for requested REFERENCE-HYBRID rule.
-- pos_configurations: has location_id but no brand_id; requested REFERENCE-HYBRID shape is incomplete.
-- general_ledger_entries, integrations, webhook_endpoints: explicitly held for Batch 3c.

CREATE OR REPLACE FUNCTION public.batch3b_org_visible(
  p_organization_id uuid,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN true;
  END IF;

  RETURN p_organization_id IS NOT NULL
     AND p_organization_id = public.get_auth_org();
END;
$$;

CREATE OR REPLACE FUNCTION public.batch3b_org_writable(
  p_organization_id uuid,
  p_admin_only boolean DEFAULT false,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN true;
  END IF;

  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM public.get_auth_org() THEN
    RETURN false;
  END IF;

  IF p_admin_only THEN
    RETURN public.is_admin();
  END IF;

  RETURN public.is_manager_or_above();
END;
$$;

CREATE OR REPLACE FUNCTION public.batch3b_notification_recipient(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND p_user_id = auth.uid();
$$;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'operational_settings',
    'accounting_export_queue','accounting_sync_logs','custom_reports','domain_events',
    'invoice_ingestion_jobs','location_groups','onboarding_progress','onboarding_step_events',
    'onboarding_workflow_runs','onboarding_coupon_redemptions','onboarding_payment_methods',
    'processing_jobs','procurement_bids','roles','web_vitals_telemetry','notifications'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- Reference-hybrid setting.
CREATE POLICY batch3b_operational_settings_select ON public.operational_settings
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY batch3b_operational_settings_insert ON public.operational_settings
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));
CREATE POLICY batch3b_operational_settings_update ON public.operational_settings
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

-- Org-level admin-only write tables.
CREATE POLICY batch3b_accounting_export_queue_select ON public.accounting_export_queue
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_accounting_export_queue_insert ON public.accounting_export_queue
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_accounting_export_queue_update ON public.accounting_export_queue
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_accounting_sync_logs_select ON public.accounting_sync_logs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_accounting_sync_logs_insert ON public.accounting_sync_logs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_accounting_sync_logs_update ON public.accounting_sync_logs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_roles_select ON public.roles
  FOR SELECT USING (is_system IS TRUE OR public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_roles_insert ON public.roles
  FOR INSERT WITH CHECK (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true));
CREATE POLICY batch3b_roles_update ON public.roles
  FOR UPDATE USING (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true))
  WITH CHECK (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true));

-- Org-level manager+ write tables.
CREATE POLICY batch3b_custom_reports_select ON public.custom_reports
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_custom_reports_insert ON public.custom_reports
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_custom_reports_update ON public.custom_reports
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_domain_events_select ON public.domain_events
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_domain_events_insert ON public.domain_events
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_domain_events_update ON public.domain_events
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_invoice_ingestion_jobs_select ON public.invoice_ingestion_jobs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_invoice_ingestion_jobs_insert ON public.invoice_ingestion_jobs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_invoice_ingestion_jobs_update ON public.invoice_ingestion_jobs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_location_groups_select ON public.location_groups
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_location_groups_insert ON public.location_groups
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_location_groups_update ON public.location_groups
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_progress_select ON public.onboarding_progress
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_onboarding_progress_insert ON public.onboarding_progress
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_onboarding_progress_update ON public.onboarding_progress
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_step_events_select ON public.onboarding_step_events
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_onboarding_step_events_insert ON public.onboarding_step_events
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_onboarding_step_events_update ON public.onboarding_step_events
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_workflow_runs_select ON public.onboarding_workflow_runs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_onboarding_workflow_runs_insert ON public.onboarding_workflow_runs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_onboarding_workflow_runs_update ON public.onboarding_workflow_runs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_coupon_redemptions_select ON public.onboarding_coupon_redemptions
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_onboarding_coupon_redemptions_insert ON public.onboarding_coupon_redemptions
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_onboarding_coupon_redemptions_update ON public.onboarding_coupon_redemptions
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_payment_methods_select ON public.onboarding_payment_methods
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_onboarding_payment_methods_insert ON public.onboarding_payment_methods
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_onboarding_payment_methods_update ON public.onboarding_payment_methods
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_processing_jobs_select ON public.processing_jobs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_processing_jobs_insert ON public.processing_jobs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_processing_jobs_update ON public.processing_jobs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_procurement_bids_select ON public.procurement_bids
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_procurement_bids_insert ON public.procurement_bids
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_procurement_bids_update ON public.procurement_bids
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_web_vitals_telemetry_select ON public.web_vitals_telemetry
  FOR SELECT USING (public.batch3b_org_visible(organization_id));
CREATE POLICY batch3b_web_vitals_telemetry_insert ON public.web_vitals_telemetry
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));
CREATE POLICY batch3b_web_vitals_telemetry_update ON public.web_vitals_telemetry
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

-- User-scoped notifications. Recipient column verified as notifications.user_id.
CREATE POLICY batch3b_notifications_select ON public.notifications
  FOR SELECT USING (public.batch3b_notification_recipient(user_id));
CREATE POLICY batch3b_notifications_update ON public.notifications
  FOR UPDATE USING (public.batch3b_notification_recipient(user_id))
  WITH CHECK (public.batch3b_notification_recipient(user_id));

REVOKE ALL PRIVILEGES ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry,
  public.notifications
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry
TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry,
  public.notifications
TO service_role;

COMMIT;