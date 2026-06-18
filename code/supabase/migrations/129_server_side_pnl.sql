-- Migration 124: Server-Side PnL Aggregation RPC

-- Create or Replace the RPC for PnL Summary
CREATE OR REPLACE FUNCTION public.get_pnl_summary(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_brand_id UUID DEFAULT NULL,
  p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_revenue NUMERIC(15,2) := 0;
  v_total_labor NUMERIC(15,2) := 0;
  v_total_cogs_allocated NUMERIC(15,2) := 0;
  v_total_invoices_raw NUMERIC(15,2) := 0;
  v_total_cogs NUMERIC(15,2) := 0;
BEGIN
  -- 1. Calculate Total Revenue from mv_daily_sales_summary
  SELECT COALESCE(SUM(total_revenue), 0) INTO v_total_revenue
  FROM public.mv_daily_sales_summary
  WHERE organization_id = p_org_id
    AND date >= p_start_date 
    AND date <= p_end_date
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND (p_location_id IS NULL OR location_id = p_location_id);

  -- 2. Calculate Total Labor from employee_shifts
  SELECT COALESCE(SUM(labor_cost), 0) INTO v_total_labor
  FROM public.employee_shifts
  WHERE organization_id = p_org_id
    AND shift_start >= p_start_date 
    AND shift_start <= p_end_date
    AND (p_location_id IS NULL OR location_id = p_location_id);

  -- 3. Calculate Total COGS 
  -- We first check invoice_allocations specifically for 'line_items' within the period.
  -- Because invoice_allocations lacks a date field natively (unless joined to invoices),
  -- we join it to invoices here to apply the date filter.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_total_cogs_allocated
  FROM public.invoice_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.organization_id = p_org_id
    AND a.allocation_type = 'line_items'
    AND i.invoice_date >= p_start_date
    AND i.invoice_date <= p_end_date
    AND (p_brand_id IS NULL OR i.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR i.location_id = p_location_id);

  -- If allocated COGS is zero, we fallback to raw total_amount of invoices
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
$$;
