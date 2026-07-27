-- 20260727020000: Restore execute grants for performance report RPCs after
-- SECURITY INVOKER hardening. The functions still run as the caller so table
-- RLS and tenant_scope_visible() enforce scope, but authenticated users must be
-- allowed to invoke the report RPCs from the Performance tabs.

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;