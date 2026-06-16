-- ============================================================
-- Migration 107: Dashboard Materialized Views (Phase 6 Optimization)
-- ============================================================

BEGIN;

-- 1. Daily Sales Materialized View
-- Pre-calculates revenue by organization, location, and day to prevent
-- hitting the massive pos_sales_data table on every dashboard load.
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_sales_summary CASCADE;
CREATE MATERIALIZED VIEW public.mv_daily_sales_summary AS
SELECT 
    ps.organization_id,
    COALESCE(l.brand_id, '00000000-0000-0000-0000-000000000000'::uuid) as brand_id,
    COALESCE(ps.location_id, '00000000-0000-0000-0000-000000000000'::uuid) as location_id,
    ps.date,
    SUM(ps.revenue) as total_revenue
FROM public.pos_sales_data ps
LEFT JOIN public.locations l ON l.id = ps.location_id
GROUP BY ps.organization_id, l.brand_id, ps.location_id, ps.date;

-- Requires a UNIQUE index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_daily_sales_summary_unique 
ON public.mv_daily_sales_summary (organization_id, brand_id, location_id, date);

-- 2. Inventory Valuation Materialized View
-- Pre-calculates the total value and low stock counts of inventory per organization
DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_valuation_summary CASCADE;
CREATE MATERIALIZED VIEW public.mv_inventory_valuation_summary AS
SELECT 
    organization_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid) as brand_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid) as location_id,
    COUNT(*) as total_items,
    SUM(current_value) as total_valuation,
    COUNT(*) FILTER (WHERE current_quantity <= COALESCE(reorder_point, 5)) as low_stock_items
FROM public.inventory
GROUP BY organization_id, brand_id, location_id;

-- Unique index for concurrent refreshes
CREATE UNIQUE INDEX idx_mv_inventory_valuation_unique 
ON public.mv_inventory_valuation_summary (organization_id, brand_id, location_id);

-- 3. Invoice Spend Materialized View
-- Pre-calculates total AP spend and unpaid invoices
DROP MATERIALIZED VIEW IF EXISTS public.mv_invoice_spend_summary CASCADE;
CREATE MATERIALIZED VIEW public.mv_invoice_spend_summary AS
SELECT 
    organization_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid) as brand_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid) as location_id,
    COALESCE(invoice_date, created_at::date) as date,
    COUNT(*) as invoice_count,
    SUM(total_amount) as total_spend,
    SUM(total_amount) FILTER (WHERE payment_status = 'unpaid' OR status = 'approved') as unpaid_amount,
    COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count
FROM public.invoices
GROUP BY organization_id, brand_id, location_id, COALESCE(invoice_date, created_at::date);

CREATE UNIQUE INDEX idx_mv_invoice_spend_unique 
ON public.mv_invoice_spend_summary (organization_id, brand_id, location_id, date);

-- 4. Create a unified refresh function
-- This function refreshes the views CONCURRENTLY (meaning zero locking/downtime for readers)
CREATE OR REPLACE FUNCTION public.refresh_dashboard_materialized_views()
RETURNS void AS $$
BEGIN
    -- Concurrent refresh ensures the dashboard never hangs while updating
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_sales_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_valuation_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_spend_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Set up pg_cron to run the refresh every 5 minutes (Requires pg_cron extension)
-- Supabase supports pg_cron natively.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule if it exists to prevent duplicates
SELECT cron.unschedule('refresh_dashboard_views') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_dashboard_views');

-- Schedule the refresh every 5 minutes
SELECT cron.schedule(
  'refresh_dashboard_views',
  '*/5 * * * *',
  $$SELECT public.refresh_dashboard_materialized_views();$$
);

COMMIT;
