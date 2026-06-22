-- code/supabase/migrations/139_analytics_hardening.sql

CREATE OR REPLACE FUNCTION get_performance_dashboard_metrics(
    p_organization_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_brand_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_sales NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_total_labor NUMERIC := 0;
    v_today_sales NUMERIC := 0;
    v_today_cogs NUMERIC := 0;
    v_today_labor NUMERIC := 0;
    v_trend_data JSONB;
    v_movers_data JSONB;
    v_category_data JSONB;
    v_pending_invoices_count INT := 0;
BEGIN
    -- 1. Sales & Trends
    SELECT 
        COALESCE(SUM(total_revenue), 0),
        COALESCE(SUM(CASE WHEN date = CURRENT_DATE THEN total_revenue ELSE 0 END), 0)
    INTO v_total_sales, v_today_sales
    FROM mv_daily_sales_summary
    WHERE organization_id = p_organization_id
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND date >= p_start_date AND date <= p_end_date;

    SELECT jsonb_agg(
        jsonb_build_object(
            'date', date,
            'name', to_char(date, 'Dy'),
            'actual', total_revenue,
            'forecast', total_revenue * 1.05
        )
    ) INTO v_trend_data
    FROM mv_daily_sales_summary
    WHERE organization_id = p_organization_id
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND date >= p_start_date AND date <= p_end_date
    ORDER BY date ASC;

    -- 2. COGS & Invoices
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(CASE WHEN invoice_date = CURRENT_DATE THEN total_amount ELSE 0 END), 0),
        COUNT(CASE WHEN status IN ('pending_review', 'validated', 'flagged') THEN 1 END)
    INTO v_total_cogs, v_today_cogs, v_pending_invoices_count
    FROM invoices
    WHERE organization_id = p_organization_id
      AND (p_brand_id IS NULL OR brand_id = p_brand_id)
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND invoice_date >= p_start_date AND invoice_date <= p_end_date;

    -- 3. Category Spend
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(category_name, 'Uncategorized'),
            'spend', amount
        )
    ) INTO v_category_data
    FROM (
        SELECT category_name, SUM(amount) as amount
        FROM invoice_allocations
        WHERE organization_id = p_organization_id
          AND (p_location_id IS NULL OR location_id = p_location_id)
        GROUP BY category_name
        ORDER BY amount DESC
    ) categories;

    -- 4. Labor
    SELECT 
        COALESCE(SUM(labor_cost), 0),
        COALESCE(SUM(CASE WHEN DATE(shift_start) = CURRENT_DATE THEN labor_cost ELSE 0 END), 0)
    INTO v_total_labor, v_today_labor
    FROM employee_shifts
    WHERE organization_id = p_organization_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND DATE(shift_start) >= p_start_date AND DATE(shift_start) <= p_end_date;

    -- 5. Top Price Movers
    -- Finds the latest and previous distinct prices for items
    SELECT jsonb_agg(
        jsonb_build_object(
            'item', item_name,
            'currentPrice', current_price,
            'previousPrice', previous_price,
            'change', ROUND(((current_price - previous_price) / previous_price * 100), 1),
            'status', CASE 
                        WHEN ((current_price - previous_price) / previous_price * 100) > 5 THEN 'critical'
                        WHEN ((current_price - previous_price) / previous_price * 100) > 0 THEN 'warning'
                        WHEN ((current_price - previous_price) / previous_price * 100) < 0 THEN 'positive'
                        ELSE 'neutral'
                      END
        )
    ) INTO v_movers_data
    FROM (
        SELECT 
            item_name,
            MAX(CASE WHEN rn = 1 THEN unit_price END) as current_price,
            MAX(CASE WHEN rn = 2 THEN unit_price END) as previous_price
        FROM (
            SELECT 
                item_name,
                unit_price,
                ROW_NUMBER() OVER(PARTITION BY item_name ORDER BY created_at DESC) as rn
            FROM (
                -- Get distinct prices chronologically
                SELECT DISTINCT ON (item_name, unit_price) 
                    item_name, unit_price, created_at
                FROM invoice_line_items
                WHERE organization_id = p_organization_id
                ORDER BY item_name, unit_price, created_at DESC
            ) distinct_prices
        ) ranked_prices
        GROUP BY item_name
        HAVING MAX(CASE WHEN rn = 1 THEN unit_price END) != MAX(CASE WHEN rn = 2 THEN unit_price END)
           AND MAX(CASE WHEN rn = 2 THEN unit_price END) > 0
        ORDER BY ABS((MAX(CASE WHEN rn = 1 THEN unit_price END) - MAX(CASE WHEN rn = 2 THEN unit_price END)) / MAX(CASE WHEN rn = 2 THEN unit_price END)) DESC
        LIMIT 50
    ) movers;

    RETURN jsonb_build_object(
        'total_sales', v_total_sales,
        'today_sales', v_today_sales,
        'total_cogs', v_total_cogs,
        'today_cogs', v_today_cogs,
        'total_labor', v_total_labor,
        'today_labor', v_today_labor,
        'prime_cost', v_total_cogs + v_total_labor,
        'pending_invoices_count', v_pending_invoices_count,
        'trend_data', COALESCE(v_trend_data, '[]'::jsonb),
        'category_data', COALESCE(v_category_data, '[]'::jsonb),
        'movers_data', COALESCE(v_movers_data, '[]'::jsonb)
    );
END;
$$;
