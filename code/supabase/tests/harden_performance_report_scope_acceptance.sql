-- Acceptance test for 20260726000005_harden_performance_report_scope.sql, written after the
-- fact -- this repo's own workflow rule requires one per migration and none existed for it.
-- What changed was purely the security mode (SECURITY DEFINER -> INVOKER) on 6 report RPCs, so
-- that RLS/tenant_scope_visible() applies to their queries instead of the functions running with
-- the owner's elevated privileges. The regression this guards against is someone reverting that
-- mode (e.g. via a future CREATE OR REPLACE that drops the ALTER) without noticing -- checked
-- directly against pg_proc rather than re-deriving each function's full report logic.
BEGIN;

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT p.proname INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_category_performance_report',
      'get_category_performance_drilldown',
      'get_price_movers_report',
      'get_price_movers_drilldown',
      'get_inventory_usage_report',
      'get_inventory_usage_drilldown'
    )
    AND p.prosecdef = true
  LIMIT 1;

  ASSERT v_bad IS NULL, format('%s is SECURITY DEFINER; harden_performance_report_scope requires SECURITY INVOKER on all 6 report RPCs', v_bad);

  RAISE NOTICE 'harden_performance_report_scope_acceptance: PASSED';
END $$;

ROLLBACK;
