-- Acceptance test for 20260727020000_restore_performance_report_rpc_execute_grants.sql.
-- These report functions are SECURITY INVOKER for scope safety, but the app's
-- authenticated users still need EXECUTE privileges to open Performance tabs.
BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.get_category_performance_report(uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[])', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_category_performance_report');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_category_performance_drilldown(uuid, text, uuid[], date, date, date, date, uuid[], text)', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_category_performance_drilldown');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_price_movers_report(uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid)', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_price_movers_report');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_price_movers_drilldown(uuid, uuid, text, uuid[], date, date, date, date, uuid[], text)', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_price_movers_drilldown');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_inventory_usage_report(uuid, uuid[], date, date, text[], text)', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_inventory_usage_report');
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_inventory_usage_drilldown(uuid, uuid, uuid, uuid[], date, date, text)', 'EXECUTE') THEN
    v_missing := array_append(v_missing, 'get_inventory_usage_drilldown');
  END IF;

  ASSERT cardinality(v_missing) = 0,
    format('authenticated missing EXECUTE grants on performance report RPCs: %s', array_to_string(v_missing, ', '));

  RAISE NOTICE 'performance_report_rpc_execute_grants_acceptance: PASSED';
END $$;

ROLLBACK;