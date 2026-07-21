-- QA-only: Category Performance Report validation queries
-- Project: hbzkntgdryvoeplzhlqu
-- Run after applying 20260721000010_category_performance_report.sql
-- Replace :org_id / dates as needed.

-- 1) Functions exist
SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_purchasing_spend_invoice',
    'get_category_performance_report',
    'get_category_performance_drilldown'
  )
ORDER BY 1;

-- 2) Indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_invoices_org_invoice_date_not_deleted',
    'idx_invoice_allocations_invoice_type',
    'idx_invoice_allocations_org_category'
  )
ORDER BY 1;

-- 3) Smoke RPC (authenticated session / service role with org context)
-- SELECT public.get_category_performance_report(
--   p_organization_id := '<org_uuid>'::uuid,
--   p_location_ids := NULL,
--   p_date_from := date_trunc('month', current_date)::date,
--   p_date_to := (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
--   p_comparison_date_from := (date_trunc('month', current_date) - interval '1 month')::date,
--   p_comparison_date_to := (date_trunc('month', current_date) - interval '1 day')::date
-- );

-- 4) Raw allocation total vs report summary.totalSpend (same eligibility)
-- WITH eligible AS (
--   SELECT ia.amount
--   FROM invoice_allocations ia
--   JOIN invoices i ON i.id = ia.invoice_id
--   WHERE ia.organization_id = '<org_uuid>'::uuid
--     AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
--     AND ia.allocation_type = 'line_items'
--     AND i.invoice_date >= date_trunc('month', current_date)::date
--     AND i.invoice_date <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date
-- )
-- SELECT round(sum(amount)::numeric, 2) AS raw_total FROM eligible;
