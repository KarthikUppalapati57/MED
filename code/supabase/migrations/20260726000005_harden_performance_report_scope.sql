BEGIN;

-- Performance analytics are location-scoped in the application. Run these report
-- RPCs as the caller so table RLS and tenant_scope_visible() enforce the active
-- organization/location instead of relying on client-supplied parameters alone.
ALTER FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) SECURITY INVOKER;

ALTER FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';

COMMIT;