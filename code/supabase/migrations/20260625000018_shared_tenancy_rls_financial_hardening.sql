BEGIN;

CREATE TABLE IF NOT EXISTS public.data_ownership_catalog (
  table_name TEXT PRIMARY KEY,
  ownership_scope TEXT NOT NULL CHECK (ownership_scope IN (
    'organization',
    'brand',
    'location',
    'global_reference',
    'platform_only',
    'archive',
    'derived_log',
    'integration_log',
    'review_required'
  )),
  scope_columns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  access_model TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'reviewed' CHECK (review_status IN ('reviewed', 'needs_followup')),
  notes TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_ownership_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_ownership_catalog_platform_admin_all ON public.data_ownership_catalog;
CREATE POLICY data_ownership_catalog_platform_admin_all
ON public.data_ownership_catalog
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

REVOKE ALL ON TABLE public.data_ownership_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.data_ownership_catalog TO authenticated;
GRANT ALL ON TABLE public.data_ownership_catalog TO service_role;

INSERT INTO public.data_ownership_catalog (
  table_name,
  ownership_scope,
  scope_columns,
  access_model,
  review_status,
  notes
) VALUES
  ('access_requests', 'platform_only', ARRAY[]::TEXT[], 'Platform-admin workflow queue; no client-wide tenant scope column.', 'needs_followup', 'Confirm whether submitted requests should be readable by requester only.'),
  ('approval_steps', 'organization', ARRAY['approval_policy_id'], 'Scoped through approval policy ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce via approval_policies join.'),
  ('archived_organizations', 'archive', ARRAY[]::TEXT[], 'Platform archive only.', 'reviewed', 'Archive tables must remain platform/service-role controlled.'),
  ('archived_users', 'archive', ARRAY[]::TEXT[], 'Platform archive only.', 'reviewed', 'Archive tables must remain platform/service-role controlled.'),
  ('audit_logs', 'organization', ARRAY['organization_id'], 'Org members can view scoped rows; inserts must be same-org or service role.', 'reviewed', 'Public TRUE insert policy removed in this phase.'),
  ('commissary_route_stops', 'organization', ARRAY['route_id'], 'Scoped through commissary route ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce via commissary_routes join.'),
  ('contact_requests', 'platform_only', ARRAY[]::TEXT[], 'Inbound lead/support queue.', 'needs_followup', 'Anon insert may be valid; authenticated broad reads should not be.'),
  ('debug_logs', 'platform_only', ARRAY[]::TEXT[], 'Internal diagnostics only.', 'reviewed', 'RLS enabled; platform-admin read only.'),
  ('demo_requests', 'platform_only', ARRAY[]::TEXT[], 'Inbound sales queue.', 'needs_followup', 'Anon insert may be valid; authenticated broad reads should not be.'),
  ('dim_date', 'global_reference', ARRAY[]::TEXT[], 'Shared read-only calendar dimension.', 'reviewed', 'Read policies may be broad if table is non-sensitive.'),
  ('error_logs', 'platform_only', ARRAY['user_id'], 'Client may append diagnostics; platform can read.', 'needs_followup', 'Prefer Edge Function logging for authenticated inserts.'),
  ('franchise_invoices', 'organization', ARRAY['franchise_agreement_id'], 'Scoped through franchise agreement ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce via franchise_agreements join.'),
  ('global_vendor_items', 'global_reference', ARRAY[]::TEXT[], 'Shared canonical vendor item catalog.', 'reviewed', 'Writes should remain platform/service controlled.'),
  ('invoice_action_reasons', 'global_reference', ARRAY[]::TEXT[], 'Shared AP reason vocabulary.', 'reviewed', 'Read-only for clients.'),
  ('invoice_event_log', 'derived_log', ARRAY['invoice_id'], 'Scoped through invoice ownership.', 'reviewed', 'RLS enabled; org/platform select; no direct client writes.'),
  ('invoice_processing_jobs', 'derived_log', ARRAY['invoice_id'], 'Scoped through invoice ownership.', 'reviewed', 'RLS enabled; org/platform select; no direct client writes.'),
  ('invoice_sync_log', 'derived_log', ARRAY['invoice_id'], 'Scoped through invoice ownership.', 'reviewed', 'RLS enabled; org/platform select; no direct client writes.'),
  ('menu_sync_logs', 'integration_log', ARRAY['integration_id'], 'Scoped through integration ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce via integrations join.'),
  ('organizations', 'organization', ARRAY['id'], 'Org self-read plus platform admin.', 'reviewed', 'Primary tenant root table.'),
  ('plans', 'global_reference', ARRAY[]::TEXT[], 'Shared read-only subscription catalog.', 'reviewed', 'Broad read is acceptable if no private pricing metadata.'),
  ('pos_order_items', 'organization', ARRAY['order_id'], 'Scoped through POS order ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce through parent order.'),
  ('purchase_order_items', 'organization', ARRAY['organization_id'], 'Org-owned operational table.', 'reviewed', 'Already has organization scope.'),
  ('receiving_items', 'organization', ARRAY['organization_id'], 'Org-owned operational table.', 'reviewed', 'Already has organization scope.'),
  ('role_permissions', 'platform_only', ARRAY[]::TEXT[], 'RBAC definition table.', 'reviewed', 'Read/write should be platform controlled.'),
  ('roles', 'organization', ARRAY['organization_id'], 'Org custom roles plus platform defaults.', 'reviewed', 'Review broad/default role visibility separately.'),
  ('royalty_invoices', 'organization', ARRAY['franchise_agreement_id'], 'Scoped through franchise agreement ownership.', 'needs_followup', 'Should inherit organization_id directly or enforce via franchise_agreements join.'),
  ('scheduled_payment_invoices', 'organization', ARRAY['scheduled_payment_id'], 'Scoped through scheduled payment ownership.', 'reviewed', 'Join-scoped to scheduled_payments.'),
  ('tenant_mirror_tables', 'platform_only', ARRAY[]::TEXT[], 'Retired schema-per-tenant mirror control plane.', 'reviewed', 'Authenticated read removed; retained only as historical control metadata.'),
  ('vendor_statement_lines', 'organization', ARRAY['statement_id'], 'Scoped through vendor statement ownership.', 'reviewed', 'Join-scoped to vendor_statements.'),
  ('web_vitals_telemetry', 'organization', ARRAY['organization_id'], 'Org-scoped telemetry.', 'reviewed', 'Public policy risk should be narrowed if raw URLs contain sensitive data.'),
  ('webhook_delivery_logs', 'organization', ARRAY['endpoint_id'], 'Scoped through webhook endpoint ownership.', 'reviewed', 'Join-scoped to webhook_endpoints.'),
  ('webhook_events', 'platform_only', ARRAY[]::TEXT[], 'Provider payload intake log.', 'reviewed', 'Platform/service controlled.'),
  ('webhook_subscriptions', 'organization', ARRAY['organization_id'], 'Org webhook subscription settings.', 'reviewed', 'Org-scoped configuration.')
ON CONFLICT (table_name) DO UPDATE SET
  ownership_scope = EXCLUDED.ownership_scope,
  scope_columns = EXCLUDED.scope_columns,
  access_model = EXCLUDED.access_model,
  review_status = EXCLUDED.review_status,
  notes = EXCLUDED.notes,
  reviewed_at = now();

ALTER TABLE IF EXISTS public.invoice_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.debug_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_event_log_org_select ON public.invoice_event_log;
CREATE POLICY invoice_event_log_org_select
ON public.invoice_event_log
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_event_log.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS invoice_processing_jobs_org_select ON public.invoice_processing_jobs;
CREATE POLICY invoice_processing_jobs_org_select
ON public.invoice_processing_jobs
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_processing_jobs.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS invoice_sync_log_org_select ON public.invoice_sync_log;
CREATE POLICY invoice_sync_log_org_select
ON public.invoice_sync_log
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_sync_log.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DO $guard$
BEGIN
  IF to_regclass('public.debug_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS debug_logs_platform_admin_select ON public.debug_logs;
    CREATE POLICY debug_logs_platform_admin_select
    ON public.debug_logs
    FOR SELECT
    USING (public.is_platform_admin());
  END IF;
END $guard$;

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_authenticated_insert ON public.audit_logs;
CREATE POLICY audit_logs_same_org_insert
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS tenant_mirror_tables_authenticated_read ON public.tenant_mirror_tables;

CREATE INDEX IF NOT EXISTS idx_archived_brands_organization_id ON public.archived_brands (organization_id);
CREATE INDEX IF NOT EXISTS idx_archived_invitations_organization_id ON public.archived_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_archived_locations_organization_id ON public.archived_locations (organization_id);
CREATE INDEX IF NOT EXISTS idx_archived_profiles_organization_id ON public.archived_profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_commissary_routes_organization_id ON public.commissary_routes (organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_organization_id ON public.custom_reports (organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_channels_organization_id ON public.delivery_channels (organization_id);
CREATE INDEX IF NOT EXISTS idx_developer_api_keys_organization_id ON public.developer_api_keys (organization_id);
CREATE INDEX IF NOT EXISTS idx_franchise_agreements_organization_id ON public.franchise_agreements (organization_id);
CREATE INDEX IF NOT EXISTS idx_iot_sensors_organization_id ON public.iot_sensors (organization_id);
CREATE INDEX IF NOT EXISTS idx_labor_forecasts_organization_id ON public.labor_forecasts (organization_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_organization_id ON public.marketing_campaigns (organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_configurations_organization_id ON public.pos_configurations (organization_id);
CREATE INDEX IF NOT EXISTS idx_procurement_bids_organization_id ON public.procurement_bids (organization_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_organization_id ON public.shift_schedules (organization_id);
CREATE INDEX IF NOT EXISTS idx_temperature_logs_organization_id ON public.temperature_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_schema_retirement_archive_organization_id ON public.tenant_schema_retirement_archive (organization_id);
CREATE INDEX IF NOT EXISTS idx_time_clocks_organization_id ON public.time_clocks (organization_id);
CREATE INDEX IF NOT EXISTS idx_web_vitals_telemetry_organization_id ON public.web_vitals_telemetry (organization_id);

CREATE OR REPLACE FUNCTION public.assert_financial_actor(
  p_organization_id UUID,
  p_allowed_roles TEXT[] DEFAULT ARRAY['location_manager', 'branch_manager', 'org_owner', 'owner', 'admin', 'platform_admin']
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_profile_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id
    INTO v_role, v_profile_org
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role <> 'platform_admin' AND v_profile_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization financial access denied';
  END IF;

  IF NOT v_role = ANY(p_allowed_roles) THEN
    RAISE EXCEPTION 'Insufficient financial permissions';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_invoice_payment(
  p_invoice_id UUID,
  p_payment_account_id UUID,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_account_org UUID;
BEGIN
  SELECT id, organization_id, status, payment_status, ap_status, ap_routing_destination
    INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  SELECT organization_id
    INTO v_account_org
  FROM public.payment_accounts
  WHERE id = p_payment_account_id
    AND is_active IS DISTINCT FROM false;

  IF v_account_org IS NULL OR v_account_org IS DISTINCT FROM v_invoice.organization_id THEN
    RAISE EXCEPTION 'Payment account does not belong to the invoice organization';
  END IF;

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot be scheduled for payment';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before scheduling payment';
  END IF;

  UPDATE public.invoices
     SET payment_account_id = p_payment_account_id,
         scheduled_payment_date = p_date,
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'scheduled', 'scheduled_payment_date', p_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_payment_method TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_remaining NUMERIC;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Paid invoices cannot receive another payment';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before recording payment';
  END IF;

  v_remaining := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0));
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount % exceeds remaining balance %', p_amount, v_remaining;
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  v_new_status := CASE
    WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
     SET paid_amount = v_new_paid_amount,
         payment_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE 'partial' END,
         status = v_new_status,
         ap_status = CASE WHEN v_new_status = 'paid' THEN 'paid' ELSE ap_status END,
         payment_reference = p_reference,
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id,
    vendor_id,
    vendor_name,
    invoice_number,
    amount,
    payment_method,
    status,
    transaction_id,
    payment_date,
    payment_account_id,
    organization_id,
    brand_id,
    location_id,
    created_by
  ) VALUES (
    v_invoice.id,
    v_invoice.vendor_id,
    v_invoice.vendor_name,
    v_invoice.invoice_number,
    p_amount,
    p_payment_method,
    'completed',
    p_reference,
    CURRENT_DATE,
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.log_invoice_audit_event(
    v_invoice.id,
    'payment_recorded',
    'Payment recorded through tenant-safe financial RPC',
    to_jsonb(v_invoice),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'payment_method', p_payment_method,
      'reference', p_reference,
      'status', v_new_status
    )
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_payment_batch(
  p_vendor_id UUID,
  p_payment_account_id UUID,
  p_scheduled_date DATE,
  p_invoice_ids UUID[],
  p_amounts NUMERIC[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scheduled_payment_id UUID;
  v_total NUMERIC := 0;
  v_invoice RECORD;
  v_index INTEGER;
  v_organization_id UUID;
  v_account_org UUID;
BEGIN
  IF array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one invoice is required';
  END IF;

  IF array_length(p_invoice_ids, 1) <> array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must have the same length';
  END IF;

  FOR v_index IN 1 .. array_length(p_invoice_ids, 1) LOOP
    SELECT id, organization_id, vendor_id, status, payment_status, ap_routing_destination
      INTO v_invoice
      FROM public.invoices
     WHERE id = p_invoice_ids[v_index]
     FOR UPDATE;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_ids[v_index];
    END IF;

    IF v_index = 1 THEN
      v_organization_id := v_invoice.organization_id;
      PERFORM public.assert_financial_actor(v_organization_id);

      SELECT organization_id
        INTO v_account_org
      FROM public.payment_accounts
      WHERE id = p_payment_account_id
        AND is_active IS DISTINCT FROM false;

      IF v_account_org IS NULL OR v_account_org IS DISTINCT FROM v_organization_id THEN
        RAISE EXCEPTION 'Payment account does not belong to the invoice organization';
      END IF;
    ELSIF v_invoice.organization_id IS DISTINCT FROM v_organization_id THEN
      RAISE EXCEPTION 'All selected invoices must belong to the same organization';
    END IF;

    IF v_invoice.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'All selected invoices must belong to the selected vendor';
    END IF;

    IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
      RAISE EXCEPTION 'Invoice % is not routed to Payments', v_invoice.id;
    END IF;

    IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'auto_pay') OR v_invoice.status = 'paid' THEN
      RAISE EXCEPTION 'Paid invoice % cannot be scheduled', v_invoice.id;
    END IF;

    IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
      RAISE EXCEPTION 'Invoice % must be approved before scheduling payment', v_invoice.id;
    END IF;

    IF COALESCE(p_amounts[v_index], 0) <= 0 THEN
      RAISE EXCEPTION 'Scheduled amount must be greater than zero';
    END IF;

    v_total := v_total + p_amounts[v_index];
  END LOOP;

  INSERT INTO public.scheduled_payments (
    organization_id,
    vendor_id,
    payment_account_id,
    total_amount,
    scheduled_date,
    status,
    created_by
  ) VALUES (
    v_organization_id,
    p_vendor_id,
    p_payment_account_id,
    v_total,
    p_scheduled_date,
    'scheduled',
    auth.uid()
  ) RETURNING id INTO v_scheduled_payment_id;

  FOR v_index IN 1 .. array_length(p_invoice_ids, 1) LOOP
    INSERT INTO public.scheduled_payment_invoices (
      scheduled_payment_id,
      invoice_id,
      amount_applied
    ) VALUES (
      v_scheduled_payment_id,
      p_invoice_ids[v_index],
      p_amounts[v_index]
    );

    UPDATE public.invoices
       SET scheduled_payment_date = p_scheduled_date,
           payment_account_id = p_payment_account_id,
           status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
           ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
           updated_at = now()
     WHERE id = p_invoice_ids[v_index];
  END LOOP;

  RETURN v_scheduled_payment_id;
END;
$$;

COMMENT ON TABLE public.data_ownership_catalog IS
  'Canonical shared-public ownership catalog used to keep RLS, RBAC, and scale reviews explicit after schema-per-tenant retirement.';

COMMENT ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) IS
  'Shared guard for tenant-safe financial RPCs. Validates authenticated user role and organization scope before money-moving mutations.';

COMMIT;
