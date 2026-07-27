-- 20260727010000: Close the same scope-trust gap that 20260726000005 fixed for 6 report RPCs,
-- found in 6 more via a direct pg_proc audit of every SECURITY DEFINER function taking a
-- tenant-scope parameter. Each of these took org_id/location_id as a plain argument and used it
-- to filter results with NO check that it matched the caller's real session -- any authenticated
-- user could pass any organization's (or, for get_labor_schedule_variance, ANY tenant's, since it
-- had no org parameter at all and NULL location_id aggregated across the whole platform) id and
-- get that data back. Fix mirrors the guard clause already used correctly by sibling functions in
-- this same database (get_role_dashboard_summary, get_cross_location_benchmarks): validate the
-- parameter against get_my_org()/get_auth_org() (or get_my_accessible_location_ids() where there's
-- no org parameter), unless the caller is platform_admin. No other logic in any of these 6
-- functions is changed.
--
-- Deliberately NOT touched here (found in the same audit, tracked separately, needs a product
-- decision rather than an unambiguous-bug fix): get_cross_location_benchmarks, get_location_benchmarks,
-- get_menu_engineering_data, get_labor_forecast check org membership but not location-level role
-- restriction, so a location_manager/ground_staff confined to one location can see sibling
-- locations' benchmarks within their own org -- same shape as the still-undeployed
-- require_exact_location_match_for_org_wide_roles migration, and shouldn't be decided unilaterally
-- in an urgent-fix pass. get_inventory_totals reads org from auth.jwt() instead of the
-- profiles-based resolver this codebase otherwise standardized on. get_product_purchase_report
-- defaults to the caller's own org but doesn't hard-block an explicitly-passed foreign org_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_labor_schedule_variance(p_start_date date, p_end_date date, p_location_id uuid)
 RETURNS TABLE(date date, projected_sales numeric, scheduled_labor numeric, suggested_labor numeric, variance_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'A specific location is required for this report.';
  END IF;
  IF NOT public.is_platform_admin() AND p_location_id NOT IN (SELECT public.get_my_accessible_location_ids()) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this location''s data.';
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  ),
  daily_sales AS (
    SELECT
      m.date,
      SUM(m.total_revenue) as projected_sales
    FROM public.mv_daily_sales_summary m
    WHERE m.date >= p_start_date AND m.date <= p_end_date
      AND (p_location_id IS NULL OR m.location_id = p_location_id)
    GROUP BY m.date
  ),
  daily_labor AS (
    SELECT
      s.shift_start::date AS date,
      SUM(s.labor_cost) as scheduled_labor
    FROM public.employee_shifts s
    WHERE s.shift_start >= p_start_date AND s.shift_start <= p_end_date
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY s.shift_start::date
  )
  SELECT
    ds.d AS date,
    COALESCE(s.projected_sales, 0) AS projected_sales,
    COALESCE(l.scheduled_labor, 0) AS scheduled_labor,
    (COALESCE(s.projected_sales, 0) * 0.25)::numeric(15,2) AS suggested_labor,
    (COALESCE(l.scheduled_labor, 0) - (COALESCE(s.projected_sales, 0) * 0.25))::numeric(15,2) AS variance_amount
  FROM date_series ds
  LEFT JOIN daily_sales s ON ds.d = s.date
  LEFT JOIN daily_labor l ON ds.d = l.date
  ORDER BY ds.d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_performance_dashboard_metrics(p_organization_id uuid, p_start_date date, p_end_date date, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF NOT public.is_platform_admin() AND public.get_my_org() != p_organization_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_pnl_summary(p_org_id uuid, p_start_date date, p_end_date date, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_revenue NUMERIC(15,2) := 0;
  v_total_labor NUMERIC(15,2) := 0;
  v_total_cogs_allocated NUMERIC(15,2) := 0;
  v_total_invoices_raw NUMERIC(15,2) := 0;
  v_total_cogs NUMERIC(15,2) := 0;
BEGIN
  IF NOT public.is_platform_admin() AND public.get_my_org() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
  END IF;

  SELECT COALESCE(SUM(total_revenue), 0) INTO v_total_revenue
  FROM public.mv_daily_sales_summary
  WHERE organization_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id);

  SELECT COALESCE(SUM(labor_cost), 0) INTO v_total_labor
  FROM public.employee_shifts
  WHERE organization_id = p_org_id
    AND shift_start >= p_start_date
    AND shift_start <= p_end_date
    AND (p_location_id IS NULL OR location_id = p_location_id);

  SELECT COALESCE(SUM(a.amount), 0) INTO v_total_cogs_allocated
  FROM public.invoice_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.organization_id = p_org_id
    AND a.allocation_type = 'line_items'
    AND i.invoice_date >= p_start_date
    AND i.invoice_date <= p_end_date
    AND (p_brand_id IS NULL OR i.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR i.location_id = p_location_id);

  IF v_total_cogs_allocated > 0 THEN
    v_total_cogs := v_total_cogs_allocated;
  ELSE
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_invoices_raw
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND invoice_date >= p_start_date
      AND invoice_date <= p_end_date
      AND status != 'void'
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id);

    v_total_cogs := v_total_invoices_raw;
  END IF;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'total_labor_cost', v_total_labor,
    'total_cogs', v_total_cogs,
    'prime_cost', (v_total_cogs + v_total_labor)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_dashboard_summary(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_products bigint, inventoried_count bigint, tax_exempt_count bigint, category_count bigint, missing_product_id_count bigint, uncategorized_count bigint, unmapped_vendor_item_count bigint, price_variance_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scoped AS (
    SELECT *
    FROM public.products p
    WHERE p.organization_id = p_organization_id
      AND (public.is_platform_admin() OR p_organization_id = public.get_auth_org())
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_inventoried IS TRUE)::bigint,
    COUNT(*) FILTER (WHERE is_tax_exempt IS TRUE)::bigint,
    COUNT(DISTINCT NULLIF(accounting_category, ''))::bigint,
    COUNT(*) FILTER (WHERE COALESCE(product_id, '') = '')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(category, '') = '' OR category = 'Uncategorized')::bigint,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.vendor_item_mappings vim
        WHERE vim.internal_product_id = scoped.id
          AND vim.organization_id = scoped.organization_id
      )
    )::bigint,
    0::bigint
  FROM scoped;
$function$;

CREATE OR REPLACE FUNCTION public.get_flagged_vendor_items(p_organization_id uuid)
 RETURNS TABLE(id uuid, vendor_item_name text, vendor_name text, internal_product_id uuid, internal_product_name text, previous_price numeric, latest_price numeric, variance_percent numeric, invoice_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NOT public.is_platform_admin() AND public.get_my_org() != p_organization_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
    END IF;

    RETURN QUERY
    SELECT
        vi.id,
        vi.vendor_item_name,
        v.name AS vendor_name,
        vim.internal_product_id,
        p.name AS internal_product_name,
        vi.previous_price,
        vi.last_price AS latest_price,
        vi.last_price_change_percent AS variance_percent,
        i.invoice_date::timestamptz
    FROM public.vendor_items vi
    JOIN public.vendors v ON vi.vendor_id = v.id
    LEFT JOIN public.vendor_item_mappings vim ON vim.vendor_item_id = vi.id
    LEFT JOIN public.products p ON vim.internal_product_id = p.id
    LEFT JOIN public.invoices i ON vi.last_invoice_id = i.id
    WHERE vi.organization_id = p_organization_id
      AND vi.price_variance_flag = true
    ORDER BY vi.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_verification_queue(p_organization_id uuid, p_brand_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
 RETURNS TABLE(internal_product_id uuid, product_id text, name text, description text, category text, accounting_category text, suggested_category text, suggested_accounting_category text, category_confidence numeric, category_review_status text, latest_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.description,
    p.category,
    p.accounting_category,
    NULL::text,
    NULL::text,
    NULL::numeric,
    'verified'::text,
    p.latest_price
  FROM public.products p
  WHERE p.organization_id = p_organization_id
    AND (public.is_platform_admin() OR p_organization_id = public.get_auth_org())
    AND p.deleted_at IS NULL
    AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
    AND (
      COALESCE(NULLIF(p_search, ''), NULL) IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
      OR p.product_id ILIKE '%' || p_search || '%'
    )
  ORDER BY p.updated_at DESC
  LIMIT 100;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
