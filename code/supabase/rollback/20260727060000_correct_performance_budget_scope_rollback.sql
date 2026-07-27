-- MANUAL ROLLBACK ONLY.
-- Reverts Phase 5 exact budget-scope protection and restores the previous
-- location Category Performance wrapper. Run only if the Phase 5 migration
-- causes an incident and after confirming duplicate budgets cannot be written
-- through normal app paths.

BEGIN;

DROP INDEX IF EXISTS public.budget_targets_logical_scope_unique_idx;

CREATE OR REPLACE FUNCTION public.get_location_category_performance_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_selected_category text DEFAULT NULL,
  p_trend_categories text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_category_performance_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    p_timezone,
    p_selected_category,
    p_trend_categories
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
