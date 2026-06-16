-- 109: Database Monitoring & Diagnostics Setup
-- This script enables pg_stat_statements so you can actively monitor query latency
-- as the application scales.

BEGIN;

-- Enable the pg_stat_statements extension (must be run as superuser)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

-- Create a helper view for the dashboard admin to easily see the slowest queries
CREATE OR REPLACE VIEW public.vw_slow_queries AS
SELECT 
    calls,
    round((total_exec_time / calls)::numeric, 2) AS avg_time_ms,
    round(total_exec_time::numeric, 2) AS total_time_ms,
    round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS percentage_overall,
    query
FROM 
    extensions.pg_stat_statements
WHERE 
    calls > 100 -- Ignore one-off manual queries
    AND (total_exec_time / calls) > 50 -- Only flag queries taking longer than 50ms on average
ORDER BY 
    avg_time_ms DESC
LIMIT 50;

-- Grant select permission on the view to authenticated users (or restrict to admins)
GRANT SELECT ON public.vw_slow_queries TO authenticated;

COMMIT;

/*
USAGE:
Run this to reset the statistics after deploying new indexes or views:
SELECT extensions.pg_stat_statements_reset();

Run this to see your slowest queries:
SELECT * FROM public.vw_slow_queries;
*/
