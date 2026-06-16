-- ============================================================
-- Migration 111: Fix Dashboard Performance & Stale Data
-- ============================================================

BEGIN;

-- 1. Create necessary indexes to prevent sequential scans
CREATE INDEX IF NOT EXISTS idx_invoices_date_coalesced 
ON public.invoices (organization_id, COALESCE(invoice_date, (created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS idx_payments_date_coalesced 
ON public.payments (organization_id, COALESCE(payment_date, (created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS idx_auto_orders_status_open 
ON public.auto_orders (organization_id)
WHERE COALESCE(status, 'pending') NOT IN ('completed', 'received', 'cancelled');


-- 2. Drop the AP and Inventory Materialized Views so data is real-time
DROP MATERIALIZED VIEW IF EXISTS public.mv_invoice_spend_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_valuation_summary CASCADE;

-- 3. Update the pg_cron schedule to 1-minute, but ONLY for Sales Data
-- Unscheduling the 5-minute cron
SELECT cron.unschedule('refresh_dashboard_views') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_dashboard_views');

-- Redefine the refresh function to ONLY refresh daily sales
CREATE OR REPLACE FUNCTION public.refresh_dashboard_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_sales_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reschedule to every minute
SELECT cron.schedule(
  'refresh_dashboard_views',
  '* * * * *',
  $$SELECT public.refresh_dashboard_materialized_views();$$
);


-- 4. Redefine the Dashboard RPC with real-time queries and strict date boundaries
CREATE OR REPLACE FUNCTION public.get_role_dashboard_summary(
  p_scope TEXT,
  p_org_id UUID,
  p_brand_id UUID DEFAULT NULL,
  p_location_id UUID DEFAULT NULL,
  p_period_start DATE DEFAULT date_trunc('month', now())::date,
  p_period_end DATE DEFAULT (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date
)
RETURNS JSONB AS $$
DECLARE
  v_today DATE := current_date;
  v_week_start DATE := date_trunc('week', current_date)::date;
  v_last_week_start DATE := (date_trunc('week', current_date) - interval '7 days')::date;
  v_last_year_week_start DATE := (date_trunc('week', current_date) - interval '1 year')::date;
  v_payload JSONB;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization id is required.';
  END IF;

  IF NOT public.is_platform_admin() AND public.get_my_org() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
  END IF;

  IF p_scope NOT IN ('org', 'brand', 'location', 'staff') THEN
    RAISE EXCEPTION 'Invalid dashboard scope: %', p_scope;
  END IF;

  WITH scoped_locations AS (
    SELECT l.id
    FROM public.locations l
    WHERE l.organization_id = p_org_id
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND l.brand_id = p_brand_id)
        OR (p_scope IN ('location', 'staff') AND l.id = p_location_id)
      )
  ),
  scoped_sales_mv AS (
    SELECT mv.*
    FROM public.mv_daily_sales_summary mv
    WHERE mv.organization_id = p_org_id
      AND mv.date BETWEEN (v_last_year_week_start - interval '7 days')::date AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (mv.brand_id = p_brand_id OR mv.brand_id = '00000000-0000-0000-0000-000000000000'::uuid))
        OR (p_scope IN ('location', 'staff') AND (mv.location_id = p_location_id OR mv.location_id = '00000000-0000-0000-0000-000000000000'::uuid))
      )
  ),
  -- REAL-TIME INVOICE SPEND (Replaces Materialized View)
  scoped_invoice_spend AS (
    SELECT 
      COUNT(*) as invoice_count,
      COALESCE(SUM(total_amount), 0) as total_spend,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'unpaid' OR status = 'approved'), 0) as unpaid_amount,
      COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND COALESCE(i.invoice_date, (i.created_at AT TIME ZONE 'UTC')::date) BETWEEN p_period_start AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (i.brand_id = p_brand_id OR (i.brand_id IS NULL AND i.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (i.location_id = p_location_id OR i.location_id IS NULL))
      )
  ),
  -- REAL-TIME INVENTORY (Replaces Materialized View)
  scoped_inventory AS (
    SELECT 
      COUNT(*) as total_items,
      COALESCE(SUM(current_value), 0) as total_valuation,
      COUNT(*) FILTER (WHERE current_quantity <= COALESCE(reorder_point, 5)) as low_stock_items
    FROM public.inventory i
    WHERE i.organization_id = p_org_id
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (i.location_id IN (SELECT id FROM scoped_locations)))
        OR (p_scope IN ('location', 'staff') AND (i.location_id = p_location_id OR i.location_id IS NULL))
      )
  ),
  period_invoices AS (
    SELECT i.id
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND COALESCE(i.invoice_date, (i.created_at AT TIME ZONE 'UTC')::date) BETWEEN p_period_start AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (i.brand_id = p_brand_id OR (i.brand_id IS NULL AND i.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (i.location_id = p_location_id OR i.location_id IS NULL))
      )
  ),
  -- FAST CATEGORY SPEND (No JSON array elements!)
  category_spend AS (
    SELECT 
      COALESCE(p.accounting_category, 'Other') AS category, 
      SUM(ili.total_price) AS amount
    FROM public.invoice_line_items ili
    JOIN period_invoices pi ON pi.id = ili.invoice_id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id
    GROUP BY COALESCE(p.accounting_category, 'Other')
    HAVING SUM(ili.total_price) > 0
  ),
  scoped_products AS (
    SELECT COUNT(*) as product_count
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (p.brand_id = p_brand_id OR (p.brand_id IS NULL AND p.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (p.location_id = p_location_id OR p.location_id IS NULL))
      )
  ),
  scoped_orders AS (
    SELECT COUNT(*) as open_orders_count
    FROM public.auto_orders ao
    WHERE ao.organization_id = p_org_id
      AND COALESCE(status, 'pending') NOT IN ('completed', 'received', 'cancelled')
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (ao.brand_id = p_brand_id OR (ao.brand_id IS NULL AND ao.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (ao.location_id = p_location_id OR ao.location_id IS NULL))
      )
  ),
  scoped_payments AS (
    SELECT COUNT(*) as payments_count
    FROM public.payments p
    WHERE p.organization_id = p_org_id
      AND COALESCE(p.payment_date, (p.created_at AT TIME ZONE 'UTC')::date) BETWEEN p_period_start AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (p.brand_id = p_brand_id OR (p.brand_id IS NULL AND p.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (p.location_id = p_location_id OR p.location_id IS NULL))
      )
  ),
  scoped_wastage AS (
    SELECT w.*
    FROM public.wastage_logs w
    WHERE w.organization_id = p_org_id
      AND COALESCE(w.created_at::date, v_today) BETWEEN p_period_start AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (w.brand_id = p_brand_id OR (w.brand_id IS NULL AND w.location_id IN (SELECT id FROM scoped_locations))))
        OR (p_scope IN ('location', 'staff') AND (w.location_id = p_location_id OR w.location_id IS NULL))
      )
  ),
  scoped_shifts AS (
    SELECT es.*
    FROM public.employee_shifts es
    WHERE es.organization_id = p_org_id
      AND COALESCE(es.shift_start::date, es.start_time::date) BETWEEN p_period_start AND p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND es.location_id IN (SELECT id FROM scoped_locations))
        OR (p_scope IN ('location', 'staff') AND es.location_id = p_location_id)
      )
  ),
  budget_targets AS (
    SELECT bt.*
    FROM public.budget_targets bt
    WHERE bt.organization_id = p_org_id
      AND bt.period_start = p_period_start
      AND bt.period_end = p_period_end
      AND (
        p_scope = 'org'
        OR (p_scope = 'brand' AND (bt.brand_id = p_brand_id OR bt.brand_id IS NULL))
        OR (p_scope IN ('location', 'staff') AND (bt.location_id = p_location_id OR bt.location_id IS NULL))
      )
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(ps.total_revenue) FILTER (WHERE ps.date = v_today), 0) AS sales_today,
      COALESCE(SUM(ps.total_revenue) FILTER (WHERE ps.date BETWEEN v_week_start AND (v_week_start + 6)), 0) AS sales_week_to_date,
      COALESCE(SUM(ps.total_revenue) FILTER (WHERE ps.date BETWEEN v_last_week_start AND (v_last_week_start + 6)), 0) AS sales_last_week,
      COALESCE(SUM(ps.total_revenue) FILTER (WHERE ps.date BETWEEN v_last_year_week_start AND (v_last_year_week_start + 6)), 0) AS sales_last_year,
      COALESCE(SUM(ps.total_revenue) FILTER (WHERE ps.date BETWEEN p_period_start AND p_period_end), 0) AS sales_period
    FROM scoped_sales_mv ps
  ),
  costs AS (
    SELECT
      (SELECT total_spend FROM scoped_invoice_spend) AS invoice_spend,
      COALESCE((SELECT SUM(labor_cost) FROM scoped_shifts), 0) AS labor_cost,
      COALESCE((SELECT SUM(value) FROM scoped_wastage), 0) AS wastage_cost,
      (SELECT unpaid_amount FROM scoped_invoice_spend) AS unpaid_amount,
      (SELECT pending_count FROM scoped_invoice_spend) AS pending_invoices,
      (SELECT low_stock_items FROM scoped_inventory) AS low_stock_items,
      (SELECT open_orders_count FROM scoped_orders) AS open_orders,
      (SELECT invoice_count FROM scoped_invoice_spend) AS total_invoices,
      (SELECT payments_count FROM scoped_payments) AS total_payments,
      (SELECT product_count FROM scoped_products) AS total_products,
      (SELECT total_items FROM scoped_inventory) AS total_inventory_items
  ),
  sales_rows AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', to_char(day_date, 'Dy'),
        'actual', actual,
        'lastWeek', last_week,
        'lastYear', last_year,
        'vsLastWeek', CASE WHEN last_week = 0 THEN 0 ELSE ((actual - last_week) / last_week) * 100 END,
        'vsLastYear', CASE WHEN last_year = 0 THEN 0 ELSE ((actual - last_year) / last_year) * 100 END
      )
      ORDER BY day_date
    ) AS rows
    FROM (
      SELECT
        d::date AS day_date,
        COALESCE((SELECT SUM(total_revenue) FROM scoped_sales_mv WHERE date = d::date), 0) AS actual,
        COALESCE((SELECT SUM(total_revenue) FROM scoped_sales_mv WHERE date = (d::date - interval '7 days')::date), 0) AS last_week,
        COALESCE((SELECT SUM(total_revenue) FROM scoped_sales_mv WHERE date = (d::date - interval '1 year')::date), 0) AS last_year
      FROM generate_series(v_week_start, v_week_start + 6, interval '1 day') AS d
    ) s
  ),
  spend_payload AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', category, 'value', amount) ORDER BY amount DESC), '[]'::jsonb) AS items
    FROM category_spend
  ),
  budget_payload AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category', category,
        'actual', actual,
        'target', target,
        'remaining', target - actual,
        'pacing', CASE WHEN target = 0 THEN 0 ELSE ((actual - target) / target) * 100 END,
        'isGood', CASE WHEN category = 'Sales' THEN actual >= target ELSE actual <= target END
      )
      ORDER BY sort_order, category
    ), '[]'::jsonb) AS items
    FROM (
      SELECT 1 AS sort_order, 'Sales'::text AS category, (SELECT sales_period FROM kpis) AS actual, COALESCE((SELECT target_amount FROM budget_targets WHERE category = 'Sales' LIMIT 1), NULLIF((SELECT sales_period FROM kpis) * 1.05, 0), 0) AS target
      UNION ALL
      SELECT 2, 'COGS', (SELECT invoice_spend FROM costs), COALESCE((SELECT target_amount FROM budget_targets WHERE category = 'COGS' LIMIT 1), NULLIF((SELECT invoice_spend FROM costs) * 0.95, 0), 0)
      UNION ALL
      SELECT 3, 'Labor', (SELECT labor_cost FROM costs), COALESCE((SELECT target_amount FROM budget_targets WHERE category = 'Labor' LIMIT 1), NULLIF((SELECT sales_period FROM kpis) * 0.28, 0), 0)
      UNION ALL
      SELECT 4, 'Prime Cost', (SELECT invoice_spend + labor_cost FROM costs), COALESCE((SELECT target_amount FROM budget_targets WHERE category = 'Prime Cost' LIMIT 1), NULLIF((SELECT sales_period FROM kpis) * 0.6, 0), 0)
    ) b
  ),
  alerts_payload AS (
    SELECT jsonb_agg(alert_obj) AS items
    FROM (
      SELECT jsonb_build_object('tone', 'red', 'title', low_stock_items || ' low stock items', 'body', 'Review reorder points and replenishment orders.', 'href', 'Inventory') AS alert_obj
      FROM costs WHERE low_stock_items > 0
      UNION ALL
      SELECT jsonb_build_object('tone', 'orange', 'title', pending_invoices || ' invoices pending', 'body', 'Clear pending review so AP and inventory stay current.', 'href', 'Invoices')
      FROM costs WHERE pending_invoices > 0
      UNION ALL
      SELECT jsonb_build_object('tone', 'blue', 'title', 'POS sales not flowing yet', 'body', 'Connect or map POS data to unlock daily sales benchmarking.', 'href', 'RestaurantSetup?tab=pos')
      FROM kpis WHERE sales_period = 0
      UNION ALL
      SELECT jsonb_build_object('tone', 'red', 'title', 'Labor above target', 'body', 'Labor is above the 28% operating target for this period.', 'href', 'Labor')
      FROM kpis, costs WHERE sales_period > 0 AND (labor_cost / sales_period) > 0.28
    ) a
  )
  SELECT jsonb_build_object(
    'scope', p_scope,
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'kpis', jsonb_build_object(
      'salesToday', k.sales_today,
      'salesWeekToDate', k.sales_week_to_date,
      'salesLastWeek', k.sales_last_week,
      'salesLastYear', k.sales_last_year,
      'salesPeriod', k.sales_period,
      'salesVsLastWeek', CASE WHEN k.sales_last_week = 0 THEN 0 ELSE ((k.sales_week_to_date - k.sales_last_week) / k.sales_last_week) * 100 END,
      'salesVsLastYear', CASE WHEN k.sales_last_year = 0 THEN 0 ELSE ((k.sales_week_to_date - k.sales_last_year) / k.sales_last_year) * 100 END,
      'invoiceSpend', c.invoice_spend,
      'laborCost', c.labor_cost,
      'cogsPercent', CASE WHEN k.sales_period = 0 THEN 0 ELSE (c.invoice_spend / k.sales_period) * 100 END,
      'laborPercent', CASE WHEN k.sales_period = 0 THEN 0 ELSE (c.labor_cost / k.sales_period) * 100 END,
      'primeCostPercent', CASE WHEN k.sales_period = 0 THEN 0 ELSE ((c.invoice_spend + c.labor_cost) / k.sales_period) * 100 END,
      'unpaidAmount', c.unpaid_amount,
      'pendingInvoices', c.pending_invoices,
      'lowStockItems', c.low_stock_items,
      'openOrders', c.open_orders,
      'wastageCost', c.wastage_cost
    ),
    'salesPerformance', COALESCE(sr.rows, '[]'::jsonb),
    'budgetPacing', bp.items,
    'spendByCategory', sp.items,
    'workflows', jsonb_build_object(
      'invoices', c.total_invoices,
      'payments', c.total_payments,
      'openOrders', c.open_orders,
      'lowStock', c.low_stock_items,
      'products', c.total_products,
      'inventoryItems', c.total_inventory_items,
      'wasteCost', c.wastage_cost
    ),
    'alerts', COALESCE(ap.items, '[]'::jsonb),
    'benchmarks', jsonb_build_array(
      jsonb_build_object('name', 'Sales', 'actual', k.sales_week_to_date, 'benchmark', COALESCE(NULLIF(k.sales_last_week, 0), k.sales_week_to_date)),
      jsonb_build_object('name', 'COGS', 'actual', CASE WHEN k.sales_period = 0 THEN 0 ELSE (c.invoice_spend / k.sales_period) * 100 END, 'benchmark', 32),
      jsonb_build_object('name', 'Labor', 'actual', CASE WHEN k.sales_period = 0 THEN 0 ELSE (c.labor_cost / k.sales_period) * 100 END, 'benchmark', 28),
      jsonb_build_object('name', 'Prime', 'actual', CASE WHEN k.sales_period = 0 THEN 0 ELSE ((c.invoice_spend + c.labor_cost) / k.sales_period) * 100 END, 'benchmark', 60)
    )
  )
  INTO v_payload
  FROM kpis k
  CROSS JOIN costs c
  CROSS JOIN sales_rows sr
  CROSS JOIN spend_payload sp
  CROSS JOIN budget_payload bp
  CROSS JOIN alerts_payload ap;

  RETURN v_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
