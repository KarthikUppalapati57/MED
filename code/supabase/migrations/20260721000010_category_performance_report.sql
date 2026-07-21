-- Category Performance Report: consolidated purchasing analytics (no POS).
-- Spend fact: invoice_allocations joined to invoices.invoice_date.
-- Eligible invoices:
--   deleted_at IS NULL
--   status NOT IN ('rejected', 'duplicate')
--   ap_status IS DISTINCT FROM 'rejected'
--   AND purchasing-recognized status:
--     status IN ('approved','scheduled','partially_paid','paid')
--     OR ap_status IN ('approved','scheduled','paid','closed')
-- Rationale: invoices use dual tracks (status + ap_status). Purchase-report
-- historically used (status='approved' OR ap_status='approved'), which drops
-- fully paid invoices whose status/ap_status moved to paid/closed. Category
-- Report includes those paid/settled states while still excluding rejected,
-- duplicate, draft/extract, and soft-deleted rows. There is no 'void' status;
-- voiding is represented by deleted_at.
-- Label: Purchasing Spend (not COGS).

BEGIN;

-- Shared eligibility predicate for purchasing spend (allocations join invoices).
-- Keep in sync with get_category_performance_drilldown.
CREATE OR REPLACE FUNCTION public.is_purchasing_spend_invoice(
  p_status text,
  p_ap_status text,
  p_deleted_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_deleted_at IS NULL
    AND COALESCE(p_status, '') NOT IN ('rejected', 'duplicate')
    AND COALESCE(p_ap_status, '') IS DISTINCT FROM 'rejected'
    AND (
      COALESCE(p_status, '') IN ('approved', 'scheduled', 'partially_paid', 'paid')
      OR COALESCE(p_ap_status, '') IN ('approved', 'scheduled', 'paid', 'closed')
    );
$$;

COMMENT ON FUNCTION public.is_purchasing_spend_invoice(text, text, timestamptz) IS
  'True when an invoice should count toward purchasing-spend analytics.';

CREATE OR REPLACE FUNCTION public.get_category_performance_report(
  p_organization_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_selected_category text DEFAULT NULL,
  p_trend_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_days int;
  v_granularity text;
  v_min_spend numeric;
  v_result jsonb;
  v_has_budget boolean := false;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  v_days := GREATEST(1, (p_date_to - p_date_from) + 1);
  IF v_days <= 31 THEN
    v_granularity := 'day';
  ELSIF v_days <= 120 THEN
    v_granularity := 'week';
  ELSE
    v_granularity := 'month';
  END IF;

  -- Product-category budgets are uncommon; detect any overlapping budget_targets
  -- whose category string matches an allocation category_name in scope.
  SELECT EXISTS (
    SELECT 1
    FROM public.budget_targets bt
    WHERE bt.organization_id = v_org_id
      AND bt.period_start <= p_date_to
      AND bt.period_end >= p_date_from
      AND EXISTS (
        SELECT 1
        FROM public.invoice_allocations ia
        JOIN public.invoices i ON i.id = ia.invoice_id
        WHERE ia.organization_id = v_org_id
          AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
          AND COALESCE(NULLIF(trim(ia.category_name), ''), 'Uncategorized') = bt.category
      )
  ) INTO v_has_budget;

  WITH eligible AS (
    SELECT
      ia.id AS allocation_id,
      ia.invoice_id,
      ia.amount,
      ia.allocation_type,
      COALESCE(NULLIF(trim(ia.category_name), ''), 'Uncategorized') AS category_name,
      COALESCE(ia.location_id, i.location_id) AS effective_location_id,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      i.invoice_number,
      i.status,
      i.ap_status,
      i.brand_id,
      i.organization_id
    FROM public.invoice_allocations ia
    JOIN public.invoices i ON i.id = ia.invoice_id
    WHERE ia.organization_id = v_org_id
      AND i.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND ia.allocation_type = 'line_items'
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND (
        p_location_ids IS NULL
        OR cardinality(p_location_ids) = 0
        OR COALESCE(ia.location_id, i.location_id) = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL
        OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
      AND (
        p_category_names IS NULL
        OR cardinality(p_category_names) = 0
        OR COALESCE(NULLIF(trim(ia.category_name), ''), 'Uncategorized') = ANY (p_category_names)
      )
  ),
  current_rows AS (
    SELECT * FROM eligible e
    WHERE e.invoice_date >= p_date_from
      AND e.invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM eligible e
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND e.invoice_date >= p_comparison_date_from
      AND e.invoice_date <= p_comparison_date_to
  ),
  current_by_cat AS (
    SELECT
      category_name,
      round(sum(amount)::numeric, 2) AS spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      count(DISTINCT vendor_id) FILTER (WHERE vendor_id IS NOT NULL)::bigint AS vendor_count
    FROM current_rows
    GROUP BY category_name
  ),
  previous_by_cat AS (
    SELECT
      category_name,
      round(sum(amount)::numeric, 2) AS spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count
    FROM previous_rows
    GROUP BY category_name
  ),
  all_categories AS (
    SELECT category_name FROM current_by_cat
    UNION
    SELECT category_name FROM previous_by_cat
  ),
  category_join AS (
    SELECT
      c.category_name,
      COALESCE(cur.spend, 0)::numeric AS current_spend,
      COALESCE(prev.spend, 0)::numeric AS previous_spend,
      COALESCE(cur.invoice_count, 0)::bigint AS invoice_count,
      COALESCE(cur.vendor_count, 0)::bigint AS vendor_count,
      (COALESCE(cur.spend, 0) - COALESCE(prev.spend, 0))::numeric AS absolute_variance,
      CASE
        WHEN COALESCE(prev.spend, 0) = 0 AND COALESCE(cur.spend, 0) = 0 THEN 0::numeric
        WHEN COALESCE(prev.spend, 0) = 0 THEN NULL
        ELSE round(((COALESCE(cur.spend, 0) - prev.spend) / abs(prev.spend)) * 100, 2)
      END AS percentage_variance
    FROM all_categories c
    LEFT JOIN current_by_cat cur ON cur.category_name = c.category_name
    LEFT JOIN previous_by_cat prev ON prev.category_name = c.category_name
  ),
  totals AS (
    SELECT
      COALESCE((SELECT sum(current_spend) FROM category_join), 0)::numeric AS total_spend,
      COALESCE((SELECT sum(previous_spend) FROM category_join), 0)::numeric AS previous_spend,
      COALESCE((SELECT count(DISTINCT invoice_id) FROM current_rows), 0)::bigint AS invoice_count
  ),
  largest_vendor_by_cat AS (
    SELECT DISTINCT ON (category_name)
      category_name,
      vendor_name,
      round(sum(amount)::numeric, 2) AS vendor_spend
    FROM current_rows
    GROUP BY category_name, vendor_name
    ORDER BY category_name, sum(amount) DESC
  ),
  budget_by_cat AS (
    SELECT
      bt.category AS category_name,
      round(sum(bt.target_amount)::numeric, 2) AS budget_amount
    FROM public.budget_targets bt
    WHERE bt.organization_id = v_org_id
      AND bt.period_start <= p_date_to
      AND bt.period_end >= p_date_from
    GROUP BY bt.category
  ),
  table_enriched AS (
    SELECT
      cj.*,
      CASE
        WHEN t.total_spend = 0 THEN 0
        ELSE round((cj.current_spend / t.total_spend) * 100, 2)
      END AS percentage_of_total,
      CASE
        WHEN cj.invoice_count = 0 THEN 0
        ELSE round(cj.current_spend / cj.invoice_count, 2)
      END AS average_invoice_value,
      lv.vendor_name AS largest_vendor,
      bb.budget_amount,
      CASE
        WHEN bb.budget_amount IS NULL THEN NULL
        ELSE round(cj.current_spend - bb.budget_amount, 2)
      END AS budget_variance,
      CASE
        WHEN cj.percentage_variance IS NULL THEN 'new'
        WHEN cj.percentage_variance > 5 THEN 'up'
        WHEN cj.percentage_variance < -5 THEN 'down'
        ELSE 'flat'
      END AS trend_status
    FROM category_join cj
    CROSS JOIN totals t
    LEFT JOIN largest_vendor_by_cat lv ON lv.category_name = cj.category_name
    LEFT JOIN budget_by_cat bb ON bb.category_name = cj.category_name
  ),
  ranked AS (
    SELECT *
    FROM table_enriched
    ORDER BY current_spend DESC
  ),
  summary_calc AS (
    SELECT
      t.total_spend,
      t.previous_spend,
      (t.total_spend - t.previous_spend) AS absolute_change,
      CASE
        WHEN t.previous_spend = 0 AND t.total_spend = 0 THEN 0::numeric
        WHEN t.previous_spend = 0 THEN NULL
        ELSE round(((t.total_spend - t.previous_spend) / abs(t.previous_spend)) * 100, 2)
      END AS percentage_change,
      t.invoice_count,
      CASE
        WHEN t.invoice_count = 0 THEN 0
        ELSE round(t.total_spend / t.invoice_count, 2)
      END AS average_invoice_value,
      (SELECT count(*) FROM ranked WHERE current_spend > 0)::int AS active_category_count,
      COALESCE((
        SELECT round((sum(s.current_spend) / NULLIF(t.total_spend, 0)) * 100, 2)
        FROM (SELECT current_spend FROM ranked ORDER BY current_spend DESC LIMIT 3) s
      ), 0) AS top_three_concentration_percentage
    FROM totals t
  ),
  largest AS (
    SELECT jsonb_build_object(
      'category', r.category_name,
      'spend', r.current_spend,
      'percentageOfTotal', r.percentage_of_total
    ) AS obj
    FROM ranked r
    WHERE r.current_spend > 0
    ORDER BY r.current_spend DESC
    LIMIT 1
  ),
  fastest AS (
    SELECT jsonb_build_object(
      'category', r.category_name,
      'currentSpend', r.current_spend,
      'previousSpend', r.previous_spend,
      'percentageChange', r.percentage_variance,
      'absoluteChange', r.absolute_variance
    ) AS obj
    FROM ranked r
    CROSS JOIN summary_calc sc
    WHERE r.current_spend >= GREATEST(100::numeric, sc.total_spend * 0.01)
      AND r.percentage_variance IS NOT NULL
    ORDER BY r.percentage_variance DESC
    LIMIT 1
  ),
  over_budget AS (
    SELECT count(*)::int AS cnt
    FROM ranked r
    WHERE r.budget_amount IS NOT NULL
      AND r.current_spend > r.budget_amount
  ),
  -- Distribution: top 8 + Other
  dist_ranked AS (
    SELECT
      category_name,
      current_spend,
      row_number() OVER (ORDER BY current_spend DESC) AS rn
    FROM ranked
    WHERE current_spend > 0
  ),
  distribution AS (
    SELECT category_name AS category, current_spend AS spend, false AS is_other
    FROM dist_ranked
    WHERE rn <= 8
    UNION ALL
    SELECT 'Other', COALESCE(sum(current_spend), 0), true
    FROM dist_ranked
    WHERE rn > 8
    HAVING sum(current_spend) > 0
  ),
  pareto AS (
    SELECT
      category_name AS category,
      current_spend AS spend,
      row_number() OVER (ORDER BY current_spend DESC) AS rank,
      round((current_spend / NULLIF(sum(current_spend) OVER (), 0)) * 100, 2) AS share_percentage,
      round((sum(current_spend) OVER (ORDER BY current_spend DESC rows unbounded preceding) / NULLIF(sum(current_spend) OVER (), 0)) * 100, 2) AS cumulative_percentage
    FROM ranked
    WHERE current_spend > 0
  ),
  -- Trend buckets for top categories
  top_trend_cats AS (
    SELECT category_name
    FROM ranked
    WHERE current_spend > 0
      AND (
        p_trend_categories IS NULL
        OR cardinality(p_trend_categories) = 0
        OR category_name = ANY (p_trend_categories)
      )
    ORDER BY current_spend DESC
    LIMIT CASE
      WHEN p_trend_categories IS NOT NULL AND cardinality(p_trend_categories) > 0 THEN 20
      ELSE 5
    END
  ),
  bucketed AS (
    SELECT
      CASE v_granularity
        WHEN 'day' THEN cr.invoice_date::text
        WHEN 'week' THEN to_char(date_trunc('week', cr.invoice_date::timestamp), 'IYYY-"W"IW')
        ELSE to_char(date_trunc('month', cr.invoice_date::timestamp), 'YYYY-MM')
      END AS bucket,
      CASE v_granularity
        WHEN 'day' THEN cr.invoice_date
        WHEN 'week' THEN date_trunc('week', cr.invoice_date::timestamp)::date
        ELSE date_trunc('month', cr.invoice_date::timestamp)::date
      END AS bucket_start,
      cr.category_name,
      sum(cr.amount) AS spend
    FROM current_rows cr
    WHERE cr.category_name IN (SELECT category_name FROM top_trend_cats)
    GROUP BY 1, 2, 3
  ),
  trend_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', b.bucket,
        'bucketStart', b.bucket_start,
        'category', b.category_name,
        'spend', round(b.spend::numeric, 2)
      )
      ORDER BY b.bucket_start, b.category_name
    ), '[]'::jsonb) AS arr
    FROM bucketed b
  ),
  vendor_for_selected AS (
    SELECT
      COALESCE(p_selected_category, (SELECT category_name FROM ranked WHERE current_spend > 0 ORDER BY current_spend DESC LIMIT 1)) AS selected_category
  ),
  vendor_current AS (
    SELECT
      vfs.selected_category AS category,
      cr.vendor_id,
      cr.vendor_name AS vendor,
      round(sum(cr.amount)::numeric, 2) AS spend,
      count(DISTINCT cr.invoice_id)::bigint AS invoice_count
    FROM current_rows cr
    CROSS JOIN vendor_for_selected vfs
    WHERE cr.category_name = vfs.selected_category
    GROUP BY vfs.selected_category, cr.vendor_id, cr.vendor_name
  ),
  vendor_previous AS (
    SELECT
      pr.vendor_id,
      round(sum(pr.amount)::numeric, 2) AS spend
    FROM previous_rows pr
    CROSS JOIN vendor_for_selected vfs
    WHERE pr.category_name = vfs.selected_category
    GROUP BY pr.vendor_id
  ),
  vendor_contrib AS (
    SELECT
      vc.category,
      vc.vendor,
      vc.vendor_id,
      vc.spend,
      vc.invoice_count,
      CASE
        WHEN sum(vc.spend) OVER () = 0 THEN 0
        ELSE round((vc.spend / sum(vc.spend) OVER ()) * 100, 2)
      END AS share_percentage,
      COALESCE(vp.spend, 0) AS previous_spend,
      (vc.spend - COALESCE(vp.spend, 0)) AS absolute_change,
      CASE
        WHEN COALESCE(vp.spend, 0) = 0 AND vc.spend = 0 THEN 0::numeric
        WHEN COALESCE(vp.spend, 0) = 0 THEN NULL
        ELSE round(((vc.spend - vp.spend) / abs(vp.spend)) * 100, 2)
      END AS percentage_change
    FROM vendor_current vc
    LEFT JOIN vendor_previous vp ON vp.vendor_id IS NOT DISTINCT FROM vc.vendor_id
  ),
  filter_categories AS (
    SELECT COALESCE(jsonb_agg(DISTINCT category_name ORDER BY category_name), '[]'::jsonb) AS arr
    FROM (
      SELECT category_name FROM eligible
      UNION
      SELECT category_name FROM ranked
    ) x
  ),
  filter_vendors AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('id', vendor_id, 'name', vendor_name)
      ORDER BY vendor_name
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT DISTINCT vendor_id, vendor_name
      FROM eligible
      WHERE vendor_id IS NOT NULL
    ) v
  ),
  uncategorized_amt AS (
    SELECT COALESCE(sum(current_spend), 0)::numeric AS amount
    FROM ranked
    WHERE category_name = 'Uncategorized'
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'totalSpend', sc.total_spend,
      'previousSpend', sc.previous_spend,
      'absoluteChange', sc.absolute_change,
      'percentageChange', sc.percentage_change,
      'largestCategory', (SELECT obj FROM largest),
      'fastestGrowingCategory', (SELECT obj FROM fastest),
      'activeCategoryCount', sc.active_category_count,
      'topThreeConcentrationPercentage', sc.top_three_concentration_percentage,
      'averageInvoiceValue', sc.average_invoice_value,
      'categoriesOverBudget', CASE WHEN v_has_budget THEN (SELECT cnt FROM over_budget) ELSE NULL END,
      'invoiceCount', sc.invoice_count,
      'uncategorizedSpend', (SELECT amount FROM uncategorized_amt)
    ),
    'categoryBreakdown', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', r.category_name,
          'currentSpend', r.current_spend,
          'previousSpend', r.previous_spend,
          'absoluteVariance', r.absolute_variance,
          'percentageVariance', r.percentage_variance,
          'percentageOfTotal', r.percentage_of_total
        )
        ORDER BY r.current_spend DESC
      )
      FROM ranked r
    ), '[]'::jsonb),
    'trend', (SELECT arr FROM trend_json),
    'distribution', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', d.category,
          'spend', d.spend,
          'isOther', d.is_other,
          'percentageOfTotal', CASE WHEN sc.total_spend = 0 THEN 0 ELSE round((d.spend / sc.total_spend) * 100, 2) END
        )
        ORDER BY d.spend DESC
      )
      FROM distribution d
      CROSS JOIN summary_calc sc
    ), '[]'::jsonb),
    'pareto', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', p.category,
          'spend', p.spend,
          'rank', p.rank,
          'sharePercentage', p.share_percentage,
          'cumulativePercentage', p.cumulative_percentage
        )
        ORDER BY p.rank
      )
      FROM pareto p
    ), '[]'::jsonb),
    'vendorContribution', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', v.category,
          'vendor', v.vendor,
          'vendorId', v.vendor_id,
          'spend', v.spend,
          'sharePercentage', v.share_percentage,
          'invoiceCount', v.invoice_count,
          'previousSpend', v.previous_spend,
          'absoluteChange', v.absolute_change,
          'percentageChange', v.percentage_change
        )
        ORDER BY v.spend DESC
      )
      FROM vendor_contrib v
    ), '[]'::jsonb),
    'tableRows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', r.category_name,
          'currentSpend', r.current_spend,
          'previousSpend', r.previous_spend,
          'absoluteVariance', r.absolute_variance,
          'percentageVariance', r.percentage_variance,
          'percentageOfTotal', r.percentage_of_total,
          'invoiceCount', r.invoice_count,
          'vendorCount', r.vendor_count,
          'averageInvoiceValue', r.average_invoice_value,
          'largestVendor', r.largest_vendor,
          'budget', r.budget_amount,
          'budgetVariance', r.budget_variance,
          'trendStatus', r.trend_status
        )
        ORDER BY r.current_spend DESC
      )
      FROM ranked r
    ), '[]'::jsonb),
    'insights', '[]'::jsonb,
    'metadata', jsonb_build_object(
      'currency', 'USD',
      'timezone', v_tz,
      'dataFreshness', to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD HH24:MI'),
      'hasBudgetData', v_has_budget,
      'granularity', v_granularity,
          'spendDefinition', 'Net purchasing spend from invoice line-item allocations on purchasing-eligible invoices (approved/scheduled/partially_paid/paid or matching ap_status), dated by invoice_date. Credits reduce allocation amounts when present. Excludes deleted, rejected, and duplicate invoices.',
      'filterOptions', jsonb_build_object(
        'categories', (SELECT arr FROM filter_categories),
        'vendors', (SELECT arr FROM filter_vendors)
      ),
      'selectedCategory', (SELECT selected_category FROM vendor_for_selected)
    )
  )
  INTO v_result
  FROM summary_calc sc;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

-- Drill-down: vendors, products, invoices for one category
CREATE OR REPLACE FUNCTION public.get_category_performance_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_category text := COALESCE(NULLIF(trim(p_category), ''), 'Uncategorized');
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  WITH eligible AS (
    SELECT
      ia.invoice_id,
      ia.amount,
      COALESCE(NULLIF(trim(ia.category_name), ''), 'Uncategorized') AS category_name,
      COALESCE(ia.location_id, i.location_id) AS effective_location_id,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      i.invoice_number,
      i.status,
      i.location_id,
      l.name AS location_name
    FROM public.invoice_allocations ia
    JOIN public.invoices i ON i.id = ia.invoice_id
    LEFT JOIN public.locations l ON l.id = COALESCE(ia.location_id, i.location_id)
    WHERE ia.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND ia.allocation_type = 'line_items'
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND COALESCE(NULLIF(trim(ia.category_name), ''), 'Uncategorized') = v_category
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR COALESCE(ia.location_id, i.location_id) = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
  ),
  current_rows AS (
    SELECT * FROM eligible
    WHERE invoice_date >= p_date_from AND invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM eligible
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND invoice_date >= p_comparison_date_from
      AND invoice_date <= p_comparison_date_to
  ),
  summary AS (
    SELECT
      round(COALESCE(sum(amount), 0)::numeric, 2) AS total_spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      count(DISTINCT vendor_id) FILTER (WHERE vendor_id IS NOT NULL)::bigint AS vendor_count
    FROM current_rows
  ),
  prev_total AS (
    SELECT round(COALESCE(sum(amount), 0)::numeric, 2) AS previous_spend
    FROM previous_rows
  ),
  vendors AS (
    SELECT
      cr.vendor_id,
      cr.vendor_name AS vendor,
      round(sum(cr.amount)::numeric, 2) AS spend,
      count(DISTINCT cr.invoice_id)::bigint AS invoice_count,
      COALESCE((
        SELECT round(sum(pr.amount)::numeric, 2)
        FROM previous_rows pr
        WHERE pr.vendor_id IS NOT DISTINCT FROM cr.vendor_id
      ), 0) AS previous_spend
    FROM current_rows cr
    GROUP BY cr.vendor_id, cr.vendor_name
  ),
  products AS (
    SELECT *
    FROM (
      SELECT
        COALESCE(p.id, ili.internal_product_id) AS product_id,
        COALESCE(p.name, ili.item_name, 'Unknown product') AS product,
        round(sum(COALESCE(ili.quantity, 0))::numeric, 4) AS quantity_purchased,
        (array_agg(ili.unit_price ORDER BY i.invoice_date DESC NULLS LAST))[1] AS current_unit_price,
        CASE WHEN sum(COALESCE(ili.quantity, 0)) = 0 THEN 0
             ELSE round(sum(COALESCE(ili.total_price, 0)) / NULLIF(sum(COALESCE(ili.quantity, 0)), 0), 4)
        END AS average_unit_price,
        round(sum(COALESCE(ili.total_price, 0))::numeric, 2) AS total_spend,
        (array_agg(COALESCE(i.vendor_name, 'Unknown vendor') ORDER BY i.invoice_date DESC NULLS LAST))[1] AS vendor
      FROM public.invoices i
      JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
      LEFT JOIN public.products p ON p.id = ili.internal_product_id
      WHERE i.organization_id = v_org_id
        AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
        AND i.invoice_date >= p_date_from
        AND i.invoice_date <= p_date_to
        AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
        AND COALESCE(NULLIF(trim(COALESCE(p.category, '')), ''), 'Uncategorized') = v_category
        AND (
          p_location_ids IS NULL OR cardinality(p_location_ids) = 0
          OR i.location_id = ANY (p_location_ids)
        )
        AND (
          p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
          OR i.vendor_id = ANY (p_vendor_ids)
        )
      GROUP BY COALESCE(p.id, ili.internal_product_id), COALESCE(p.name, ili.item_name, 'Unknown product')
      ORDER BY sum(COALESCE(ili.total_price, 0)) DESC
      LIMIT 200
    ) ranked_products
  ),
  invoices AS (
    SELECT
      cr.invoice_id,
      cr.invoice_number,
      cr.invoice_date,
      cr.vendor_name AS vendor,
      round(sum(cr.amount)::numeric, 2) AS amount,
      cr.status,
      cr.location_name AS location
    FROM current_rows cr
    GROUP BY cr.invoice_id, cr.invoice_number, cr.invoice_date, cr.vendor_name, cr.status, cr.location_name
    ORDER BY cr.invoice_date DESC
    LIMIT 500
  )
  SELECT jsonb_build_object(
    'category', v_category,
    'summary', jsonb_build_object(
      'totalSpend', s.total_spend,
      'previousSpend', pt.previous_spend,
      'absoluteChange', s.total_spend - pt.previous_spend,
      'percentageChange', CASE
        WHEN pt.previous_spend = 0 AND s.total_spend = 0 THEN 0
        WHEN pt.previous_spend = 0 THEN NULL
        ELSE round(((s.total_spend - pt.previous_spend) / abs(pt.previous_spend)) * 100, 2)
      END,
      'invoiceCount', s.invoice_count,
      'vendorCount', s.vendor_count,
      'averageInvoiceValue', CASE WHEN s.invoice_count = 0 THEN 0 ELSE round(s.total_spend / s.invoice_count, 2) END
    ),
    'vendors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'vendor', v.vendor,
          'vendorId', v.vendor_id,
          'spend', v.spend,
          'sharePercentage', CASE WHEN s.total_spend = 0 THEN 0 ELSE round((v.spend / s.total_spend) * 100, 2) END,
          'invoiceCount', v.invoice_count,
          'averageInvoice', CASE WHEN v.invoice_count = 0 THEN 0 ELSE round(v.spend / v.invoice_count, 2) END,
          'absoluteChange', v.spend - v.previous_spend,
          'percentageChange', CASE
            WHEN v.previous_spend = 0 AND v.spend = 0 THEN 0
            WHEN v.previous_spend = 0 THEN NULL
            ELSE round(((v.spend - v.previous_spend) / abs(v.previous_spend)) * 100, 2)
          END
        )
        ORDER BY v.spend DESC
      )
      FROM vendors v
      CROSS JOIN summary s
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'product', p.product,
          'productId', p.product_id,
          'quantityPurchased', p.quantity_purchased,
          'currentUnitPrice', p.current_unit_price,
          'averageUnitPrice', p.average_unit_price,
          'totalSpend', p.total_spend,
          'vendor', p.vendor,
          'priceChange', CASE
            WHEN p.average_unit_price IS NULL OR p.current_unit_price IS NULL THEN NULL
            ELSE round(p.current_unit_price - p.average_unit_price, 4)
          END
        )
      )
      FROM products p
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'invoiceId', i.invoice_id,
          'invoiceNumber', i.invoice_number,
          'date', i.invoice_date,
          'vendor', i.vendor,
          'amount', i.amount,
          'status', i.status,
          'location', i.location
        )
        ORDER BY i.invoice_date DESC
      )
      FROM invoices i
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM summary s
  CROSS JOIN prev_total pt;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_purchasing_spend_invoice(text, text, timestamptz)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

-- Partial index for active (non-deleted) invoices by org + invoice_date.
-- Name reflects the predicate; deleted_at is not an indexed column.
CREATE INDEX IF NOT EXISTS idx_invoices_org_invoice_date_not_deleted
  ON public.invoices (organization_id, invoice_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_type
  ON public.invoice_allocations (invoice_id, allocation_type);

CREATE INDEX IF NOT EXISTS idx_invoice_allocations_org_category
  ON public.invoice_allocations (organization_id, category_name);

NOTIFY pgrst, 'reload schema';

COMMIT;
