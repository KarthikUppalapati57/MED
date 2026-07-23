BEGIN;

-- Inventory module production hardening.
-- This migration is intentionally additive/repairing: it preserves existing
-- tables and replaces vulnerable RPC bodies with caller-scoped versions.

ALTER TABLE public.receivings ADD COLUMN IF NOT EXISTS location_id uuid;

ALTER TABLE public.receiving_items
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric,
  ADD COLUMN IF NOT EXISTS expected_quantity numeric,
  ADD COLUMN IF NOT EXISTS discrepancy_quantity numeric,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_org_location_internal_product
  ON public.inventory (organization_id, location_id, internal_product_id)
  WHERE deleted_at IS NULL AND internal_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receivings_org_order_active
  ON public.receivings (organization_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_items_org_location
  ON public.receiving_items (organization_id, location_id);

CREATE TABLE IF NOT EXISTS public.inventory_pos_usage_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  depletion_count integer NOT NULL DEFAULT 0,
  UNIQUE (organization_id, location_id, usage_date)
);

ALTER TABLE public.inventory_pos_usage_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_pos_usage_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_pos_usage_approvals_select ON public.inventory_pos_usage_approvals;
CREATE POLICY inventory_pos_usage_approvals_select
  ON public.inventory_pos_usage_approvals
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

DROP POLICY IF EXISTS inventory_pos_usage_approvals_insert ON public.inventory_pos_usage_approvals;
CREATE POLICY inventory_pos_usage_approvals_insert
  ON public.inventory_pos_usage_approvals
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE OR REPLACE FUNCTION public.assert_inventory_rpc_access(
  p_organization_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_require_manager boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
  v_location_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role, organization_id, location_id
    INTO v_role, v_org_id, v_location_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile not found';
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Access denied: organization mismatch';
  END IF;

  IF p_require_manager AND v_role NOT IN (
    'manager', 'owner', 'admin', 'branch_manager', 'location_manager',
    'org_manager', 'org_owner', 'tenant_super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: manager role required';
  END IF;

  IF p_location_id IS NOT NULL AND p_location_id IS DISTINCT FROM v_location_id THEN
    RAISE EXCEPTION 'Access denied: active location mismatch';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_org_id, NULL, false);

  SELECT jsonb_build_object(
    'total_inventory_value', COALESCE((
      SELECT SUM(COALESCE(current_quantity, 0) * COALESCE(unit_cost, 0))
      FROM public.inventory
      WHERE organization_id = p_org_id
        AND deleted_at IS NULL
    ), 0),
    'active_vendors', COALESCE((
      SELECT COUNT(*)
      FROM public.vendors
      WHERE organization_id = p_org_id
        AND COALESCE(status, 'active') = 'active'
        AND deleted_at IS NULL
    ), 0),
    'pending_orders', COALESCE((
      SELECT COUNT(*)
      FROM public.auto_orders
      WHERE organization_id = p_org_id
        AND COALESCE(status, 'pending') IN ('pending', 'approved', 'sent', 'ordered', 'partially_received')
    ), 0),
    'recent_alerts', COALESCE((
      SELECT COUNT(*)
      FROM public.notifications
      WHERE organization_id = p_org_id
        AND created_at >= now() - interval '7 days'
        AND COALESCE(is_read, false) = false
    ), 0)
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_inventory_waste(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_inventory_id uuid DEFAULT NULL,
  p_product_id text DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_quantity numeric DEFAULT 0,
  p_unit text DEFAULT NULL,
  p_reason text DEFAULT 'other',
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory;
  v_previous_qty numeric;
  v_new_qty numeric;
  v_unit_cost numeric;
  v_waste_id uuid;
  v_reason text;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_location_id, true);

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required to log inventory waste';
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Waste quantity must be greater than zero';
  END IF;

  v_reason := CASE WHEN p_reason IN ('expired', 'damaged', 'spoiled', 'overproduction', 'customer_return', 'other')
    THEN p_reason ELSE 'other' END;

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
    AND organization_id = p_organization_id
    AND location_id = p_location_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_inventory.id IS NULL THEN
    RAISE EXCEPTION 'Inventory item not found for the active location';
  END IF;

  v_previous_qty := COALESCE(v_inventory.current_quantity, 0);
  v_new_qty := GREATEST(0, v_previous_qty - p_quantity);
  v_unit_cost := COALESCE(v_inventory.unit_cost, 0);

  INSERT INTO public.wastage_logs (
    organization_id, brand_id, location_id, product_id, product_name,
    quantity, unit, value, reason, notes, location, logged_by, created_at
  ) VALUES (
    p_organization_id,
    COALESCE(p_brand_id, v_inventory.brand_id),
    p_location_id,
    COALESCE(p_product_id, v_inventory.product_id),
    COALESCE(NULLIF(p_product_name, ''), v_inventory.product_name),
    p_quantity,
    COALESCE(NULLIF(p_unit, ''), v_inventory.current_unit, 'ea'),
    p_quantity * v_unit_cost,
    v_reason,
    p_notes,
    v_inventory.location,
    COALESCE(p_user_id, auth.uid()),
    now()
  )
  RETURNING id INTO v_waste_id;

  UPDATE public.inventory
     SET current_quantity = v_new_qty,
         current_value = v_new_qty * v_unit_cost,
         previous_quantity = v_previous_qty,
         previous_value = COALESCE(v_inventory.current_value, v_previous_qty * v_unit_cost),
         updated_at = now()
   WHERE id = v_inventory.id;

  INSERT INTO public.inventory_movements (
    organization_id, location_id, inventory_id, movement_type, quantity,
    source_type, source_id, previous_quantity, new_quantity, created_by
  ) VALUES (
    p_organization_id, p_location_id, v_inventory.id,
    CASE WHEN v_reason = 'spoiled' THEN 'spoilage' ELSE 'wastage' END,
    -p_quantity, 'wastage_log', v_waste_id, v_previous_qty, v_new_qty, COALESCE(p_user_id, auth.uid())
  );

  RETURN jsonb_build_object('success', true, 'wastage_log_id', v_waste_id, 'previous_quantity', v_previous_qty, 'new_quantity', v_new_qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_inventory_waste(
  p_organization_id uuid,
  p_wastage_log_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waste public.wastage_logs;
  v_inventory public.inventory;
  v_previous_qty numeric;
  v_new_qty numeric;
  v_unit_cost numeric;
BEGIN
  SELECT * INTO v_waste
  FROM public.wastage_logs
  WHERE id = p_wastage_log_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_waste.id IS NULL THEN
    RAISE EXCEPTION 'Waste log not found';
  END IF;

  PERFORM public.assert_inventory_rpc_access(p_organization_id, v_waste.location_id, true);

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE organization_id = p_organization_id
    AND location_id = v_waste.location_id
    AND (
      product_id = v_waste.product_id
      OR lower(product_name) = lower(v_waste.product_name)
    )
    AND deleted_at IS NULL
  ORDER BY CASE WHEN product_id = v_waste.product_id THEN 0 ELSE 1 END, created_at
  LIMIT 1
  FOR UPDATE;

  IF v_inventory.id IS NOT NULL THEN
    v_previous_qty := COALESCE(v_inventory.current_quantity, 0);
    v_unit_cost := COALESCE(v_inventory.unit_cost, 0);
    v_new_qty := v_previous_qty + COALESCE(v_waste.quantity, 0);

    UPDATE public.inventory
       SET current_quantity = v_new_qty,
           current_value = v_new_qty * v_unit_cost,
           previous_quantity = v_previous_qty,
           previous_value = COALESCE(v_inventory.current_value, v_previous_qty * v_unit_cost),
           updated_at = now()
     WHERE id = v_inventory.id;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_waste.location_id, v_inventory.id, 'manual_adjustment',
      COALESCE(v_waste.quantity, 0), 'wastage_reversal', p_wastage_log_id,
      v_previous_qty, v_new_qty, COALESCE(p_user_id, auth.uid())
    );
  END IF;

  UPDATE public.wastage_logs
     SET deleted_at = now()
   WHERE id = p_wastage_log_id;

  RETURN jsonb_build_object('success', true, 'deleted', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory(
  p_organization_id uuid,
  p_location_id uuid,
  p_inventory_id uuid,
  p_new_quantity numeric,
  p_new_unit text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT 'manual_adjustment',
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory;
  v_previous_qty numeric;
  v_new_cost numeric;
  v_new_value numeric;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_location_id, true);

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required';
  END IF;
  IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or greater';
  END IF;

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
    AND organization_id = p_organization_id
    AND location_id = p_location_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_inventory.id IS NULL THEN
    RAISE EXCEPTION 'Inventory item not found for the active location';
  END IF;

  v_previous_qty := COALESCE(v_inventory.current_quantity, 0);
  v_new_cost := COALESCE(p_unit_cost, v_inventory.unit_cost, 0);
  v_new_value := p_new_quantity * v_new_cost;

  UPDATE public.inventory
     SET current_quantity = p_new_quantity,
         current_unit = COALESCE(NULLIF(p_new_unit, ''), current_unit),
         unit_cost = v_new_cost,
         current_value = v_new_value,
         previous_quantity = v_previous_qty,
         previous_value = COALESCE(v_inventory.current_value, v_previous_qty * v_new_cost),
         last_counted_date = CURRENT_DATE,
         last_counted_by = COALESCE(p_user_id, auth.uid()),
         updated_at = now()
   WHERE id = p_inventory_id;

  INSERT INTO public.inventory_movements (
    organization_id, location_id, inventory_id, movement_type, quantity,
    source_type, source_id, previous_quantity, new_quantity, created_by
  ) VALUES (
    p_organization_id, p_location_id, p_inventory_id, 'manual_adjustment',
    p_new_quantity - v_previous_qty, COALESCE(NULLIF(p_reason, ''), 'manual_adjustment'),
    p_inventory_id, v_previous_qty, p_new_quantity, COALESCE(p_user_id, auth.uid())
  );

  RETURN jsonb_build_object('success', true, 'previous_quantity', v_previous_qty, 'new_quantity', p_new_quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_inventory_count_session(
  p_organization_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_count_sheet_id uuid DEFAULT NULL,
  p_scope_key text DEFAULT 'all',
  p_type text DEFAULT 'Inventory',
  p_count_date date DEFAULT CURRENT_DATE,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.count_sessions;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_total numeric := 0;
  v_item_count integer := 0;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_location_id, false);

  SELECT COALESCE(SUM(COALESCE((item->>'value')::numeric, 0)), 0), COUNT(*)
    INTO v_total, v_item_count
  FROM jsonb_array_elements(v_items) AS item;

  IF p_session_id IS NOT NULL THEN
    UPDATE public.count_sessions
       SET location_id = p_location_id,
           brand_id = p_brand_id,
           count_sheet_id = p_count_sheet_id,
           scope_key = COALESCE(NULLIF(p_scope_key, ''), 'all'),
           type = COALESCE(NULLIF(p_type, ''), 'Inventory'),
           count_date = COALESCE(p_count_date, CURRENT_DATE),
           items = v_items,
           counted_data = v_items,
           total_value = v_total,
           item_count = v_item_count,
           status = 'saved',
           saved_at = COALESCE(saved_at, now()),
           updated_at = now(),
           counted_by = COALESCE(p_user_id, auth.uid(), counted_by),
           created_by = COALESCE(created_by, p_user_id, auth.uid())
     WHERE id = p_session_id
       AND organization_id = p_organization_id
       AND deleted_at IS NULL
       AND status <> 'closed'
     RETURNING * INTO v_row;
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.count_sessions (
      organization_id, location_id, brand_id, count_sheet_id, scope_key, type,
      count_date, items, counted_data, total_value, item_count, status,
      saved_at, updated_at, counted_by, created_by
    ) VALUES (
      p_organization_id, p_location_id, p_brand_id, p_count_sheet_id,
      COALESCE(NULLIF(p_scope_key, ''), 'all'), COALESCE(NULLIF(p_type, ''), 'Inventory'),
      COALESCE(p_count_date, CURRENT_DATE), v_items, v_items, v_total, v_item_count,
      'saved', now(), now(), COALESCE(p_user_id, auth.uid()), COALESCE(p_user_id, auth.uid())
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_inventory_count_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.count_sessions;
BEGIN
  SELECT * INTO v_row
  FROM public.count_sessions
  WHERE id = p_session_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Inventory count session not found';
  END IF;

  PERFORM public.assert_inventory_rpc_access(p_organization_id, v_row.location_id, false);

  UPDATE public.count_sessions
     SET status = 'closed',
         completed_at = COALESCE(completed_at, now()),
         closed_at = COALESCE(closed_at, now()),
         updated_at = now(),
         counted_by = COALESCE(counted_by, p_user_id, auth.uid())
   WHERE id = p_session_id
   RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_inventory_count_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.count_sessions;
BEGIN
  SELECT * INTO v_row
  FROM public.count_sessions
  WHERE id = p_session_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM public.assert_inventory_rpc_access(p_organization_id, v_row.location_id, false);

  UPDATE public.count_sessions
     SET deleted_at = now(), updated_at = now()
   WHERE id = p_session_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_count_session(
  p_organization_id uuid,
  p_location_id uuid,
  p_count_sheet_id uuid,
  p_counts jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sheet record;
  v_item jsonb;
  v_inv_id uuid;
  v_counted_qty numeric;
  v_expected_qty numeric;
  v_variance_qty numeric;
  v_unit_cost numeric;
  v_variance_dollar numeric;
  v_total_variance_value numeric := 0;
  v_counted_data jsonb := '{}'::jsonb;
  v_variance_data jsonb := '{}'::jsonb;
  v_count_session_id uuid;
  v_gl_id uuid;
  v_is_favorable boolean;
  v_current_inventory public.inventory;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_location_id, false);

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required to complete a count session';
  END IF;

  SELECT * INTO v_sheet
  FROM public.count_sheets
  WHERE id = p_count_sheet_id
    AND organization_id = p_organization_id
    AND location_id = p_location_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_sheet.id IS NULL THEN
    RAISE EXCEPTION 'Count sheet not found for active location';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
  LOOP
    v_inv_id := (v_item->>'inventory_id')::uuid;
    v_expected_qty := COALESCE((v_item->>'expected_quantity')::numeric, 0);
    v_counted_qty := CASE
      WHEN p_counts ? v_inv_id::text THEN COALESCE((p_counts->>v_inv_id::text)::numeric, 0)
      ELSE v_expected_qty
    END;

    SELECT * INTO v_current_inventory
    FROM public.inventory
    WHERE id = v_inv_id
      AND organization_id = p_organization_id
      AND location_id = p_location_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_current_inventory.id IS NULL THEN
      CONTINUE;
    END IF;

    v_unit_cost := COALESCE(v_current_inventory.unit_cost, 0);
    v_variance_qty := v_counted_qty - v_expected_qty;
    v_variance_dollar := v_variance_qty * v_unit_cost;

    IF v_variance_dollar <> 0 THEN
      v_total_variance_value := v_total_variance_value + v_variance_dollar;
      v_variance_data := jsonb_set(v_variance_data, ARRAY[v_inv_id::text], jsonb_build_object('qty', v_variance_qty, 'value', v_variance_dollar));
    END IF;

    v_counted_data := jsonb_set(
      v_counted_data,
      ARRAY[v_inv_id::text],
      jsonb_build_object(
        'product_name', v_current_inventory.product_name,
        'expected_quantity', v_expected_qty,
        'counted_quantity', v_counted_qty,
        'unit', COALESCE(v_current_inventory.current_unit, 'ea'),
        'unit_cost', v_unit_cost,
        'variance', v_variance_dollar
      )
    );

    IF v_counted_qty <> v_expected_qty THEN
      UPDATE public.inventory
         SET current_quantity = v_counted_qty,
             current_value = v_counted_qty * v_unit_cost,
             previous_quantity = v_expected_qty,
             previous_value = v_current_inventory.current_value,
             last_counted_date = CURRENT_DATE,
             last_counted_by = COALESCE(p_user_id, auth.uid()),
             updated_at = now()
       WHERE id = v_inv_id;
    END IF;
  END LOOP;

  IF abs(v_total_variance_value) > 0.01 THEN
    v_is_favorable := v_total_variance_value > 0;

    INSERT INTO public.general_ledger_entries (
      organization_id, date, reference, description,
      debit_account, credit_account, amount, created_by
    ) VALUES (
      p_organization_id,
      now(),
      'INV-VAR-' || extract(epoch from now())::text,
      'Inventory Count Variance Adjustment',
      CASE WHEN v_is_favorable THEN 'Inventory Asset (1210)' ELSE 'COGS - Variance (5100)' END,
      CASE WHEN v_is_favorable THEN 'COGS - Variance (5100)' ELSE 'Inventory Asset (1210)' END,
      abs(v_total_variance_value),
      COALESCE(p_user_id, auth.uid())
    )
    RETURNING id INTO v_gl_id;

    INSERT INTO public.accounting_export_queue (organization_id, entity_type, entity_id, status)
    VALUES (p_organization_id, 'journal_entry', v_gl_id, 'ready')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.count_sessions (
    organization_id, location_id, brand_id, count_sheet_id, status, counted_data,
    variance_data, completed_at, counted_by, count_date, items, total_value, item_count
  ) VALUES (
    p_organization_id, p_location_id, v_sheet.brand_id, p_count_sheet_id, 'completed',
    v_counted_data, v_variance_data, now(), COALESCE(p_user_id, auth.uid()),
    CURRENT_DATE, v_sheet.items, abs(v_total_variance_value), jsonb_array_length(v_sheet.items)
  )
  RETURNING id INTO v_count_session_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
  LOOP
    v_inv_id := (v_item->>'inventory_id')::uuid;
    v_expected_qty := COALESCE((v_item->>'expected_quantity')::numeric, 0);
    v_counted_qty := CASE
      WHEN p_counts ? v_inv_id::text THEN COALESCE((p_counts->>v_inv_id::text)::numeric, 0)
      ELSE v_expected_qty
    END;

    IF v_counted_qty <> v_expected_qty THEN
      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_organization_id, p_location_id, v_inv_id, 'count_variance',
        v_counted_qty - v_expected_qty, 'count_session', v_count_session_id,
        v_expected_qty, v_counted_qty, COALESCE(p_user_id, auth.uid())
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count_session_id', v_count_session_id, 'total_variance', v_total_variance_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_organization_id uuid,
  p_location_id uuid,
  p_order_id uuid,
  p_received_quantities jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_expected numeric;
  v_received numeric;
  v_key text;
  v_receiving_items jsonb := '[]'::jsonb;
  v_has_discrepancy boolean := false;
  v_has_short boolean := false;
  v_order_status text;
  v_receiving_status text;
  v_receiving_id uuid;
  v_inventory_id uuid;
  v_unit text;
  v_unit_cost numeric;
  v_previous_quantity numeric;
  v_previous_value numeric;
  v_current_inventory public.inventory;
  v_product_uuid uuid;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_location_id, true);

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required to receive a purchase order';
  END IF;

  SELECT * INTO v_order
  FROM public.auto_orders
  WHERE id = p_order_id
    AND organization_id = p_organization_id
    AND location_id = p_location_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found for active location';
  END IF;

  IF COALESCE(v_order.status, '') IN ('received', 'partially_received') OR EXISTS (
    SELECT 1 FROM public.receivings r
    WHERE r.organization_id = p_organization_id
      AND r.order_id = p_order_id
  ) THEN
    RAISE EXCEPTION 'Purchase order has already been received';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    v_key := COALESCE(v_item->>'product_id', v_item->>'inventory_id', v_item->>'product_name');
    v_expected := COALESCE((v_item->>'approved_quantity')::numeric, (v_item->>'suggested_quantity')::numeric, (v_item->>'quantity')::numeric, 0);
    v_received := CASE WHEN p_received_quantities ? v_key THEN (p_received_quantities->>v_key)::numeric ELSE v_expected END;
    v_has_discrepancy := v_has_discrepancy OR v_received <> v_expected;
    v_has_short := v_has_short OR v_received < v_expected;
    v_receiving_items := v_receiving_items || jsonb_build_object(
      'product_id', v_item->>'product_id',
      'inventory_id', v_item->>'inventory_id',
      'product_name', v_item->>'product_name',
      'unit', COALESCE(v_item->>'unit', 'ea'),
      'unit_price', COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0),
      'expected_quantity', v_expected,
      'received_quantity', v_received,
      'discrepancy', v_expected - v_received,
      'receiving_status', CASE WHEN v_received = v_expected THEN 'matched' WHEN v_received > v_expected THEN 'over' ELSE 'short' END
    );
  END LOOP;

  v_order_status := CASE WHEN v_has_short THEN 'partially_received' ELSE 'received' END;
  v_receiving_status := CASE WHEN v_has_discrepancy THEN 'discrepancy' ELSE 'received' END;

  INSERT INTO public.receivings (
    organization_id, location_id, order_id, vendor_id, status, items, received_by, received_date
  ) VALUES (
    p_organization_id, p_location_id, p_order_id, v_order.vendor_id, v_receiving_status,
    v_receiving_items, COALESCE(p_user_id, auth.uid()), now()
  )
  RETURNING id INTO v_receiving_id;

  UPDATE public.auto_orders
     SET status = v_order_status,
         last_workflow_step = CASE WHEN v_has_discrepancy THEN 'receiving_discrepancy' ELSE 'received' END,
         updated_at = now()
   WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_receiving_items)
  LOOP
    v_received := (v_item->>'received_quantity')::numeric;
    IF v_received <= 0 THEN
      CONTINUE;
    END IF;

    v_unit := COALESCE(v_item->>'unit', 'ea');
    v_unit_cost := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_product_uuid := CASE WHEN COALESCE(v_item->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (v_item->>'product_id')::uuid ELSE NULL END;
    v_current_inventory := NULL;

    IF v_item ? 'inventory_id' AND NULLIF(v_item->>'inventory_id', '') IS NOT NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE id = (v_item->>'inventory_id')::uuid
        AND organization_id = p_organization_id
        AND location_id = p_location_id
        AND deleted_at IS NULL
      FOR UPDATE;
    END IF;

    IF v_current_inventory.id IS NULL AND NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE organization_id = p_organization_id
        AND location_id = p_location_id
        AND deleted_at IS NULL
        AND (
          product_id = v_item->>'product_id'
          OR internal_product_id = v_product_uuid
        )
      ORDER BY CASE WHEN internal_product_id = v_product_uuid THEN 0 ELSE 1 END, created_at
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_current_inventory.id IS NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE lower(product_name) = lower(v_item->>'product_name')
        AND organization_id = p_organization_id
        AND location_id = p_location_id
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_current_inventory.id IS NOT NULL THEN
      v_inventory_id := v_current_inventory.id;
      v_previous_quantity := COALESCE(v_current_inventory.current_quantity, 0);
      v_previous_value := COALESCE(v_current_inventory.current_value, 0);

      UPDATE public.inventory
         SET current_quantity = v_previous_quantity + v_received,
             unit_cost = CASE
               WHEN (v_previous_quantity + v_received) > 0
               THEN ((v_previous_quantity * COALESCE(unit_cost, 0)) + (v_received * COALESCE(NULLIF(v_unit_cost, 0), unit_cost, 0))) / (v_previous_quantity + v_received)
               ELSE COALESCE(NULLIF(v_unit_cost, 0), unit_cost, 0)
             END,
             current_value = (v_previous_quantity + v_received) * CASE
               WHEN (v_previous_quantity + v_received) > 0
               THEN ((v_previous_quantity * COALESCE(unit_cost, 0)) + (v_received * COALESCE(NULLIF(v_unit_cost, 0), unit_cost, 0))) / (v_previous_quantity + v_received)
               ELSE COALESCE(NULLIF(v_unit_cost, 0), unit_cost, 0)
             END,
             previous_quantity = v_previous_quantity,
             previous_value = v_previous_value,
             updated_at = now()
       WHERE id = v_inventory_id;
    ELSE
      v_previous_quantity := 0;
      INSERT INTO public.inventory (
        organization_id, brand_id, location_id, product_id, internal_product_id, product_name,
        current_quantity, current_unit, unit_cost, current_value, accounting_category,
        par_level, reorder_point, previous_quantity, previous_value
      ) VALUES (
        p_organization_id, v_order.brand_id, p_location_id,
        COALESCE(NULLIF(v_item->>'product_id', ''), 'PRD-' || extract(epoch from now())::text),
        v_product_uuid, v_item->>'product_name', v_received, v_unit, v_unit_cost,
        v_received * v_unit_cost, 'food', 0, 0, 0, 0
      )
      RETURNING id INTO v_inventory_id;
    END IF;

    INSERT INTO public.receiving_items (
      receiving_id, organization_id, location_id, product_id, quantity_received,
      expected_quantity, discrepancy_quantity, unit, unit_cost, status
    ) VALUES (
      v_receiving_id, p_organization_id, p_location_id, v_product_uuid, v_received,
      COALESCE((v_item->>'expected_quantity')::numeric, 0),
      COALESCE((v_item->>'discrepancy')::numeric, 0),
      v_unit, v_unit_cost, v_item->>'receiving_status'
    );

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, p_location_id, v_inventory_id, 'purchase_order',
      v_received, 'receiving', v_receiving_id, v_previous_quantity,
      v_previous_quantity + v_received, COALESCE(p_user_id, auth.uid())
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'receiving_id', v_receiving_id, 'has_discrepancy', v_has_discrepancy, 'order_status', v_order_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_daily_pos_usage(
  p_org_id uuid,
  p_date date,
  p_location_id uuid,
  p_user_id uuid,
  p_adjustments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage record;
  v_adj record;
  v_inventory public.inventory;
  v_change_amount numeric;
  v_count integer := 0;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_org_id, p_location_id, true);

  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Location is required to approve POS usage';
  END IF;

  INSERT INTO public.inventory_pos_usage_approvals (
    organization_id, location_id, usage_date, approved_by, adjustments
  ) VALUES (
    p_org_id, p_location_id, p_date, COALESCE(p_user_id, auth.uid()), COALESCE(p_adjustments, '[]'::jsonb)
  )
  ON CONFLICT (organization_id, location_id, usage_date) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'message', 'POS usage has already been approved for this date and location.', 'items_depleted', 0);
  END IF;

  FOR v_usage IN SELECT * FROM public.generate_daily_theoretical_usage(p_org_id, p_date)
  LOOP
    SELECT * INTO v_inventory
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND location_id = p_location_id
      AND deleted_at IS NULL
      AND (internal_product_id = v_usage.ingredient_id OR product_id = v_usage.ingredient_id::text)
    LIMIT 1
    FOR UPDATE;

    IF v_inventory.id IS NULL THEN
      CONTINUE;
    END IF;

    v_change_amount := -1 * COALESCE(v_usage.theoretical_usage, 0);

    UPDATE public.inventory
       SET current_quantity = GREATEST(0, COALESCE(current_quantity, 0) + v_change_amount),
           previous_quantity = current_quantity,
           current_value = GREATEST(0, COALESCE(current_quantity, 0) + v_change_amount) * COALESCE(unit_cost, 0),
           previous_value = current_value,
           updated_at = now()
     WHERE id = v_inventory.id;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_org_id, p_location_id, v_inventory.id, 'sales_depletion', v_change_amount,
      'pos_daily_usage', NULL, COALESCE(v_inventory.current_quantity, 0),
      GREATEST(0, COALESCE(v_inventory.current_quantity, 0) + v_change_amount), COALESCE(p_user_id, auth.uid())
    );

    v_count := v_count + 1;
  END LOOP;

  FOR v_adj IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_adjustments, '[]'::jsonb)) AS x(product_id uuid, quantity numeric, reason text)
  LOOP
    SELECT * INTO v_inventory
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND location_id = p_location_id
      AND deleted_at IS NULL
      AND (internal_product_id = v_adj.product_id OR product_id = v_adj.product_id::text)
    LIMIT 1
    FOR UPDATE;

    IF v_inventory.id IS NOT NULL AND COALESCE(v_adj.quantity, 0) <> 0 THEN
      UPDATE public.inventory
         SET current_quantity = GREATEST(0, COALESCE(current_quantity, 0) + v_adj.quantity),
             previous_quantity = current_quantity,
             current_value = GREATEST(0, COALESCE(current_quantity, 0) + v_adj.quantity) * COALESCE(unit_cost, 0),
             previous_value = current_value,
             updated_at = now()
       WHERE id = v_inventory.id;

      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_org_id, p_location_id, v_inventory.id, COALESCE(NULLIF(v_adj.reason, ''), 'pos_adjustment'),
        v_adj.quantity, 'pos_daily_adjustment', NULL, COALESCE(v_inventory.current_quantity, 0),
        GREATEST(0, COALESCE(v_inventory.current_quantity, 0) + v_adj.quantity), COALESCE(p_user_id, auth.uid())
      );
    END IF;
  END LOOP;

  UPDATE public.inventory_pos_usage_approvals
     SET depletion_count = v_count
   WHERE organization_id = p_org_id
     AND location_id = p_location_id
     AND usage_date = p_date;

  RETURN jsonb_build_object('success', true, 'already_approved', false, 'message', 'Successfully depleted ' || v_count || ' ingredients based on POS sales.', 'items_depleted', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_inventory_depletion(
  p_org_id uuid,
  p_depletion_json jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  v_inv public.inventory;
  v_old_qty numeric;
  v_new_qty numeric;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_org_id, NULL, true);

  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_depletion_json, '[]'::jsonb))
  LOOP
    SELECT * INTO v_inv
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND product_id = (v_elem->>'product_id')::text
      AND deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF v_inv.id IS NOT NULL THEN
      PERFORM public.assert_inventory_rpc_access(p_org_id, v_inv.location_id, true);
      v_old_qty := COALESCE(v_inv.current_quantity, 0);
      v_new_qty := GREATEST(0, v_old_qty - (v_elem->>'total_used')::numeric);
      UPDATE public.inventory
         SET current_quantity = v_new_qty,
             previous_quantity = v_old_qty,
             current_value = v_new_qty * COALESCE(unit_cost, 0),
             previous_value = COALESCE(current_value, v_old_qty * COALESCE(unit_cost, 0)),
             updated_at = now()
       WHERE id = v_inv.id;
      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_org_id, v_inv.location_id, v_inv.id, 'sales_depletion',
        -1 * ((v_elem->>'total_used')::numeric), 'manual_depletion',
        v_old_qty, v_new_qty, auth.uid()
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_inventory_transfer(
  p_organization_id uuid,
  p_transfer_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.transfers;
  v_item jsonb;
  v_qty numeric;
  v_source_inv public.inventory;
  v_dest_inv public.inventory;
  v_dest_inv_id uuid;
  v_unit_cost numeric;
  v_dest_previous_quantity numeric;
BEGIN
  SELECT * INTO v_transfer
  FROM public.transfers
  WHERE id = p_transfer_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  PERFORM public.assert_inventory_rpc_access(p_organization_id, v_transfer.from_location_id, true);

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true, 'message', 'Transfer already completed');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);

    SELECT * INTO v_source_inv
    FROM public.inventory
    WHERE id = (v_item->>'inventory_id')::uuid
      AND organization_id = p_organization_id
      AND location_id = v_transfer.from_location_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_source_inv.id IS NULL THEN
      RAISE EXCEPTION 'Source inventory item not found for transfer';
    END IF;

    UPDATE public.inventory
       SET current_quantity = GREATEST(0, COALESCE(v_source_inv.current_quantity, 0) - v_qty),
           current_value = GREATEST(0, COALESCE(v_source_inv.current_quantity, 0) - v_qty) * COALESCE(unit_cost, v_unit_cost),
           previous_quantity = COALESCE(v_source_inv.current_quantity, 0),
           previous_value = COALESCE(v_source_inv.current_value, 0),
           updated_at = now()
     WHERE id = v_source_inv.id;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_transfer.from_location_id, v_source_inv.id, 'transfer_out',
      -v_qty, 'transfer', p_transfer_id, COALESCE(v_source_inv.current_quantity, 0),
      GREATEST(0, COALESCE(v_source_inv.current_quantity, 0) - v_qty), COALESCE(p_user_id, auth.uid())
    );

    v_dest_inv := NULL;
    IF NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE product_id = v_item->>'product_id'
        AND organization_id = p_organization_id
        AND location_id = v_transfer.to_location_id
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv.id IS NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE lower(product_name) = lower(v_item->>'product_name')
        AND organization_id = p_organization_id
        AND location_id = v_transfer.to_location_id
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv.id IS NOT NULL THEN
      v_dest_inv_id := v_dest_inv.id;
      v_dest_previous_quantity := COALESCE(v_dest_inv.current_quantity, 0);

      UPDATE public.inventory
         SET current_quantity = v_dest_previous_quantity + v_qty,
             current_value = (v_dest_previous_quantity + v_qty) * COALESCE(unit_cost, v_unit_cost),
             previous_quantity = v_dest_previous_quantity,
             previous_value = COALESCE(v_dest_inv.current_value, 0),
             updated_at = now()
       WHERE id = v_dest_inv.id;
    ELSE
      v_dest_previous_quantity := 0;

      INSERT INTO public.inventory (
        organization_id, brand_id, location_id, product_id, product_name, current_quantity,
        current_unit, unit_cost, current_value, accounting_category, par_level,
        reorder_point, previous_quantity, previous_value
      ) VALUES (
        p_organization_id, v_source_inv.brand_id, v_transfer.to_location_id,
        COALESCE(NULLIF(v_item->>'product_id', ''), v_source_inv.product_id, 'PRD-' || extract(epoch from now())::text),
        COALESCE(NULLIF(v_item->>'product_name', ''), v_source_inv.product_name),
        v_qty, COALESCE(v_item->>'unit', v_source_inv.current_unit, 'ea'), COALESCE(NULLIF(v_unit_cost, 0), v_source_inv.unit_cost, 0),
        v_qty * COALESCE(NULLIF(v_unit_cost, 0), v_source_inv.unit_cost, 0), COALESCE(v_source_inv.accounting_category, 'food'),
        0, 0, 0, 0
      )
      RETURNING id INTO v_dest_inv_id;
    END IF;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_transfer.to_location_id, v_dest_inv_id, 'transfer_in',
      v_qty, 'transfer', p_transfer_id, v_dest_previous_quantity,
      v_dest_previous_quantity + v_qty, COALESCE(p_user_id, auth.uid())
    );
  END LOOP;

  UPDATE public.transfers
     SET status = 'completed',
         completed_at = now(),
         completed_by = COALESCE(p_user_id, auth.uid()),
         updated_at = now()
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_internal_transfer(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.assert_inventory_rpc_access(p_organization_id, p_from_location_id, true);

  IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'Both source and destination locations are required';
  END IF;
  IF p_from_location_id = p_to_location_id THEN
    RAISE EXCEPTION 'Source and destination locations must be different';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_to_location_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Destination location is not part of the organization';
  END IF;

  INSERT INTO public.transfers (
    organization_id, from_location_id, to_location_id, status,
    items, created_by, created_at, updated_at
  ) VALUES (
    p_organization_id, p_from_location_id, p_to_location_id, 'pending',
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_user_id, auth.uid()), now(), now()
  )
  RETURNING id INTO v_transfer_id;

  v_result := public.complete_inventory_transfer(p_organization_id, v_transfer_id, COALESCE(p_user_id, auth.uid()));

  RETURN v_result || jsonb_build_object('transfer_id', v_transfer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_intercompany_transfer(
  p_organization_id uuid,
  p_transfer_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.intercompany_transfers;
  v_item jsonb;
  v_qty numeric;
  v_unit_cost numeric;
  v_item_name text;
  v_source_inv public.inventory;
  v_dest_inv public.inventory;
  v_dest_inv_id uuid;
  v_source_previous numeric;
  v_dest_previous numeric;
  v_total_value numeric := 0;
  v_gl_id uuid;
BEGIN
  SELECT * INTO v_transfer
  FROM public.intercompany_transfers
  WHERE id = p_transfer_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Intercompany transfer not found';
  END IF;

  PERFORM public.assert_inventory_rpc_access(p_organization_id, v_transfer.from_location_id, true);

  IF v_transfer.status = 'fulfilled' THEN
    RETURN jsonb_build_object('success', true, 'already_fulfilled', true, 'transfer_id', p_transfer_id);
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending intercompany transfers can be fulfilled';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_transfer.items_json, '[]'::jsonb))
  LOOP
    v_item_name := NULLIF(v_item->>'name', '');
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);

    IF v_item_name IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_source_inv
    FROM public.inventory
    WHERE organization_id = p_organization_id
      AND location_id = v_transfer.from_location_id
      AND deleted_at IS NULL
      AND lower(product_name) = lower(v_item_name)
    LIMIT 1
    FOR UPDATE;

    IF v_source_inv.id IS NULL THEN
      RAISE EXCEPTION 'No commissary inventory item found for "%"', v_item_name;
    END IF;

    v_source_previous := COALESCE(v_source_inv.current_quantity, 0);
    v_unit_cost := COALESCE(NULLIF(v_unit_cost, 0), v_source_inv.unit_cost, 0);
    v_total_value := v_total_value + (v_qty * v_unit_cost);

    UPDATE public.inventory
       SET current_quantity = GREATEST(0, v_source_previous - v_qty),
           current_value = GREATEST(0, v_source_previous - v_qty) * v_unit_cost,
           previous_quantity = v_source_previous,
           previous_value = COALESCE(v_source_inv.current_value, v_source_previous * v_unit_cost),
           updated_at = now()
     WHERE id = v_source_inv.id;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_transfer.from_location_id, v_source_inv.id, 'transfer_out',
      -v_qty, 'intercompany_transfer', p_transfer_id, v_source_previous,
      GREATEST(0, v_source_previous - v_qty), COALESCE(p_user_id, auth.uid())
    );

    SELECT * INTO v_dest_inv
    FROM public.inventory
    WHERE organization_id = p_organization_id
      AND location_id = v_transfer.to_location_id
      AND deleted_at IS NULL
      AND lower(product_name) = lower(v_item_name)
    LIMIT 1
    FOR UPDATE;

    IF v_dest_inv.id IS NOT NULL THEN
      v_dest_inv_id := v_dest_inv.id;
      v_dest_previous := COALESCE(v_dest_inv.current_quantity, 0);
      UPDATE public.inventory
         SET current_quantity = v_dest_previous + v_qty,
             unit_cost = v_unit_cost,
             current_value = (v_dest_previous + v_qty) * v_unit_cost,
             previous_quantity = v_dest_previous,
             previous_value = COALESCE(v_dest_inv.current_value, v_dest_previous * v_unit_cost),
             updated_at = now()
       WHERE id = v_dest_inv.id;
    ELSE
      v_dest_previous := 0;
      INSERT INTO public.inventory (
        organization_id, brand_id, location_id, product_id, product_name,
        category, accounting_category, current_quantity, current_unit,
        unit_cost, current_value, previous_quantity, previous_value
      ) VALUES (
        p_organization_id, v_source_inv.brand_id, v_transfer.to_location_id,
        COALESCE(v_source_inv.product_id, 'PRD-' || extract(epoch from now())::text),
        v_source_inv.product_name, v_source_inv.category, v_source_inv.accounting_category,
        v_qty, COALESCE(v_item->>'unit', v_source_inv.current_unit, 'ea'),
        v_unit_cost, v_qty * v_unit_cost, 0, 0
      )
      RETURNING id INTO v_dest_inv_id;
    END IF;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_transfer.to_location_id, v_dest_inv_id, 'transfer_in',
      v_qty, 'intercompany_transfer', p_transfer_id, v_dest_previous,
      v_dest_previous + v_qty, COALESCE(p_user_id, auth.uid())
    );
  END LOOP;

  UPDATE public.intercompany_transfers
     SET status = 'fulfilled',
         fulfilled_at = now(),
         fulfilled_by = COALESCE(p_user_id, auth.uid()),
         updated_at = now()
   WHERE id = p_transfer_id;

  IF v_total_value > 0 THEN
    INSERT INTO public.general_ledger_entries (
      organization_id, date, reference, description,
      debit_account, credit_account, amount, created_by
    ) VALUES (
      p_organization_id, now(), 'ICT-' || p_transfer_id::text,
      'Intercompany commissary inventory transfer',
      'Destination Inventory Asset (1210)',
      'Commissary Inventory Asset (1210)',
      v_total_value,
      COALESCE(p_user_id, auth.uid())
    )
    RETURNING id INTO v_gl_id;

    INSERT INTO public.accounting_export_queue (organization_id, entity_type, entity_id, status)
    VALUES (p_organization_id, 'journal_entry', v_gl_id, 'ready')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'total_value', v_total_value, 'journal_entry_id', v_gl_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_avt_variance_report(p_start_date date, p_end_date date)
RETURNS TABLE (
  id uuid,
  ingredient text,
  theoretical numeric,
  actual numeric,
  unit text,
  "costPerUnit" numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.product_name AS ingredient,
    COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion') THEN ABS(im.quantity) ELSE 0 END), 0) AS theoretical,
    COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'wastage', 'spoilage', 'stock_count', 'count_variance', 'manual_adjustment') AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0) AS actual,
    i.current_unit AS unit,
    COALESCE(i.unit_cost, 0) AS "costPerUnit",
    CASE
      WHEN COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'wastage', 'spoilage', 'stock_count', 'count_variance', 'manual_adjustment') AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0)
         > COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion') THEN ABS(im.quantity) ELSE 0 END), 0) * 1.10 THEN 'critical'
      WHEN COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'wastage', 'spoilage', 'stock_count', 'count_variance', 'manual_adjustment') AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0)
         > COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion') THEN ABS(im.quantity) ELSE 0 END), 0) * 1.05 THEN 'warning'
      ELSE 'good'
    END AS status
  FROM public.inventory i
  JOIN public.inventory_movements im
    ON im.inventory_id = i.id
   AND im.organization_id = i.organization_id
   AND DATE(im.created_at) BETWEEN p_start_date AND p_end_date
  WHERE i.organization_id = public.get_auth_org()
    AND i.deleted_at IS NULL
  GROUP BY i.id, i.product_name, i.current_unit, i.unit_cost
  HAVING COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion') THEN ABS(im.quantity) ELSE 0 END), 0) > 0;
END;
$$;

-- RLS cleanup: remove known legacy org-wide policies and enforce exact-location helpers.
DROP POLICY IF EXISTS inventory_select_org ON public.inventory;
DROP POLICY IF EXISTS inventory_insert_org ON public.inventory;
DROP POLICY IF EXISTS inventory_update_org ON public.inventory;
DROP POLICY IF EXISTS "Tenant_Isolation_wastage_logs" ON public.wastage_logs;
DROP POLICY IF EXISTS "Tenant_Isolation_auto_orders" ON public.auto_orders;
DROP POLICY IF EXISTS "Count_sessions org read access" ON public.count_sessions;
DROP POLICY IF EXISTS "Count_sessions org write access" ON public.count_sessions;
DROP POLICY IF EXISTS "Count_sheets org read access" ON public.count_sheets;
DROP POLICY IF EXISTS "Count_sheets org write access" ON public.count_sheets;

DROP POLICY IF EXISTS batch3a_count_sheets_select ON public.count_sheets;
DROP POLICY IF EXISTS batch3a_count_sheets_insert ON public.count_sheets;
DROP POLICY IF EXISTS batch3a_count_sheets_update ON public.count_sheets;
CREATE POLICY batch3a_count_sheets_select ON public.count_sheets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));
CREATE POLICY batch3a_count_sheets_insert ON public.count_sheets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));
CREATE POLICY batch3a_count_sheets_update ON public.count_sheets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true));

DROP POLICY IF EXISTS batch3a_count_sessions_select ON public.count_sessions;
DROP POLICY IF EXISTS batch3a_count_sessions_insert ON public.count_sessions;
DROP POLICY IF EXISTS batch3a_count_sessions_update ON public.count_sessions;
CREATE POLICY batch3a_count_sessions_select ON public.count_sessions
  FOR SELECT USING (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_visible(organization_id, count_sheet_id))
    OR (count_sheet_id IS NULL AND public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at))
  );
CREATE POLICY batch3a_count_sessions_insert ON public.count_sessions
  FOR INSERT WITH CHECK (
    (count_sheet_id IS NOT NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true))
  );
CREATE POLICY batch3a_count_sessions_update ON public.count_sessions
  FOR UPDATE USING (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  )
  WITH CHECK (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  );

ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;
CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_visible(po.organization_id, NULL, po.location_id, NULL)
    )
  );
CREATE POLICY "Manager+ can manage purchase order items" ON public.purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_writable(po.organization_id, NULL, po.location_id, NULL, false)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_writable(po.organization_id, NULL, po.location_id, NULL, false)
    )
  );

DROP POLICY IF EXISTS "Users can view receiving items" ON public.receiving_items;
DROP POLICY IF EXISTS "Manager+ can manage receiving items" ON public.receiving_items;
CREATE POLICY "Users can view receiving items" ON public.receiving_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_visible(r.organization_id, NULL, r.location_id, NULL)
    )
  );
CREATE POLICY "Manager+ can manage receiving items" ON public.receiving_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_writable(r.organization_id, NULL, r.location_id, NULL, false)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_writable(r.organization_id, NULL, r.location_id, NULL, false)
    )
  );

CREATE OR REPLACE FUNCTION public.transfer_scope_visible(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_deleted_at IS NULL
    AND (
      public.is_platform_admin()
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          p_from_location_id = (SELECT location_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL)
          OR p_to_location_id = (SELECT location_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL)
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.complete_count_session(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_inventory_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_daily_pos_usage(uuid, date, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.execute_inventory_depletion(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_inventory_waste(uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_inventory_waste(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, uuid, numeric, text, numeric, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fulfill_intercompany_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_inventory_rpc_access(uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_count_session(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_transfer(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_daily_pos_usage(uuid, date, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_inventory_depletion(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_inventory_waste(uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_inventory_waste(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, uuid, numeric, text, numeric, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_intercompany_transfer(uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
