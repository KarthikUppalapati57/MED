BEGIN;

DROP FUNCTION IF EXISTS public.run_custom_report(TEXT[], TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[]);
DROP FUNCTION IF EXISTS public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[], UUID);

CREATE OR REPLACE FUNCTION public.run_custom_report(
  p_metrics TEXT[],
  p_dimension TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_modules TEXT[] DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_start DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
  v_modules TEXT[] := COALESCE(NULLIF(p_modules, ARRAY[]::TEXT[]), ARRAY['invoices','payments','products','inventory','recipes','performance','audit_logs']);
  v_allowed_modules CONSTANT TEXT[] := ARRAY['invoices','payments','products','inventory','recipes','performance','audit_logs'];
  v_allowed_metrics CONSTANT TEXT[] := ARRAY[
    'invoice_count','invoice_total_amount','invoice_approved_count','invoice_unpaid_count','invoice_tax_amount',
    'payment_count','payment_amount','payment_completed_amount','payment_failed_count',
    'product_count','inventoried_product_count','avg_latest_price','products_with_price_count',
    'inventory_value','inventory_quantity','low_stock_count','inventory_waste','cogs',
    'recipe_count','avg_recipe_cost','avg_suggested_price','avg_cost_per_serving',
    'sales_revenue','pos_transaction_count','labor_cost','prime_cost','gross_profit',
    'audit_event_count','audit_insert_count','audit_update_count','audit_delete_count'
  ];
  v_result JSONB;
  v_bad TEXT;
BEGIN
  v_org := CASE WHEN auth.role() = 'service_role' THEN p_organization_id ELSE public.get_auth_org() END;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization context is required';
  END IF;

  IF v_start > v_end THEN
    RAISE EXCEPTION 'start date must be on or before end date';
  END IF;

  IF p_dimension NOT IN ('date', 'week', 'month', 'location', 'status', 'category', 'module') THEN
    RAISE EXCEPTION 'unsupported report dimension: %', p_dimension;
  END IF;

  SELECT value INTO v_bad
  FROM unnest(v_modules) AS value
  WHERE value <> ALL(v_allowed_modules)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported report module: %', v_bad;
  END IF;

  SELECT value INTO v_bad
  FROM unnest(COALESCE(p_metrics, ARRAY[]::TEXT[])) AS value
  WHERE value <> ALL(v_allowed_metrics)
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported report metric: %', v_bad;
  END IF;

  WITH invoice_rows AS (
    SELECT
      'invoices'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(COALESCE(i.invoice_date, i.created_at::DATE)::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', COALESCE(i.invoice_date, i.created_at::DATE)::TIMESTAMP), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', COALESCE(i.invoice_date, i.created_at::DATE)::TIMESTAMP), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, NULLIF(i.location, ''), 'Unassigned')
        WHEN 'status' THEN COALESCE(NULLIF(i.status, ''), 'unknown')
        WHEN 'category' THEN COALESCE(NULLIF(i.source, ''), 'invoice')
        WHEN 'module' THEN 'Invoices'
      END AS dimension,
      jsonb_build_object(
        'invoice_count', COUNT(*)::NUMERIC,
        'invoice_total_amount', COALESCE(SUM(i.total_amount), 0)::NUMERIC,
        'invoice_approved_count', COUNT(*) FILTER (WHERE i.status IN ('approved','paid'))::NUMERIC,
        'invoice_unpaid_count', COUNT(*) FILTER (WHERE COALESCE(i.payment_status, 'unpaid') <> 'paid')::NUMERIC,
        'invoice_tax_amount', COALESCE(SUM(i.tax_amount), 0)::NUMERIC
      ) AS metrics
    FROM public.invoices i
    LEFT JOIN public.locations l ON l.id = i.location_id
    WHERE 'invoices' = ANY(v_modules)
      AND i.organization_id = v_org
      AND COALESCE(i.invoice_date, i.created_at::DATE) BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), payment_rows AS (
    SELECT
      'payments'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(COALESCE(p.payment_date, p.created_at::DATE)::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', COALESCE(p.payment_date, p.created_at::DATE)::TIMESTAMP), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', COALESCE(p.payment_date, p.created_at::DATE)::TIMESTAMP), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
        WHEN 'status' THEN COALESCE(NULLIF(p.status, ''), 'unknown')
        WHEN 'category' THEN COALESCE(NULLIF(p.payment_method, ''), 'payment')
        WHEN 'module' THEN 'Payments'
      END AS dimension,
      jsonb_build_object(
        'payment_count', COUNT(*)::NUMERIC,
        'payment_amount', COALESCE(SUM(p.amount), 0)::NUMERIC,
        'payment_completed_amount', COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0)::NUMERIC,
        'payment_failed_count', COUNT(*) FILTER (WHERE p.status = 'failed')::NUMERIC
      ) AS metrics
    FROM public.payments p
    LEFT JOIN public.locations l ON l.id = p.location_id
    WHERE 'payments' = ANY(v_modules)
      AND p.organization_id = v_org
      AND COALESCE(p.payment_date, p.created_at::DATE) BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), product_rows AS (
    SELECT
      'products'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(p.created_at::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', p.created_at), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', p.created_at), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Org Catalog')
        WHEN 'status' THEN COALESCE(NULLIF(p.status, ''), 'unknown')
        WHEN 'category' THEN COALESCE(NULLIF(p.category, ''), NULLIF(p.accounting_category, ''), 'Uncategorized')
        WHEN 'module' THEN 'Products'
      END AS dimension,
      jsonb_build_object(
        'product_count', COUNT(*)::NUMERIC,
        'inventoried_product_count', COUNT(*) FILTER (WHERE COALESCE(p.is_inventoried, false))::NUMERIC,
        'avg_latest_price', COALESCE(AVG(p.latest_price), 0)::NUMERIC,
        'products_with_price_count', COUNT(*) FILTER (WHERE COALESCE(p.latest_price, 0) > 0)::NUMERIC
      ) AS metrics
    FROM public.products p
    LEFT JOIN public.locations l ON l.id = p.location_id
    WHERE 'products' = ANY(v_modules)
      AND p.organization_id = v_org
      AND p.created_at::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), inventory_rows AS (
    SELECT
      'inventory'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(COALESCE(inv.updated_at, inv.created_at)::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', COALESCE(inv.updated_at, inv.created_at)), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', COALESCE(inv.updated_at, inv.created_at)), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, NULLIF(inv.location, ''), 'Unassigned')
        WHEN 'status' THEN CASE WHEN COALESCE(inv.current_quantity, 0) <= COALESCE(inv.reorder_point, inv.par_level, 0) THEN 'low_stock' ELSE 'in_stock' END
        WHEN 'category' THEN COALESCE(NULLIF(inv.category, ''), NULLIF(inv.accounting_category, ''), 'Uncategorized')
        WHEN 'module' THEN 'Inventory'
      END AS dimension,
      jsonb_build_object(
        'inventory_value', COALESCE(SUM(inv.current_value), 0)::NUMERIC,
        'inventory_quantity', COALESCE(SUM(inv.current_quantity), 0)::NUMERIC,
        'low_stock_count', COUNT(*) FILTER (WHERE COALESCE(inv.current_quantity, 0) <= COALESCE(inv.reorder_point, inv.par_level, 0))::NUMERIC,
        'inventory_waste', 0::NUMERIC,
        'cogs', 0::NUMERIC
      ) AS metrics
    FROM public.inventory inv
    LEFT JOIN public.locations l ON l.id = inv.location_id
    WHERE 'inventory' = ANY(v_modules)
      AND inv.organization_id = v_org
      AND COALESCE(inv.updated_at, inv.created_at)::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), inventory_movement_rows AS (
    SELECT
      'inventory'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(im.created_at::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', im.created_at), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', im.created_at), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
        WHEN 'status' THEN COALESCE(NULLIF(im.movement_type, ''), 'movement')
        WHEN 'category' THEN COALESCE(NULLIF(base.category, ''), 'Movement')
        WHEN 'module' THEN 'Inventory'
      END AS dimension,
      jsonb_build_object(
        'inventory_waste', COALESCE(SUM(CASE WHEN im.movement_type IN ('wastage','spoilage') THEN ABS(im.quantity) * COALESCE(base.unit_cost, 0) ELSE 0 END), 0)::NUMERIC,
        'cogs', COALESCE(SUM(CASE WHEN im.quantity < 0 THEN ABS(im.quantity) * COALESCE(base.unit_cost, 0) ELSE 0 END), 0)::NUMERIC
      ) AS metrics
    FROM public.inventory_movements im
    LEFT JOIN public.inventory base ON base.id = im.inventory_id
    LEFT JOIN public.locations l ON l.id = im.location_id
    WHERE 'inventory' = ANY(v_modules)
      AND im.organization_id = v_org
      AND im.created_at::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), recipe_rows AS (
    SELECT
      'recipes'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(r.created_at::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', r.created_at), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', r.created_at), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Recipe Library')
        WHEN 'status' THEN COALESCE(NULLIF(r.status, ''), 'unknown')
        WHEN 'category' THEN COALESCE(NULLIF(r.category, ''), 'Uncategorized')
        WHEN 'module' THEN 'Recipes'
      END AS dimension,
      jsonb_build_object(
        'recipe_count', COUNT(*)::NUMERIC,
        'avg_recipe_cost', COALESCE(AVG(r.total_cost), 0)::NUMERIC,
        'avg_suggested_price', COALESCE(AVG(r.suggested_price), 0)::NUMERIC,
        'avg_cost_per_serving', COALESCE(AVG(r.cost_per_serving), 0)::NUMERIC
      ) AS metrics
    FROM public.recipes r
    LEFT JOIN public.locations l ON l.id = r.location_id
    WHERE 'recipes' = ANY(v_modules)
      AND r.organization_id = v_org
      AND r.created_at::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), performance_sales_rows AS (
    SELECT
      'performance'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(po.order_date::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', po.order_date), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', po.order_date), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
        WHEN 'status' THEN COALESCE(NULLIF(po.status, ''), 'order')
        WHEN 'category' THEN 'POS Sales'
        WHEN 'module' THEN 'Performance'
      END AS dimension,
      jsonb_build_object(
        'sales_revenue', COALESCE(SUM(po.total_amount), 0)::NUMERIC,
        'pos_transaction_count', COUNT(*)::NUMERIC,
        'gross_profit', COALESCE(SUM(po.total_amount), 0)::NUMERIC
      ) AS metrics
    FROM public.pos_orders po
    LEFT JOIN public.locations l ON l.id = po.location_id
    WHERE 'performance' = ANY(v_modules)
      AND po.organization_id = v_org
      AND po.order_date::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), performance_labor_rows AS (
    SELECT
      'performance'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(es.shift_start::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', es.shift_start), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', es.shift_start), 'YYYY-MM')
        WHEN 'location' THEN COALESCE(l.name, 'Unassigned')
        WHEN 'status' THEN COALESCE(NULLIF(es.status, ''), 'shift')
        WHEN 'category' THEN 'Labor'
        WHEN 'module' THEN 'Performance'
      END AS dimension,
      jsonb_build_object(
        'labor_cost', COALESCE(SUM(es.labor_cost), 0)::NUMERIC,
        'prime_cost', COALESCE(SUM(es.labor_cost), 0)::NUMERIC,
        'gross_profit', -COALESCE(SUM(es.labor_cost), 0)::NUMERIC
      ) AS metrics
    FROM public.employee_shifts es
    LEFT JOIN public.locations l ON l.id = es.location_id
    WHERE 'performance' = ANY(v_modules)
      AND es.organization_id = v_org
      AND es.shift_start::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), audit_rows AS (
    SELECT
      'audit_logs'::TEXT AS module,
      CASE p_dimension
        WHEN 'date' THEN to_char(a.created_at::DATE::TIMESTAMP, 'YYYY-MM-DD')
        WHEN 'week' THEN to_char(date_trunc('week', a.created_at), 'IYYY-IW')
        WHEN 'month' THEN to_char(date_trunc('month', a.created_at), 'YYYY-MM')
        WHEN 'location' THEN 'Organization'
        WHEN 'status' THEN COALESCE(NULLIF(a.action, ''), 'unknown')
        WHEN 'category' THEN COALESCE(NULLIF(a.table_name, ''), 'unknown_table')
        WHEN 'module' THEN 'Audit Logs'
      END AS dimension,
      jsonb_build_object(
        'audit_event_count', COUNT(*)::NUMERIC,
        'audit_insert_count', COUNT(*) FILTER (WHERE upper(a.action) = 'INSERT')::NUMERIC,
        'audit_update_count', COUNT(*) FILTER (WHERE upper(a.action) = 'UPDATE')::NUMERIC,
        'audit_delete_count', COUNT(*) FILTER (WHERE upper(a.action) = 'DELETE')::NUMERIC
      ) AS metrics
    FROM public.audit_logs a
    WHERE 'audit_logs' = ANY(v_modules)
      AND a.organization_id = v_org
      AND a.created_at::DATE BETWEEN v_start AND v_end
    GROUP BY 1, 2
  ), unioned AS (
    SELECT * FROM invoice_rows
    UNION ALL SELECT * FROM payment_rows
    UNION ALL SELECT * FROM product_rows
    UNION ALL SELECT * FROM inventory_rows
    UNION ALL SELECT * FROM inventory_movement_rows
    UNION ALL SELECT * FROM recipe_rows
    UNION ALL SELECT * FROM performance_sales_rows
    UNION ALL SELECT * FROM performance_labor_rows
    UNION ALL SELECT * FROM audit_rows
  ), merged AS (
    SELECT
      module,
      dimension,
      SUM(COALESCE((metrics->>'invoice_count')::NUMERIC, 0)) AS invoice_count,
      SUM(COALESCE((metrics->>'invoice_total_amount')::NUMERIC, 0)) AS invoice_total_amount,
      SUM(COALESCE((metrics->>'invoice_approved_count')::NUMERIC, 0)) AS invoice_approved_count,
      SUM(COALESCE((metrics->>'invoice_unpaid_count')::NUMERIC, 0)) AS invoice_unpaid_count,
      SUM(COALESCE((metrics->>'invoice_tax_amount')::NUMERIC, 0)) AS invoice_tax_amount,
      SUM(COALESCE((metrics->>'payment_count')::NUMERIC, 0)) AS payment_count,
      SUM(COALESCE((metrics->>'payment_amount')::NUMERIC, 0)) AS payment_amount,
      SUM(COALESCE((metrics->>'payment_completed_amount')::NUMERIC, 0)) AS payment_completed_amount,
      SUM(COALESCE((metrics->>'payment_failed_count')::NUMERIC, 0)) AS payment_failed_count,
      SUM(COALESCE((metrics->>'product_count')::NUMERIC, 0)) AS product_count,
      SUM(COALESCE((metrics->>'inventoried_product_count')::NUMERIC, 0)) AS inventoried_product_count,
      SUM(COALESCE((metrics->>'avg_latest_price')::NUMERIC, 0)) AS avg_latest_price,
      SUM(COALESCE((metrics->>'products_with_price_count')::NUMERIC, 0)) AS products_with_price_count,
      SUM(COALESCE((metrics->>'inventory_value')::NUMERIC, 0)) AS inventory_value,
      SUM(COALESCE((metrics->>'inventory_quantity')::NUMERIC, 0)) AS inventory_quantity,
      SUM(COALESCE((metrics->>'low_stock_count')::NUMERIC, 0)) AS low_stock_count,
      SUM(COALESCE((metrics->>'inventory_waste')::NUMERIC, 0)) AS inventory_waste,
      SUM(COALESCE((metrics->>'cogs')::NUMERIC, 0)) AS cogs,
      SUM(COALESCE((metrics->>'recipe_count')::NUMERIC, 0)) AS recipe_count,
      SUM(COALESCE((metrics->>'avg_recipe_cost')::NUMERIC, 0)) AS avg_recipe_cost,
      SUM(COALESCE((metrics->>'avg_suggested_price')::NUMERIC, 0)) AS avg_suggested_price,
      SUM(COALESCE((metrics->>'avg_cost_per_serving')::NUMERIC, 0)) AS avg_cost_per_serving,
      SUM(COALESCE((metrics->>'sales_revenue')::NUMERIC, 0)) AS sales_revenue,
      SUM(COALESCE((metrics->>'pos_transaction_count')::NUMERIC, 0)) AS pos_transaction_count,
      SUM(COALESCE((metrics->>'labor_cost')::NUMERIC, 0)) AS labor_cost,
      SUM(COALESCE((metrics->>'prime_cost')::NUMERIC, 0)) + SUM(COALESCE((metrics->>'cogs')::NUMERIC, 0)) AS prime_cost,
      SUM(COALESCE((metrics->>'gross_profit')::NUMERIC, 0)) - SUM(COALESCE((metrics->>'cogs')::NUMERIC, 0)) AS gross_profit,
      SUM(COALESCE((metrics->>'audit_event_count')::NUMERIC, 0)) AS audit_event_count,
      SUM(COALESCE((metrics->>'audit_insert_count')::NUMERIC, 0)) AS audit_insert_count,
      SUM(COALESCE((metrics->>'audit_update_count')::NUMERIC, 0)) AS audit_update_count,
      SUM(COALESCE((metrics->>'audit_delete_count')::NUMERIC, 0)) AS audit_delete_count
    FROM unioned
    WHERE dimension IS NOT NULL
    GROUP BY module, dimension
  )
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'module', module,
    'dimension', dimension,
    'invoice_count', CASE WHEN 'invoice_count' = ANY(p_metrics) THEN invoice_count END,
    'invoice_total_amount', CASE WHEN 'invoice_total_amount' = ANY(p_metrics) THEN invoice_total_amount END,
    'invoice_approved_count', CASE WHEN 'invoice_approved_count' = ANY(p_metrics) THEN invoice_approved_count END,
    'invoice_unpaid_count', CASE WHEN 'invoice_unpaid_count' = ANY(p_metrics) THEN invoice_unpaid_count END,
    'invoice_tax_amount', CASE WHEN 'invoice_tax_amount' = ANY(p_metrics) THEN invoice_tax_amount END,
    'payment_count', CASE WHEN 'payment_count' = ANY(p_metrics) THEN payment_count END,
    'payment_amount', CASE WHEN 'payment_amount' = ANY(p_metrics) THEN payment_amount END,
    'payment_completed_amount', CASE WHEN 'payment_completed_amount' = ANY(p_metrics) THEN payment_completed_amount END,
    'payment_failed_count', CASE WHEN 'payment_failed_count' = ANY(p_metrics) THEN payment_failed_count END,
    'product_count', CASE WHEN 'product_count' = ANY(p_metrics) THEN product_count END,
    'inventoried_product_count', CASE WHEN 'inventoried_product_count' = ANY(p_metrics) THEN inventoried_product_count END,
    'avg_latest_price', CASE WHEN 'avg_latest_price' = ANY(p_metrics) THEN avg_latest_price END,
    'products_with_price_count', CASE WHEN 'products_with_price_count' = ANY(p_metrics) THEN products_with_price_count END,
    'inventory_value', CASE WHEN 'inventory_value' = ANY(p_metrics) THEN inventory_value END,
    'inventory_quantity', CASE WHEN 'inventory_quantity' = ANY(p_metrics) THEN inventory_quantity END,
    'low_stock_count', CASE WHEN 'low_stock_count' = ANY(p_metrics) THEN low_stock_count END,
    'inventory_waste', CASE WHEN 'inventory_waste' = ANY(p_metrics) THEN inventory_waste END,
    'cogs', CASE WHEN 'cogs' = ANY(p_metrics) THEN cogs END,
    'recipe_count', CASE WHEN 'recipe_count' = ANY(p_metrics) THEN recipe_count END,
    'avg_recipe_cost', CASE WHEN 'avg_recipe_cost' = ANY(p_metrics) THEN avg_recipe_cost END,
    'avg_suggested_price', CASE WHEN 'avg_suggested_price' = ANY(p_metrics) THEN avg_suggested_price END,
    'avg_cost_per_serving', CASE WHEN 'avg_cost_per_serving' = ANY(p_metrics) THEN avg_cost_per_serving END,
    'sales_revenue', CASE WHEN 'sales_revenue' = ANY(p_metrics) THEN sales_revenue END,
    'pos_transaction_count', CASE WHEN 'pos_transaction_count' = ANY(p_metrics) THEN pos_transaction_count END,
    'labor_cost', CASE WHEN 'labor_cost' = ANY(p_metrics) THEN labor_cost END,
    'prime_cost', CASE WHEN 'prime_cost' = ANY(p_metrics) THEN prime_cost END,
    'gross_profit', CASE WHEN 'gross_profit' = ANY(p_metrics) THEN gross_profit END,
    'audit_event_count', CASE WHEN 'audit_event_count' = ANY(p_metrics) THEN audit_event_count END,
    'audit_insert_count', CASE WHEN 'audit_insert_count' = ANY(p_metrics) THEN audit_insert_count END,
    'audit_update_count', CASE WHEN 'audit_update_count' = ANY(p_metrics) THEN audit_update_count END,
    'audit_delete_count', CASE WHEN 'audit_delete_count' = ANY(p_metrics) THEN audit_delete_count END
  )) ORDER BY module, dimension), '[]'::JSONB)
  INTO v_result
  FROM merged;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[], UUID) TO authenticated, service_role;

COMMIT;


