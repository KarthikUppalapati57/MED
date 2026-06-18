-- supabase/migrations/134_cross_location_benchmarks.sql

CREATE OR REPLACE FUNCTION get_location_benchmarks(
  p_organization_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  location_id UUID,
  location_name TEXT,
  total_revenue NUMERIC,
  total_cogs NUMERIC,
  total_labor NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH Sales AS (
    SELECT 
      m.location_id,
      SUM(m.total_revenue) as rev
    FROM mv_daily_sales_summary m
    WHERE m.organization_id = p_organization_id
      AND m.date >= p_start_date
      AND m.date <= p_end_date
    GROUP BY m.location_id
  ),
  COGS AS (
    SELECT
      i.location_id,
      SUM(i.total_amount) as cogs
    FROM invoices i
    WHERE i.organization_id = p_organization_id
      AND i.invoice_date >= p_start_date
      AND i.invoice_date <= p_end_date
    GROUP BY i.location_id
  ),
  Labor AS (
    SELECT
      s.location_id,
      SUM(s.labor_cost) as labor
    FROM employee_shifts s
    WHERE s.organization_id = p_organization_id
      AND DATE(s.shift_start) >= p_start_date
      AND DATE(s.shift_start) <= p_end_date
    GROUP BY s.location_id
  )
  SELECT 
    l.id as location_id,
    l.name as location_name,
    COALESCE(s.rev, 0)::NUMERIC as total_revenue,
    COALESCE(c.cogs, 0)::NUMERIC as total_cogs,
    COALESCE(lab.labor, 0)::NUMERIC as total_labor
  FROM locations l
  LEFT JOIN Sales s ON l.id = s.location_id
  LEFT JOIN COGS c ON l.id = c.location_id
  LEFT JOIN Labor lab ON l.id = lab.location_id
  WHERE l.organization_id = p_organization_id
  ORDER BY COALESCE(s.rev, 0) DESC;
END;
$$;
