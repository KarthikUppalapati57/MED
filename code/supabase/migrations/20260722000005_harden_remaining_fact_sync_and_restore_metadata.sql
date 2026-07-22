BEGIN;

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

CREATE OR REPLACE FUNCTION public.sync_fact_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_key UUID;
  v_snapshot_date_key INTEGER;
BEGIN
  SELECT id INTO v_product_key FROM public.dim_product WHERE product_code = NEW.product_id LIMIT 1;
  v_snapshot_date_key := public.ensure_dim_date(COALESCE(NEW.last_counted_date, NEW.created_at::date, now()::date));

  INSERT INTO public.fact_inventory (
    source_inventory_id, snapshot_date_key, product_key,
    organization_id, location_id, location_name,
    current_quantity, current_value, unit_cost,
    par_level, reorder_point
  ) VALUES (
    NEW.id,
    v_snapshot_date_key,
    v_product_key,
    NEW.organization_id,
    NEW.location_id,
    NULL,
    NEW.current_quantity,
    NULL,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (source_inventory_id) DO UPDATE SET
    snapshot_date_key = EXCLUDED.snapshot_date_key,
    product_key       = EXCLUDED.product_key,
    current_quantity  = EXCLUDED.current_quantity,
    current_value     = EXCLUDED.current_value,
    unit_cost         = EXCLUDED.unit_cost,
    par_level         = EXCLUDED.par_level,
    reorder_point     = EXCLUDED.reorder_point;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_fact_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_key UUID;
  v_created_key UUID;
  v_approved_key UUID;
  v_order_date_key INTEGER;
  v_delivery_date_key INTEGER;
BEGIN
  SELECT id INTO v_vendor_key FROM public.dim_vendor WHERE source_vendor_id = NEW.vendor_id LIMIT 1;
  SELECT id INTO v_created_key FROM public.dim_user WHERE source_user_id = NEW.created_by LIMIT 1;
  SELECT id INTO v_approved_key FROM public.dim_user WHERE source_user_id = NEW.approved_by LIMIT 1;
  v_order_date_key := public.ensure_dim_date(COALESCE(NEW.created_at::date, now()::date));
  v_delivery_date_key := public.ensure_dim_date(NEW.delivery_date);

  INSERT INTO public.fact_orders (
    source_order_id, order_date_key, delivery_date_key,
    vendor_key, created_by_key, approved_by_key,
    organization_id, order_number, status,
    total_amount, item_count
  ) VALUES (
    NEW.id,
    v_order_date_key,
    v_delivery_date_key,
    v_vendor_key,
    v_created_key,
    v_approved_key,
    NEW.organization_id,
    NEW.order_number,
    NEW.status,
    NEW.total_amount,
    COALESCE(jsonb_array_length(NEW.items), 0)
  )
  ON CONFLICT (source_order_id) DO UPDATE SET
    delivery_date_key = EXCLUDED.delivery_date_key,
    vendor_key        = EXCLUDED.vendor_key,
    approved_by_key   = EXCLUDED.approved_by_key,
    status            = EXCLUDED.status,
    total_amount      = EXCLUDED.total_amount,
    item_count        = EXCLUDED.item_count;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_fact_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_key UUID;
  v_user_key UUID;
  v_payment_date_key INTEGER;
BEGIN
  SELECT id INTO v_vendor_key FROM public.dim_vendor LIMIT 1;
  SELECT id INTO v_user_key FROM public.dim_user LIMIT 1;
  v_payment_date_key := public.ensure_dim_date(COALESCE(NEW.payment_date, NEW.created_at::date, now()::date));

  INSERT INTO public.fact_payments (
    source_payment_id, payment_date_key, due_date_key,
    vendor_key, invoice_id, created_by_key,
    organization_id, amount, payment_method, status
  ) VALUES (
    NEW.id,
    v_payment_date_key,
    v_payment_date_key,
    v_vendor_key,
    NEW.invoice_id,
    v_user_key,
    NEW.organization_id,
    NEW.amount,
    NULL,
    NEW.status
  )
  ON CONFLICT (source_payment_id) DO UPDATE SET
    payment_date_key = EXCLUDED.payment_date_key,
    due_date_key     = EXCLUDED.due_date_key,
    vendor_key       = EXCLUDED.vendor_key,
    amount           = EXCLUDED.amount,
    payment_method   = EXCLUDED.payment_method,
    status           = EXCLUDED.status;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_fact_wastage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_key UUID;
  v_user_key UUID;
  v_wastage_date_key INTEGER;
BEGIN
  SELECT id INTO v_product_key FROM public.dim_product WHERE product_code = NEW.product_id LIMIT 1;
  SELECT id INTO v_user_key FROM public.dim_user WHERE source_user_id = NEW.logged_by LIMIT 1;
  v_wastage_date_key := public.ensure_dim_date(COALESCE(NEW.created_at::date, now()::date));

  INSERT INTO public.fact_wastage (
    source_wastage_id, wastage_date_key, product_key,
    organization_id, location_id, logged_by_key,
    quantity, unit, value, reason
  ) VALUES (
    NEW.id,
    v_wastage_date_key,
    v_product_key,
    NEW.organization_id,
    NEW.location_id,
    v_user_key,
    NEW.quantity,
    NEW.unit,
    NEW.value,
    NEW.reason
  )
  ON CONFLICT (source_wastage_id) DO UPDATE SET
    wastage_date_key = EXCLUDED.wastage_date_key,
    product_key      = EXCLUDED.product_key,
    quantity         = EXCLUDED.quantity,
    value            = EXCLUDED.value,
    reason           = EXCLUDED.reason;
  RETURN NEW;
END;
$$;

COMMIT;
