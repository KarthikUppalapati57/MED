-- Re-supersedes the original 20260726000005_harden_performance_report_scope.sql intent for
-- get_price_movers_report / get_price_movers_drilldown, timestamped after every other
-- 2026-07-27 migration that touches these two functions (000001, 050000-original-attempt,
-- 070000) so this is guaranteed to run last on any future full replay/squash -- otherwise
-- 20260727070000_expose_price_mover_impact_evidence.sql's CREATE OR REPLACE (which had to
-- re-specify every attribute, including SECURITY DEFINER) would silently win the race and
-- undo this fix again.
--
-- Context: harden_performance_report_scope_acceptance.sql caught these two back on SECURITY
-- DEFINER, re-introduced by 20260727070000 when it shipped new impact-evidence logic. This is
-- not the same class of bug the original migration closed, though. Since
-- 20260727000001_strict_location_performance_security.sql, ordinary authenticated/anon callers
-- cannot reach either function at all -- EXECUTE is revoked down to service_role only, and the
-- only real entry point is get_location_price_movers_report/drilldown, which run
-- assert_performance_location_access() (exact org+location hierarchy match) before delegating
-- here. That check is what actually gates access now, not this function's own security mode.
--
-- This is purely a consistency / defense-in-depth fix: the other 4 of the original 6 report
-- RPCs (category performance, inventory usage) are still SECURITY INVOKER and were never
-- touched by the newer migrations, so leaving these two on DEFINER is an unexplained
-- inconsistency between structurally-identical, equally-gated functions. If EXECUTE is ever
-- accidentally re-granted to authenticated directly on the base function (already happened
-- once this same day, see 20260727020000_restore_performance_report_rpc_execute_grants.sql,
-- corrected by 20260727030000_resecure_performance_base_report_rpcs.sql), INVOKER means RLS
-- still backstops the existing internal tenant_scope_visible() filter; DEFINER means it
-- wouldn't. No query logic changes.

BEGIN;

ALTER FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

COMMIT;

NOTIFY pgrst, 'reload schema';
