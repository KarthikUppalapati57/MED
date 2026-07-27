BEGIN;

-- Final-state guard after 20260727020000. Normal authenticated Performance
-- clients must use the single-location wrappers, which assert the active
-- organization -> brand -> location hierarchy. Keep the shared base functions
-- available to service_role and to the SECURITY DEFINER wrappers only.
REVOKE EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
