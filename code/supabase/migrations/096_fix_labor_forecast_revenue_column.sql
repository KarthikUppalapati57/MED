-- 096: Fix labor forecast RPC against current POS sales schema
-- pos_sales_data stores sales in revenue, not total_sales.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_labor_forecast(p_location_id UUID)
RETURNS TABLE (
    date TEXT,
    "salesForecast" NUMERIC,
    "scheduledLabor" NUMERIC,
    "suggestedLabor" NUMERIC
) AS $$
DECLARE
    avg_daily_sales NUMERIC;
BEGIN
    IF public.get_my_org() != (SELECT organization_id FROM public.locations WHERE id = p_location_id) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this location''s data.';
    END IF;

    SELECT COALESCE(AVG(revenue), 3000) INTO avg_daily_sales
    FROM public.pos_sales_data
    WHERE location_id = p_location_id
      AND date >= (now() - interval '30 days')::date;

    RETURN QUERY
    WITH dates AS (
        SELECT generate_series(
            date_trunc('day', now()),
            date_trunc('day', now() + interval '6 days'),
            interval '1 day'
        ) AS d
    ),
    scheduled AS (
        SELECT
            date_trunc('day', es.start_time) AS shift_date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(es.end_time, es.start_time) - es.start_time)) / 3600 * COALESCE(e.hourly_rate, 15)), 0) AS labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id = p_location_id
        GROUP BY date_trunc('day', es.start_time)
    )
    SELECT
        to_char(d.d, 'Mon DD') AS date,
        ROUND(avg_daily_sales * (1 + (random() * 0.4 - 0.2))::NUMERIC, 2) AS "salesForecast",
        ROUND(COALESCE(s.labor_cost::NUMERIC, 0), 2) AS "scheduledLabor",
        ROUND(avg_daily_sales * 0.28, 2) AS "suggestedLabor"
    FROM dates d
    LEFT JOIN scheduled s ON d.d = s.shift_date
    ORDER BY d.d ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
