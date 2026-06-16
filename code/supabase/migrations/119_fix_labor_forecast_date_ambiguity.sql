-- Migration 119: Fix get_labor_forecast date ambiguity

CREATE OR REPLACE FUNCTION public.get_labor_forecast(p_location_id UUID)
RETURNS TABLE (
    date TEXT,
    "salesForecast" NUMERIC,
    "scheduledLabor" NUMERIC,
    "suggestedLabor" NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    avg_daily_sales NUMERIC;
BEGIN
    IF NOT public.is_platform_admin()
       AND public.get_my_org() != (SELECT l.organization_id FROM public.locations l WHERE l.id = p_location_id) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this location data.';
    END IF;

    SELECT COALESCE(AVG(ps.revenue), 3000)
    INTO avg_daily_sales
    FROM public.pos_sales_data ps
    WHERE ps.location_id = p_location_id
      AND ps.date >= (now() - interval '30 days');

    RETURN QUERY
    WITH forecast_dates AS (
        SELECT generate_series(
            date_trunc('day', now()),
            date_trunc('day', now() + interval '6 days'),
            interval '1 day'
        ) AS forecast_day
    ),
    scheduled AS (
        SELECT
            date_trunc('day', es.start_time) AS shift_date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 0) AS labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id = p_location_id
        GROUP BY date_trunc('day', es.start_time)
    )
    SELECT
        to_char(fd.forecast_day, 'Mon DD') AS date,
        ROUND(avg_daily_sales * (1 + (random() * 0.4 - 0.2))::NUMERIC, 2) AS "salesForecast",
        ROUND(COALESCE(s.labor_cost::NUMERIC, 0), 2) AS "scheduledLabor",
        ROUND(avg_daily_sales * 0.28, 2) AS "suggestedLabor"
    FROM forecast_dates fd
    LEFT JOIN scheduled s ON fd.forecast_day = s.shift_date
    ORDER BY fd.forecast_day ASC;
END;
$$;
