BEGIN;

-- Follow-up fixes from live DB lint after Phase 4 migration apply.

DROP FUNCTION IF EXISTS public.release_invoice_funds(UUID);

CREATE OR REPLACE FUNCTION public.release_invoice_funds(
  p_invoice_id UUID,
  p_payout_method TEXT DEFAULT 'dwolla_ach',
  p_payment_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_role TEXT;
  v_payment_method TEXT;
  v_final_account_id UUID;
  v_payment_id UUID;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT role
    INTO v_role
  FROM public.profiles
  WHERE id = auth.uid()
    AND organization_id = v_invoice.organization_id;

  IF v_role NOT IN ('location_manager', 'branch_manager', 'org_owner', 'owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Managers or Owners can release funds';
  END IF;

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'processing', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice is already paid or processing';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before releasing funds';
  END IF;

  v_final_account_id := COALESCE(p_payment_account_id, v_invoice.payment_account_id);

  IF v_final_account_id IS NULL THEN
    RAISE EXCEPTION 'A payment account is required to release funds';
  END IF;

  IF p_payout_method = 'dwolla_ach' THEN
    v_payment_method := 'bank_transfer';
  ELSIF p_payout_method IN ('checkbook_digital', 'checkbook_physical') THEN
    v_payment_method := 'check';
  ELSE
    RAISE EXCEPTION 'Invalid payout method';
  END IF;

  UPDATE public.invoices
     SET payment_status = 'processing',
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         payment_account_id = v_final_account_id,
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
    payout_status,
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
    COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0),
    v_payment_method,
    'pending',
    'processing',
    CURRENT_DATE,
    v_final_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id,
    'payment_id', v_payment_id,
    'payout_method', p_payout_method
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
  SELECT *
    INTO v_order
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
    organization_id, order_id, vendor_id, status, items, received_by, received_date
  ) VALUES (
    p_organization_id, p_order_id, v_order.vendor_id, v_receiving_status,
    v_receiving_items, p_user_id, CURRENT_DATE
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
      SELECT *
        INTO v_current_inventory
      FROM public.inventory
      WHERE id = (v_item->>'inventory_id')::UUID
        AND organization_id = p_organization_id
      FOR UPDATE;
    END IF;

    IF v_current_inventory IS NULL AND NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
      SELECT *
        INTO v_current_inventory
      FROM public.inventory
      WHERE product_id = v_item->>'product_id'
        AND organization_id = p_organization_id
        AND (location_id = p_location_id OR p_location_id IS NULL)
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_current_inventory IS NULL THEN
      SELECT *
        INTO v_current_inventory
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
  FROM public.employee_shifts
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND COALESCE(shift_start, start_time)::DATE >= p_start_date
    AND COALESCE(shift_start, start_time)::DATE <= p_end_date;

  SELECT COALESCE(SUM(labor_cost), 0)
  INTO v_today_labor
  FROM public.employee_shifts
  WHERE organization_id = p_organization_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND COALESCE(shift_start, start_time)::DATE = CURRENT_DATE;

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

COMMIT;
