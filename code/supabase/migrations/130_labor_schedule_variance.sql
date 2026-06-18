-- Migration 130: Labor Schedule Variance

-- Drop if exists to avoid return type mismatch errors on replace
DROP FUNCTION IF EXISTS public.get_labor_schedule_variance(DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION public.get_labor_schedule_variance(
  p_start_date DATE,
  p_end_date DATE,
  p_location_id UUID
)
RETURNS TABLE (
  date DATE,
  projected_sales NUMERIC(15,2),
  scheduled_labor NUMERIC(15,2),
  suggested_labor NUMERIC(15,2),
  variance_amount NUMERIC(15,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    -- Suggested labor is typically ~25% of sales
    (COALESCE(s.projected_sales, 0) * 0.25)::numeric(15,2) AS suggested_labor,
    -- Variance is scheduled minus suggested (positive = overstaffed, negative = understaffed)
    (COALESCE(l.scheduled_labor, 0) - (COALESCE(s.projected_sales, 0) * 0.25))::numeric(15,2) AS variance_amount
  FROM date_series ds
  LEFT JOIN daily_sales s ON ds.d = s.date
  LEFT JOIN daily_labor l ON ds.d = l.date
  ORDER BY ds.d;
END;
$$;
