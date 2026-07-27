BEGIN;

CREATE OR REPLACE FUNCTION public.assert_performance_report_bounds(
  p_date_from date,
  p_date_to date,
  p_max_days integer DEFAULT 548
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION 'date_to must be on or after date_from';
  END IF;

  IF (p_date_to - p_date_from) + 1 > p_max_days THEN
    RAISE EXCEPTION 'Performance report range exceeds % days', p_max_days;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.limit_performance_jsonb_array(
  p_rows jsonb,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
    WITH ORDINALITY AS source(row_data, ordinality)
  WHERE ordinality > GREATEST(COALESCE(p_offset, 0), 0)
    AND ordinality <= GREATEST(COALESCE(p_offset, 0), 0) + LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.with_performance_limit_metadata(
  p_result jsonb,
  p_key text,
  p_total_count integer,
  p_limit integer,
  p_offset integer,
  p_started_at timestamptz,
  p_max_days integer DEFAULT 548
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_set(
    COALESCE(p_result, '{}'::jsonb),
    '{metadata}',
    COALESCE(p_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'detailLimit', LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
        'detailOffset', GREATEST(COALESCE(p_offset, 0), 0),
        'detailTotalCount', GREATEST(COALESCE(p_total_count, 0), 0),
        'detailReturnedCount', jsonb_array_length(COALESCE(p_result->p_key, '[]'::jsonb)),
        'detailTruncated', GREATEST(COALESCE(p_total_count, 0), 0) > GREATEST(COALESCE(p_offset, 0), 0) + LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
        'maxInteractiveRangeDays', p_max_days,
        'queryDurationMs', round((EXTRACT(epoch FROM (clock_timestamp() - p_started_at)) * 1000)::numeric, 2)
      ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_location_performance_overview_rollup(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_timezone text;
  v_brand_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(p_organization_id, p_location_id, false);
  PERFORM public.assert_performance_report_bounds(p_date_from, p_date_to);

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

  SELECT l.brand_id
    INTO v_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id
    AND l.deleted_at IS NULL;

  WITH invoice_scope AS (
    SELECT
      i.id,
      i.total_amount,
      COALESCE(i.paid_amount, 0) AS paid_amount,
      COALESCE(i.credit_applied, 0) AS credit_applied,
      lower(COALESCE(i.payment_status, '')) AS payment_status
    FROM public.invoices i
    WHERE i.organization_id = p_organization_id
      AND i.location_id = p_location_id
      AND i.deleted_at IS NULL
      AND i.invoice_date >= p_date_from
      AND i.invoice_date <= p_date_to
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
  ),
  invoice_rollup AS (
    SELECT
      COALESCE(sum(GREATEST(0, total_amount - paid_amount - credit_applied))
        FILTER (WHERE payment_status IN ('unpaid', 'partial', 'processing')), 0)::numeric AS unpaid_balance,
      count(*) FILTER (WHERE payment_status IN ('unpaid', 'partial', 'processing'))::int AS unpaid_count
    FROM invoice_scope
  ),
  payment_rollup AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('completed', 'paid')), 0)::numeric AS completed_amount,
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('pending', 'processing', 'scheduled')), 0)::numeric AS scheduled_amount,
      COALESCE(sum(amount) FILTER (WHERE lower(COALESCE(status, '')) IN ('failed', 'cancelled', 'refunded')), 0)::numeric AS failed_amount,
      count(*)::int AS payment_count
    FROM public.payments p
    WHERE p.organization_id = p_organization_id
      AND p.location_id = p_location_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.payment_date, (p.created_at AT TIME ZONE v_timezone)::date) >= p_date_from
      AND COALESCE(p.payment_date, (p.created_at AT TIME ZONE v_timezone)::date) <= p_date_to
      AND public.tenant_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
  ),
  product_rollup AS (
    SELECT
      count(*)::int AS total_products,
      count(*) FILTER (WHERE NULLIF(btrim(COALESCE(category, accounting_category)), '') IS NOT NULL)::int AS categorized_products
    FROM public.products p
    WHERE p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND (
        p.location_id = p_location_id
        OR (p.location_id IS NULL AND p.brand_id IS NOT DISTINCT FROM v_brand_id)
        OR (p.location_id IS NULL AND p.brand_id IS NULL)
      )
  ),
  inventory_rollup AS (
    SELECT
      COALESCE(sum(current_value), 0)::numeric AS current_inventory_value,
      count(*) FILTER (
        WHERE COALESCE(reorder_point, par_level, 0) > 0
          AND COALESCE(current_quantity, 0) <= COALESCE(reorder_point, par_level, 0)
      )::int AS low_stock_count,
      count(*)::int AS inventory_count
    FROM public.inventory inv
    WHERE inv.organization_id = p_organization_id
      AND inv.location_id = p_location_id
      AND inv.deleted_at IS NULL
      AND public.tenant_scope_visible(inv.organization_id, inv.brand_id, inv.location_id, inv.deleted_at)
  ),
  recipe_base AS (
    SELECT
      COALESCE(cost_per_serving, total_cost, 0)::numeric AS cost,
      COALESCE(selling_price, suggested_price, 0)::numeric AS price,
      COALESCE(target_margin_percent, 0)::numeric AS target_margin
    FROM public.recipes r
    WHERE r.organization_id = p_organization_id
      AND r.deleted_at IS NULL
      AND (
        r.location_id = p_location_id
        OR (r.location_id IS NULL AND r.brand_id IS NOT DISTINCT FROM v_brand_id)
        OR (r.location_id IS NULL AND r.brand_id IS NULL)
      )
      AND public.tenant_scope_visible(r.organization_id, r.brand_id, r.location_id, r.deleted_at)
  ),
  recipe_rollup AS (
    SELECT
      count(*)::int AS recipe_count,
      COALESCE(avg(((price - cost) / NULLIF(price, 0)) * 100) FILTER (WHERE price > 0), 0)::numeric AS average_recipe_margin,
      count(*) FILTER (
        WHERE price > 0
          AND target_margin > 0
          AND ((price - cost) / NULLIF(price, 0)) * 100 < target_margin
      )::int AS recipe_margin_risk_count
    FROM recipe_base
  )
  SELECT jsonb_build_object(
    'payments', jsonb_build_object(
      'completedAmount', pr.completed_amount,
      'scheduledAmount', pr.scheduled_amount,
      'failedAmount', pr.failed_amount,
      'paymentCount', pr.payment_count,
      'invoiceUnpaidBalance', ir.unpaid_balance,
      'invoiceUnpaidCount', ir.unpaid_count
    ),
    'products', jsonb_build_object(
      'totalProducts', prod.total_products,
      'categorizedProducts', prod.categorized_products
    ),
    'inventory', jsonb_build_object(
      'currentInventoryValue', inv.current_inventory_value,
      'lowStockCount', inv.low_stock_count,
      'inventoryCount', inv.inventory_count
    ),
    'recipes', jsonb_build_object(
      'recipeCount', rec.recipe_count,
      'averageRecipeMargin', round(rec.average_recipe_margin, 2),
      'recipeMarginRiskCount', rec.recipe_margin_risk_count
    ),
    'metadata', jsonb_build_object(
      'timezone', v_timezone,
      'aggregation', 'server_rollup',
      'maxInteractiveRangeDays', 548,
      'queryDurationMs', round((EXTRACT(epoch FROM (clock_timestamp() - v_started_at)) * 1000)::numeric, 2)
    )
  )
  INTO v_result
  FROM invoice_rollup ir, payment_rollup pr, product_rollup prod, inventory_rollup inv, recipe_rollup rec;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_perf_invoices_org_loc_date_active
  ON public.invoices(organization_id, location_id, invoice_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_payments_org_loc_payment_date_active
  ON public.payments(organization_id, location_id, payment_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_allocations_org_loc_invoice_category
  ON public.invoice_allocations(organization_id, location_id, invoice_id, category_name)
  WHERE allocation_type = 'line_items';

CREATE INDEX IF NOT EXISTS idx_perf_line_items_org_product_invoice
  ON public.invoice_line_items(organization_id, internal_product_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_perf_inventory_org_loc_active
  ON public.inventory(organization_id, location_id, internal_product_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_inventory_movements_org_loc_date
  ON public.inventory_movements(organization_id, location_id, created_at, inventory_id);

CREATE INDEX IF NOT EXISTS idx_perf_count_sessions_org_loc_completed
  ON public.count_sessions(organization_id, location_id, completed_at)
  WHERE deleted_at IS NULL AND lower(status) = 'completed';

CREATE INDEX IF NOT EXISTS idx_perf_wastage_org_loc_date_active
  ON public.wastage_logs(organization_id, location_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_products_hierarchy_active
  ON public.products(organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_perf_recipes_hierarchy_active
  ON public.recipes(organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

COMMENT ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date) IS
  'Server-side bounded rollup for the Performance overview, replacing browser aggregation over large entity lists.';
COMMENT ON FUNCTION public.assert_performance_report_bounds(date, date, integer) IS
  'Rejects missing, reversed, or overly broad interactive Performance reporting ranges.';
COMMENT ON FUNCTION public.limit_performance_jsonb_array(jsonb, integer, integer) IS
  'Applies a bounded slice to report detail arrays before returning them to the browser.';

NOTIFY pgrst, 'reload schema';

COMMIT;
