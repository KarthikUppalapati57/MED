-- Migration 061: Executive Dashboards RPCs
-- Adds RPCs to aggregate data for Cross-Location Benchmarking and Labor Forecasting

BEGIN;

-- 1. Cross-Location Benchmarks
-- Calculates gross sales, labor costs, and COGS per location for a given organization over the last 30 days
CREATE OR REPLACE FUNCTION public.get_cross_location_benchmarks(p_org_id UUID)
RETURNS TABLE (
    name TEXT,
    sales NUMERIC,
    "laborCost" NUMERIC,
    cogs NUMERIC
) AS $$
BEGIN
    IF public.get_my_org() != p_org_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
    END IF;

    RETURN QUERY
    WITH DateRange AS (
        SELECT (now() - interval '30 days') AS start_date
    ),
    LocationSales AS (
        SELECT 
            l.id as location_id,
            l.name as location_name,
            COALESCE(SUM(ps.total_sales), 0) as sales,
            COALESCE(SUM(ps.total_cost), 0) as cogs
        FROM public.locations l
        LEFT JOIN public.pos_sales_data ps 
            ON l.id = ps.location_id 
            AND ps.date >= (SELECT start_date FROM DateRange)
        WHERE l.organization_id = p_org_id
        GROUP BY l.id, l.name
    ),
    LocationLabor AS (
        SELECT 
            l.id as location_id,
            COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 0) as labor_cost
        FROM public.locations l
        LEFT JOIN public.employees e ON l.id = e.location_id
        LEFT JOIN public.employee_shifts es 
            ON e.id = es.employee_id 
            AND es.start_time >= (SELECT start_date FROM DateRange)
        WHERE l.organization_id = p_org_id
        GROUP BY l.id
    )
    SELECT 
        ls.location_name as name,
        ROUND(ls.sales, 2) as sales,
        ROUND(ll.labor_cost::NUMERIC, 2) as "laborCost",
        ROUND(ls.cogs, 2) as cogs
    FROM LocationSales ls
    JOIN LocationLabor ll ON ls.location_id = ll.location_id
    ORDER BY ls.sales DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Labor Forecast
-- Returns forecasted sales vs scheduled labor for the next 7 days
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
    -- Security Check: Verify user belongs to the org that owns this location
    IF public.get_my_org() != (SELECT organization_id FROM public.locations WHERE id = p_location_id) THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this location''s data.';
    END IF;

    -- Base calculation on last 30 days avg (mock forecast logic for demo)
    SELECT COALESCE(AVG(total_sales), 3000) INTO avg_daily_sales
    FROM public.pos_sales_data
    WHERE location_id = p_location_id AND date >= (now() - interval '30 days');

    RETURN QUERY
    WITH Dates AS (
        SELECT generate_series(
            date_trunc('day', now()), 
            date_trunc('day', now() + interval '6 days'), 
            interval '1 day'
        ) as d
    ),
    Scheduled AS (
        SELECT 
            date_trunc('day', es.start_time) as shift_date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * COALESCE(e.hourly_rate, 15)), 0) as labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id = p_location_id
        GROUP BY date_trunc('day', es.start_time)
    )
    SELECT 
        to_char(d.d, 'Mon DD') as date,
        ROUND(avg_daily_sales * (1 + (random() * 0.4 - 0.2))::NUMERIC, 2) as "salesForecast",
        ROUND(COALESCE(s.labor_cost::NUMERIC, 0), 2) as "scheduledLabor",
        ROUND(avg_daily_sales * 0.28, 2) as "suggestedLabor" -- Target 28% labor
    FROM Dates d
    LEFT JOIN Scheduled s ON d.d = s.shift_date
    ORDER BY d.d ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
