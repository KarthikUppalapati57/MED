BEGIN;

-- Phase 3: repair live RPC drift found by Supabase DB lint.
-- These fixes keep the shared-public model intact and make critical workflows
-- compile against the current canonical table contracts.

ALTER TABLE public.ledger_payments
  ADD COLUMN IF NOT EXISTS source_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_payments_source_payment
  ON public.ledger_payments(source_payment_id)
  WHERE source_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_invoice_line_items(p_invoice_id UUID, p_items JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_incoming_ids UUID[] := ARRAY[]::UUID[];
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.invoices
  WHERE id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    id UUID,
    inventory_item_id UUID,
    internal_product_id UUID,
    item_name TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    total_price NUMERIC,
    vendor_item_code TEXT,
    vendor_unit TEXT
  ) LOOP
    IF v_item.id IS NULL THEN
      v_item.id := gen_random_uuid();

      INSERT INTO public.invoice_line_items (
        id, invoice_id, organization_id, inventory_item_id, internal_product_id,
        item_name, quantity, unit_price, total_price, vendor_item_code, vendor_unit
      ) VALUES (
        v_item.id, p_invoice_id, v_org_id, v_item.inventory_item_id, v_item.internal_product_id,
        v_item.item_name, v_item.quantity, v_item.unit_price, v_item.total_price,
        v_item.vendor_item_code, v_item.vendor_unit
      );
    ELSE
      UPDATE public.invoice_line_items
         SET inventory_item_id = v_item.inventory_item_id,
             internal_product_id = v_item.internal_product_id,
             item_name = v_item.item_name,
             quantity = v_item.quantity,
             unit_price = v_item.unit_price,
             total_price = v_item.total_price,
             vendor_item_code = v_item.vendor_item_code,
             vendor_unit = v_item.vendor_unit
       WHERE id = v_item.id
         AND invoice_id = p_invoice_id;
    END IF;

    v_incoming_ids := array_append(v_incoming_ids, v_item.id);
  END LOOP;

  DELETE FROM public.invoice_line_items
   WHERE invoice_id = p_invoice_id
     AND id <> ALL(v_incoming_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_products(p_invoice_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product_id UUID;
  v_inventory_id UUID;
  v_vendor_item_id UUID;
  v_previous_price NUMERIC;
  v_price_variance_flag BOOLEAN;
  v_price_variance_percent NUMERIC;
  v_threshold NUMERIC := 10;
  v_updates_count INT := 0;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Invoice not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_sync_log
    WHERE invoice_id = p_invoice_id
      AND operation = 'sync_invoice_products'
  ) THEN
    RETURN jsonb_build_object('status', 'success', 'updates_count', 0, 'idempotent', true);
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.invoice_line_items
    WHERE invoice_id = p_invoice_id
  LOOP
    v_product_id := v_item.internal_product_id;
    v_price_variance_flag := false;
    v_price_variance_percent := 0;

    IF v_product_id IS NULL AND v_item.item_name IS NOT NULL THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE organization_id = v_invoice.organization_id
        AND lower(name) = lower(v_item.item_name)
      LIMIT 1;
    END IF;

    IF v_invoice.vendor_id IS NOT NULL THEN
      SELECT id, last_price, price_variance_threshold_percent
        INTO v_vendor_item_id, v_previous_price, v_threshold
      FROM public.vendor_items
      WHERE organization_id = v_invoice.organization_id
        AND vendor_id = v_invoice.vendor_id
        AND lower(vendor_item_name) = lower(v_item.item_name)
      LIMIT 1;

      v_threshold := COALESCE(v_threshold, 10);

      IF v_vendor_item_id IS NOT NULL THEN
        IF v_previous_price > 0 AND v_item.unit_price > 0 THEN
          v_price_variance_percent := ((v_item.unit_price - v_previous_price) / v_previous_price) * 100;
          v_price_variance_flag := abs(v_price_variance_percent) >= v_threshold;
        END IF;

        UPDATE public.vendor_items
           SET last_price = v_item.unit_price,
               previous_price = v_previous_price,
               last_invoice_id = p_invoice_id,
               last_price_change_percent = v_price_variance_percent,
               price_variance_flag = v_price_variance_flag,
               updated_at = now()
         WHERE id = v_vendor_item_id;
      ELSE
        INSERT INTO public.vendor_items (
          organization_id, vendor_id, vendor_item_name, default_price,
          last_price, last_invoice_id, updated_at
        ) VALUES (
          v_invoice.organization_id, v_invoice.vendor_id, v_item.item_name, v_item.unit_price,
          v_item.unit_price, p_invoice_id, now()
        )
        RETURNING id INTO v_vendor_item_id;
      END IF;

      UPDATE public.invoice_line_items
         SET vendor_item_id = v_vendor_item_id,
             price_variance_flag = v_price_variance_flag,
             price_variance_percent = v_price_variance_percent,
             internal_product_id = v_product_id
       WHERE id = v_item.id;
    END IF;

    IF v_product_id IS NOT NULL THEN
      SELECT id INTO v_inventory_id
      FROM public.inventory
      WHERE organization_id = v_invoice.organization_id
        AND (
          internal_product_id = v_product_id
          OR product_id = v_product_id::TEXT
        )
      LIMIT 1
      FOR UPDATE;

      IF v_inventory_id IS NOT NULL THEN
        UPDATE public.inventory
           SET current_quantity = COALESCE(current_quantity, 0) + COALESCE(v_item.quantity, 0),
               current_value = COALESCE(current_value, 0) + COALESCE(v_item.total_price, 0),
               updated_at = now()
         WHERE id = v_inventory_id;
      ELSE
        INSERT INTO public.inventory (
          organization_id, internal_product_id, product_id, product_name,
          current_quantity, current_value, updated_at
        ) VALUES (
          v_invoice.organization_id, v_product_id, v_product_id::TEXT, v_item.item_name,
          COALESCE(v_item.quantity, 0), COALESCE(v_item.total_price, 0), now()
        );
      END IF;

      v_updates_count := v_updates_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.invoice_event_log (invoice_id, event_type, new_value, actor_id)
  VALUES (
    p_invoice_id,
    'inventory_synced',
    jsonb_build_object('updates_count', v_updates_count),
    p_user_id
  );

  INSERT INTO public.invoice_sync_log (invoice_id, operation, hash)
  VALUES (p_invoice_id, 'sync_invoice_products', md5(p_invoice_id::TEXT || now()::TEXT));

  RETURN jsonb_build_object('status', 'success', 'updates_count', v_updates_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_count_session(
  p_organization_id UUID,
  p_location_id UUID,
  p_count_sheet_id UUID,
  p_counts JSONB,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sheet RECORD;
  v_item JSONB;
  v_inv_id UUID;
  v_counted_qty NUMERIC;
  v_expected_qty NUMERIC;
  v_variance_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_variance_dollar NUMERIC;
  v_total_variance_value NUMERIC := 0;
  v_counted_data JSONB := '{}'::jsonb;
  v_variance_data JSONB := '{}'::jsonb;
  v_count_session_id UUID;
  v_is_favorable BOOLEAN;
  v_current_inventory RECORD;
BEGIN
  SELECT * INTO v_sheet
  FROM public.count_sheets
  WHERE id = p_count_sheet_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_sheet IS NULL THEN
    RAISE EXCEPTION 'Count sheet not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
  LOOP
    v_inv_id := (v_item->>'inventory_id')::UUID;
    v_expected_qty := COALESCE((v_item->>'expected_quantity')::NUMERIC, 0);
    v_counted_qty := CASE
      WHEN p_counts ? v_inv_id::TEXT THEN COALESCE((p_counts->>v_inv_id::TEXT)::NUMERIC, 0)
      ELSE v_expected_qty
    END;

    SELECT * INTO v_current_inventory
    FROM public.inventory
    WHERE id = v_inv_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    v_unit_cost := COALESCE(v_current_inventory.unit_cost, 0);
    v_variance_qty := v_counted_qty - v_expected_qty;
    v_variance_dollar := v_variance_qty * v_unit_cost;

    IF v_variance_dollar <> 0 THEN
      v_total_variance_value := v_total_variance_value + v_variance_dollar;
      v_variance_data := jsonb_set(
        v_variance_data,
        ARRAY[v_inv_id::TEXT],
        jsonb_build_object('qty', v_variance_qty, 'value', v_variance_dollar)
      );
    END IF;

    v_counted_data := jsonb_set(
      v_counted_data,
      ARRAY[COALESCE(v_inv_id::TEXT, (v_item->>'product_name'))],
      jsonb_build_object(
        'product_name', v_item->>'product_name',
        'expected_quantity', v_expected_qty,
        'counted_quantity', v_counted_qty,
        'unit', COALESCE(v_item->>'unit', 'ea'),
        'unit_cost', v_unit_cost,
        'variance', v_variance_dollar
      )
    );

    IF v_counted_qty <> v_expected_qty AND v_current_inventory IS NOT NULL THEN
      UPDATE public.inventory
         SET current_quantity = v_counted_qty,
             current_value = v_counted_qty * v_unit_cost,
             previous_quantity = v_expected_qty,
             previous_value = v_current_inventory.current_value,
             last_counted_date = CURRENT_DATE,
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
      'INV-VAR-' || extract(epoch from now())::TEXT,
      'Inventory Count Variance Adjustment',
      CASE WHEN v_is_favorable THEN 'Inventory Asset (1210)' ELSE 'COGS - Variance (5100)' END,
      CASE WHEN v_is_favorable THEN 'COGS - Variance (5100)' ELSE 'Inventory Asset (1210)' END,
      abs(v_total_variance_value),
      p_user_id
    );
  END IF;

  INSERT INTO public.count_sessions (
    organization_id, count_sheet_id, status, counted_data,
    variance_data, completed_at, counted_by
  ) VALUES (
    p_organization_id, p_count_sheet_id, 'completed', v_counted_data,
    v_variance_data, now(), p_user_id
  )
  RETURNING id INTO v_count_session_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
  LOOP
    v_inv_id := (v_item->>'inventory_id')::UUID;
    v_expected_qty := COALESCE((v_item->>'expected_quantity')::NUMERIC, 0);
    v_counted_qty := CASE
      WHEN p_counts ? v_inv_id::TEXT THEN COALESCE((p_counts->>v_inv_id::TEXT)::NUMERIC, 0)
      ELSE v_expected_qty
    END;

    IF v_counted_qty <> v_expected_qty THEN
      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_organization_id, p_location_id, v_inv_id, 'count_variance',
        v_counted_qty - v_expected_qty, 'count_session', v_count_session_id,
        v_expected_qty, v_counted_qty, p_user_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count_session_id', v_count_session_id,
    'total_variance', v_total_variance_value
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_organization_id UUID,
  p_location_id UUID,
  p_order_id UUID,
  p_received_quantities JSONB,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_expected NUMERIC;
  v_received NUMERIC;
  v_key TEXT;
  v_receiving_items JSONB := '[]'::jsonb;
  v_has_discrepancy BOOLEAN := false;
  v_has_short BOOLEAN := false;
  v_order_status TEXT;
  v_receiving_status TEXT;
  v_receiving_id UUID;
  v_inventory_id UUID;
  v_unit TEXT;
  v_unit_cost NUMERIC;
  v_previous_quantity NUMERIC;
  v_previous_value NUMERIC;
  v_current_inventory RECORD;
BEGIN
  SELECT * INTO v_order
  FROM public.auto_orders
  WHERE id = p_order_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    v_key := COALESCE(v_item->>'product_id', v_item->>'inventory_id', v_item->>'product_name');
    v_expected := COALESCE((v_item->>'approved_quantity')::NUMERIC, (v_item->>'suggested_quantity')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
    v_received := CASE
      WHEN p_received_quantities ? v_key THEN (p_received_quantities->>v_key)::NUMERIC
      ELSE v_expected
    END;

    v_has_discrepancy := v_has_discrepancy OR v_received <> v_expected;
    v_has_short := v_has_short OR v_received < v_expected;

    v_receiving_items := v_receiving_items || jsonb_build_object(
      'product_id', v_item->>'product_id',
      'inventory_id', v_item->>'inventory_id',
      'product_name', v_item->>'product_name',
      'unit', COALESCE(v_item->>'unit', 'ea'),
      'unit_price', COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'price')::NUMERIC, 0),
      'expected_quantity', v_expected,
      'received_quantity', v_received,
      'discrepancy', v_expected - v_received,
      'receiving_status', CASE WHEN v_received = v_expected THEN 'matched' WHEN v_received > v_expected THEN 'over' ELSE 'short' END
    );
  END LOOP;

  v_order_status := CASE WHEN v_has_short THEN 'partially_received' ELSE 'received' END;
  v_receiving_status := CASE WHEN v_has_discrepancy THEN 'discrepancy' ELSE 'received' END;

  INSERT INTO public.receivings (
    organization_id, order_id, vendor_id, status, items, received_by, received_at
  ) VALUES (
    p_organization_id, p_order_id, v_order.vendor_id, v_receiving_status,
    v_receiving_items, p_user_id, now()
  )
  RETURNING id INTO v_receiving_id;

  UPDATE public.auto_orders
     SET status = v_order_status,
         last_workflow_step = CASE WHEN v_has_discrepancy THEN 'receiving_discrepancy' ELSE 'received' END
   WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_receiving_items)
  LOOP
    v_received := (v_item->>'received_quantity')::NUMERIC;
    IF v_received <= 0 THEN
      CONTINUE;
    END IF;

    v_unit := COALESCE(v_item->>'unit', 'ea');
    v_unit_cost := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_current_inventory := NULL;

    IF v_item ? 'inventory_id' AND NULLIF(v_item->>'inventory_id', '') IS NOT NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE id = (v_item->>'inventory_id')::UUID
        AND organization_id = p_organization_id
      FOR UPDATE;
    END IF;

    IF v_current_inventory IS NULL AND NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE product_id = v_item->>'product_id'
        AND organization_id = p_organization_id
        AND (location_id = p_location_id OR p_location_id IS NULL)
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_current_inventory IS NULL THEN
      SELECT * INTO v_current_inventory
      FROM public.inventory
      WHERE lower(product_name) = lower(v_item->>'product_name')
        AND organization_id = p_organization_id
        AND (location_id = p_location_id OR p_location_id IS NULL)
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_current_inventory IS NOT NULL THEN
      v_inventory_id := v_current_inventory.id;
      v_previous_quantity := COALESCE(v_current_inventory.current_quantity, 0);
      v_previous_value := COALESCE(v_current_inventory.current_value, 0);

      UPDATE public.inventory
         SET current_quantity = v_previous_quantity + v_received,
             current_value = (v_previous_quantity + v_received) * COALESCE(NULLIF(v_unit_cost, 0), unit_cost, 0),
             previous_quantity = v_previous_quantity,
             previous_value = v_previous_value,
             last_counted_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_inventory_id;
    ELSE
      v_previous_quantity := 0;
      v_previous_value := 0;

      INSERT INTO public.inventory (
        organization_id, location_id, product_id, product_name, current_quantity,
        current_unit, unit_cost, current_value, accounting_category, par_level,
        reorder_point, previous_quantity, previous_value
      ) VALUES (
        p_organization_id, p_location_id,
        COALESCE(NULLIF(v_item->>'product_id', ''), 'PRD-' || extract(epoch from now())::TEXT),
        v_item->>'product_name', v_received, v_unit, v_unit_cost, v_received * v_unit_cost,
        'food', 0, 0, 0, 0
      )
      RETURNING id INTO v_inventory_id;
    END IF;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, p_location_id, v_inventory_id, 'purchase_order',
      v_received, 'receiving', v_receiving_id, v_previous_quantity,
      v_previous_quantity + v_received, p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'receiving_id', v_receiving_id,
    'has_discrepancy', v_has_discrepancy,
    'order_status', v_order_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_inventory_transfer(
  p_organization_id UUID,
  p_transfer_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_qty NUMERIC;
  v_source_inv RECORD;
  v_dest_inv RECORD;
  v_dest_inv_id UUID;
  v_unit_cost NUMERIC;
  v_dest_previous_quantity NUMERIC;
BEGIN
  SELECT * INTO v_transfer
  FROM public.transfers
  WHERE id = p_transfer_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF v_transfer IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Transfer already completed');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    SELECT * INTO v_source_inv
    FROM public.inventory
    WHERE id = (v_item->>'inventory_id')::UUID
    FOR UPDATE;

    IF v_source_inv IS NOT NULL THEN
      UPDATE public.inventory
         SET current_quantity = GREATEST(0, v_source_inv.current_quantity - v_qty),
             current_value = GREATEST(0, v_source_inv.current_quantity - v_qty) * COALESCE(unit_cost, v_unit_cost),
             previous_quantity = v_source_inv.current_quantity,
             previous_value = v_source_inv.current_value,
             updated_at = now()
       WHERE id = v_source_inv.id;

      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_organization_id, COALESCE(v_transfer.from_location_id, v_source_inv.location_id),
        v_source_inv.id, 'transfer_out', -v_qty, 'transfer', p_transfer_id,
        v_source_inv.current_quantity, GREATEST(0, v_source_inv.current_quantity - v_qty), p_user_id
      );
    END IF;

    v_dest_inv := NULL;
    IF NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE product_id = v_item->>'product_id'
        AND organization_id = p_organization_id
        AND location_id = v_transfer.to_location_id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv IS NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE lower(product_name) = lower(v_item->>'product_name')
        AND organization_id = p_organization_id
        AND location_id = v_transfer.to_location_id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv IS NOT NULL THEN
      v_dest_inv_id := v_dest_inv.id;
      v_dest_previous_quantity := COALESCE(v_dest_inv.current_quantity, 0);

      UPDATE public.inventory
         SET current_quantity = v_dest_previous_quantity + v_qty,
             current_value = (v_dest_previous_quantity + v_qty) * COALESCE(unit_cost, v_unit_cost),
             previous_quantity = v_dest_previous_quantity,
             previous_value = v_dest_inv.current_value,
             updated_at = now()
       WHERE id = v_dest_inv.id;
    ELSE
      v_dest_previous_quantity := 0;

      INSERT INTO public.inventory (
        organization_id, location_id, product_id, product_name, current_quantity,
        current_unit, unit_cost, current_value, accounting_category, par_level,
        reorder_point, previous_quantity, previous_value
      ) VALUES (
        p_organization_id, v_transfer.to_location_id,
        COALESCE(NULLIF(v_item->>'product_id', ''), 'PRD-' || extract(epoch from now())::TEXT),
        v_item->>'product_name', v_qty, COALESCE(v_item->>'unit', 'ea'), v_unit_cost,
        v_qty * v_unit_cost, 'food', 0, 0, 0, 0
      )
      RETURNING id INTO v_dest_inv_id;
    END IF;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_organization_id, v_transfer.to_location_id, v_dest_inv_id, 'transfer_in',
      v_qty, 'transfer', p_transfer_id, v_dest_previous_quantity,
      v_dest_previous_quantity + v_qty, p_user_id
    );
  END LOOP;

  UPDATE public.transfers
     SET status = 'completed',
         completed_at = now(),
         completed_by = p_user_id
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_internal_transfer(
  p_organization_id UUID,
  p_from_location_id UUID,
  p_to_location_id UUID,
  p_items JSONB,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer_id UUID;
  v_item JSONB;
  v_qty NUMERIC;
  v_source_inv RECORD;
  v_dest_inv RECORD;
  v_unit_cost NUMERIC;
BEGIN
  INSERT INTO public.transfers (
    organization_id, from_location_id, to_location_id, status,
    items, created_by, completed_at, completed_by
  ) VALUES (
    p_organization_id, p_from_location_id, p_to_location_id, 'completed',
    p_items, p_user_id, now(), p_user_id
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    SELECT * INTO v_source_inv
    FROM public.inventory
    WHERE id = (v_item->>'inventory_id')::UUID
    FOR UPDATE;

    IF v_source_inv IS NOT NULL THEN
      UPDATE public.inventory
         SET current_quantity = GREATEST(0, v_source_inv.current_quantity - v_qty),
             current_value = GREATEST(0, v_source_inv.current_quantity - v_qty) * COALESCE(unit_cost, v_unit_cost),
             previous_quantity = v_source_inv.current_quantity,
             previous_value = v_source_inv.current_value,
             updated_at = now()
       WHERE id = v_source_inv.id;

      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_organization_id, COALESCE(p_from_location_id, v_source_inv.location_id),
        v_source_inv.id, 'transfer_out', -v_qty, 'transfer', v_transfer_id,
        v_source_inv.current_quantity, GREATEST(0, v_source_inv.current_quantity - v_qty), p_user_id
      );
    END IF;

    v_dest_inv := NULL;
    IF NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE product_id = v_item->>'product_id'
        AND organization_id = p_organization_id
        AND location_id = p_to_location_id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv IS NULL THEN
      SELECT * INTO v_dest_inv
      FROM public.inventory
      WHERE lower(product_name) = lower(v_item->>'product_name')
        AND organization_id = p_organization_id
        AND location_id = p_to_location_id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_dest_inv IS NOT NULL THEN
      UPDATE public.inventory
         SET current_quantity = v_dest_inv.current_quantity + v_qty,
             current_value = (v_dest_inv.current_quantity + v_qty) * COALESCE(unit_cost, v_unit_cost),
             previous_quantity = v_dest_inv.current_quantity,
             previous_value = v_dest_inv.current_value,
             updated_at = now()
       WHERE id = v_dest_inv.id;

      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_organization_id, p_to_location_id, v_dest_inv.id, 'transfer_in',
        v_qty, 'transfer', v_transfer_id, v_dest_inv.current_quantity,
        v_dest_inv.current_quantity + v_qty, p_user_id
      );
    ELSE
      WITH new_inv AS (
        INSERT INTO public.inventory (
          organization_id, location_id, product_id, product_name, current_quantity,
          current_unit, unit_cost, current_value, accounting_category, par_level,
          reorder_point, previous_quantity, previous_value
        ) VALUES (
          p_organization_id, p_to_location_id,
          COALESCE(NULLIF(v_item->>'product_id', ''), 'PRD-' || extract(epoch from now())::TEXT),
          v_item->>'product_name', v_qty, COALESCE(v_item->>'unit', 'ea'), v_unit_cost,
          v_qty * v_unit_cost, 'food', 0, 0, 0, 0
        )
        RETURNING id, current_quantity
      )
      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      )
      SELECT p_organization_id, p_to_location_id, id, 'transfer_in',
             v_qty, 'transfer', v_transfer_id, 0, current_quantity, p_user_id
      FROM new_inv;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_ledger(
  p_organization_id UUID,
  p_bill_id UUID,
  p_source_payment_id UUID,
  p_payment_method TEXT,
  p_amount NUMERIC,
  p_payment_date TIMESTAMP WITH TIME ZONE,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ledger_payment_id UUID;
BEGIN
  SELECT id INTO v_ledger_payment_id
  FROM public.ledger_payments
  WHERE source_payment_id = p_source_payment_id;

  IF v_ledger_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'ledger_payment_id', v_ledger_payment_id,
      'message', 'Payment already recorded.'
    );
  END IF;

  INSERT INTO public.ledger_payments (
    organization_id, bill_id, source_payment_id, payment_method,
    amount, payment_date, status, created_by
  ) VALUES (
    p_organization_id, p_bill_id, p_source_payment_id, p_payment_method,
    p_amount, p_payment_date, 'completed', p_user_id
  )
  RETURNING id INTO v_ledger_payment_id;

  INSERT INTO public.ledger_entries (
    organization_id, account_code, debit, credit, reference_type, reference_id
  ) VALUES
    (p_organization_id, '2000', p_amount, 0, 'payment', p_source_payment_id),
    (p_organization_id, '1000', 0, p_amount, 'payment', p_source_payment_id);

  RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_ledger_payment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_daily_theoretical_usage(
  p_org_id UUID,
  p_date DATE
)
RETURNS TABLE (
  ingredient_id UUID,
  ingredient_name TEXT,
  unit TEXT,
  theoretical_usage NUMERIC,
  cost_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH daily_sales AS (
    SELECT psd.pos_item_id, SUM(psd.quantity_sold) AS total_sold
    FROM public.pos_sales_data psd
    WHERE psd.organization_id = p_org_id
      AND psd.date = p_date
    GROUP BY psd.pos_item_id
  ),
  mapped_recipes AS (
    SELECT ds.pos_item_id, ds.total_sold, pmm.recipe_id
    FROM daily_sales ds
    JOIN public.pos_menu_mapping pmm
      ON pmm.pos_item_id = ds.pos_item_id
     AND pmm.organization_id = p_org_id
  ),
  recipe_ingredients_exploded AS (
    SELECT
      ri.product_id AS ingredient_id,
      (ri.quantity * mr.total_sold) AS ingredient_usage,
      p.name AS ingredient_name,
      COALESCE(ri.unit, p.base_unit, 'ea') AS unit,
      COALESCE(p.latest_price, p.average_price, 0) AS cost_per_unit
    FROM mapped_recipes mr
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mr.recipe_id
    JOIN public.products p ON p.id = ri.product_id
  )
  SELECT
    rie.ingredient_id,
    rie.ingredient_name,
    rie.unit,
    SUM(rie.ingredient_usage) AS theoretical_usage,
    SUM(rie.ingredient_usage * rie.cost_per_unit) AS cost_value
  FROM recipe_ingredients_exploded rie
  GROUP BY rie.ingredient_id, rie.ingredient_name, rie.unit
  ORDER BY theoretical_usage DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_daily_pos_usage(
  p_org_id UUID,
  p_date DATE,
  p_location_id UUID,
  p_user_id UUID,
  p_adjustments JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usage RECORD;
  v_adj RECORD;
  v_inventory RECORD;
  v_change_amount NUMERIC;
  v_count INT := 0;
BEGIN
  FOR v_usage IN SELECT * FROM public.generate_daily_theoretical_usage(p_org_id, p_date)
  LOOP
    SELECT * INTO v_inventory
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND location_id = p_location_id
      AND (
        internal_product_id = v_usage.ingredient_id
        OR product_id = v_usage.ingredient_id::TEXT
      )
    LIMIT 1
    FOR UPDATE;

    IF v_inventory IS NULL THEN
      CONTINUE;
    END IF;

    v_change_amount := -1 * COALESCE(v_usage.theoretical_usage, 0);

    UPDATE public.inventory
       SET current_quantity = COALESCE(current_quantity, 0) + v_change_amount,
           previous_quantity = current_quantity,
           current_value = (COALESCE(current_quantity, 0) + v_change_amount) * COALESCE(unit_cost, 0),
           previous_value = current_value,
           updated_at = now()
     WHERE id = v_inventory.id;

    INSERT INTO public.inventory_movements (
      organization_id, location_id, inventory_id, movement_type, quantity,
      source_type, source_id, previous_quantity, new_quantity, created_by
    ) VALUES (
      p_org_id, p_location_id, v_inventory.id, 'sales_depletion', v_change_amount,
      'pos_daily_usage', NULL, COALESCE(v_inventory.current_quantity, 0),
      COALESCE(v_inventory.current_quantity, 0) + v_change_amount, p_user_id
    );

    v_count := v_count + 1;
  END LOOP;

  FOR v_adj IN
    SELECT *
    FROM jsonb_to_recordset(p_adjustments) AS x(product_id UUID, quantity NUMERIC, reason TEXT)
  LOOP
    SELECT * INTO v_inventory
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND location_id = p_location_id
      AND (
        internal_product_id = v_adj.product_id
        OR product_id = v_adj.product_id::TEXT
      )
    LIMIT 1
    FOR UPDATE;

    IF v_inventory IS NOT NULL AND COALESCE(v_adj.quantity, 0) <> 0 THEN
      UPDATE public.inventory
         SET current_quantity = COALESCE(current_quantity, 0) + v_adj.quantity,
             previous_quantity = current_quantity,
             current_value = (COALESCE(current_quantity, 0) + v_adj.quantity) * COALESCE(unit_cost, 0),
             previous_value = current_value,
             updated_at = now()
       WHERE id = v_inventory.id;

      INSERT INTO public.inventory_movements (
        organization_id, location_id, inventory_id, movement_type, quantity,
        source_type, source_id, previous_quantity, new_quantity, created_by
      ) VALUES (
        p_org_id, p_location_id, v_inventory.id, COALESCE(v_adj.reason, 'pos_adjustment'),
        v_adj.quantity, 'pos_daily_adjustment', NULL, COALESCE(v_inventory.current_quantity, 0),
        COALESCE(v_inventory.current_quantity, 0) + v_adj.quantity, p_user_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully depleted ' || v_count || ' ingredients based on POS sales.',
    'items_depleted', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_performance_dashboard_metrics(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_brand_id UUID DEFAULT NULL,
  p_location_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_total_labor NUMERIC := 0;
  v_today_sales NUMERIC := 0;
  v_today_cogs NUMERIC := 0;
  v_today_labor NUMERIC := 0;
  v_trend_data JSONB := '[]'::jsonb;
  v_movers_data JSONB := '[]'::jsonb;
  v_category_data JSONB := '[]'::jsonb;
  v_pending_invoices_count INT := 0;
BEGIN
  SELECT
    COALESCE(SUM(total_revenue), 0),
    COALESCE(SUM(CASE WHEN date = CURRENT_DATE THEN total_revenue ELSE 0 END), 0)
  INTO v_total_sales, v_today_sales
  FROM public.mv_daily_sales_summary
  WHERE organization_id = p_organization_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', s.date,
      'name', to_char(s.date, 'Dy'),
      'actual', s.total_revenue,
      'forecast', s.total_revenue * 1.05
    )
  ), '[]'::jsonb)
  INTO v_trend_data
  FROM (
    SELECT date, total_revenue
    FROM public.mv_daily_sales_summary
    WHERE organization_id = p_organization_id
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND date >= p_start_date
      AND date <= p_end_date
    ORDER BY date ASC
  ) s;

  SELECT
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(CASE WHEN invoice_date = CURRENT_DATE THEN total_amount ELSE 0 END), 0),
    COUNT(CASE WHEN status IN ('pending_review', 'validated', 'flagged') THEN 1 END)
  INTO v_total_cogs, v_today_cogs, v_pending_invoices_count
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND invoice_date >= p_start_date
    AND invoice_date <= p_end_date;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', COALESCE(category_name, 'Uncategorized'), 'spend', amount)
  ), '[]'::jsonb)
  INTO v_category_data
  FROM (
    SELECT category_name, SUM(amount) AS amount
    FROM public.invoice_allocations
    WHERE organization_id = p_organization_id
      AND created_at::DATE >= p_start_date
      AND created_at::DATE <= p_end_date
    GROUP BY category_name
    ORDER BY amount DESC
    LIMIT 8
  ) c;

  SELECT COALESCE(SUM(labor_cost), 0)
  INTO v_total_labor
  FROM public.labor_schedules
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND shift_date >= p_start_date
    AND shift_date <= p_end_date;

  SELECT COALESCE(SUM(labor_cost), 0)
  INTO v_today_labor
  FROM public.labor_schedules
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND shift_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'sales', jsonb_build_object('total', v_total_sales, 'today', v_today_sales),
    'cogs', jsonb_build_object('total', v_total_cogs, 'today', v_today_cogs),
    'labor', jsonb_build_object('total', v_total_labor, 'today', v_today_labor),
    'trend', v_trend_data,
    'categories', v_category_data,
    'movers', v_movers_data,
    'pending_invoices_count', v_pending_invoices_count
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
  v_position INTEGER := 1;
BEGIN
  IF array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one invoice is required';
  END IF;

  IF array_length(p_invoice_ids, 1) <> array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must have the same length';
  END IF;

  WHILE v_position <= array_length(p_invoice_ids, 1) LOOP
    SELECT id, vendor_id, status, payment_status, ap_routing_destination
      INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_ids[v_position]
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_ids[v_position];
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

    IF COALESCE(p_amounts[v_position], 0) <= 0 THEN
      RAISE EXCEPTION 'Scheduled amount must be greater than zero';
    END IF;

    v_total := v_total + p_amounts[v_position];
    v_position := v_position + 1;
  END LOOP;

  INSERT INTO public.scheduled_payments (
    organization_id, vendor_id, payment_account_id, total_amount,
    scheduled_date, status, created_by
  ) VALUES (
    public.get_my_org(), p_vendor_id, p_payment_account_id, v_total,
    p_scheduled_date, 'scheduled', auth.uid()
  )
  RETURNING id INTO v_scheduled_payment_id;

  v_position := 1;
  WHILE v_position <= array_length(p_invoice_ids, 1) LOOP
    INSERT INTO public.scheduled_payment_invoices (
      scheduled_payment_id, invoice_id, amount_applied
    ) VALUES (
      v_scheduled_payment_id, p_invoice_ids[v_position], p_amounts[v_position]
    );

    UPDATE public.invoices
       SET scheduled_payment_date = p_scheduled_date,
           status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
           ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
           updated_at = now()
     WHERE id = p_invoice_ids[v_position];

    v_position := v_position + 1;
  END LOOP;

  RETURN v_scheduled_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_invoice_funds(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_payment_id UUID;
  v_payment_method TEXT;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'processing', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice is already paid or processing';
  END IF;

  IF COALESCE(v_invoice.payment_method, 'ach') = 'check' THEN
    v_payment_method := 'check';
  ELSE
    v_payment_method := 'ach';
  END IF;

  UPDATE public.invoices
     SET payment_status = 'processing',
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id, vendor_id, vendor_name, invoice_number, amount, payment_method,
    status, payout_status, payment_date, payment_account_id, organization_id,
    brand_id, location_id, created_by
  ) VALUES (
    v_invoice.id, v_invoice.vendor_id, v_invoice.vendor_name, v_invoice.invoice_number,
    COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0),
    v_payment_method, 'pending', 'processing', CURRENT_DATE, v_invoice.payment_account_id,
    v_invoice.organization_id, v_invoice.brand_id, v_invoice.location_id, auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', 'processing',
    'payment_id', v_payment_id,
    'payment_method', v_payment_method
  );
END;
$$;

COMMIT;
