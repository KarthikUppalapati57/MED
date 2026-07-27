BEGIN;

DROP FUNCTION IF EXISTS public.get_location_performance_overview_rollup(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.with_performance_limit_metadata(jsonb, text, integer, integer, integer, timestamptz, integer);
DROP FUNCTION IF EXISTS public.limit_performance_jsonb_array(jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.assert_performance_report_bounds(date, date, integer);

DROP INDEX IF EXISTS public.idx_perf_invoices_org_loc_date_active;
DROP INDEX IF EXISTS public.idx_perf_payments_org_loc_payment_date_active;
DROP INDEX IF EXISTS public.idx_perf_allocations_org_loc_invoice_category;
DROP INDEX IF EXISTS public.idx_perf_line_items_org_product_invoice;
DROP INDEX IF EXISTS public.idx_perf_inventory_org_loc_active;
DROP INDEX IF EXISTS public.idx_perf_inventory_movements_org_loc_date;
DROP INDEX IF EXISTS public.idx_perf_count_sessions_org_loc_completed;
DROP INDEX IF EXISTS public.idx_perf_wastage_org_loc_date_active;
DROP INDEX IF EXISTS public.idx_perf_products_hierarchy_active;
DROP INDEX IF EXISTS public.idx_perf_recipes_hierarchy_active;

NOTIFY pgrst, 'reload schema';

COMMIT;
