BEGIN;

-- Phase 5: Performance budgets are exact-location, exact-period category
-- targets. PostgreSQL ordinary UNIQUE constraints treat NULL values as
-- distinct, so protect logical rows with normalized scope keys.
DO $$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_duplicate_count
  FROM (
    SELECT 1
    FROM public.budget_targets
    GROUP BY
      organization_id,
      COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
      period_start,
      period_end,
      btrim(category)
    HAVING count(*) > 1
  ) duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Duplicate logical budget_targets rows exist; resolve duplicates before applying Performance budget scope protection. Duplicate groups: %',
      v_duplicate_count
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS budget_targets_logical_scope_unique_idx
  ON public.budget_targets (
    organization_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start,
    period_end,
    btrim(category)
  );

COMMENT ON INDEX public.budget_targets_logical_scope_unique_idx IS
  'Prevents duplicate Performance budget rows for organization, normalized brand/location scope, exact period, and trimmed category.';

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
DECLARE
  v_result jsonb;
  v_table_rows jsonb;
  v_categories_over_budget integer := 0;
  v_has_budget boolean := false;
  v_location_brand_id uuid;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  SELECT l.brand_id
    INTO v_location_brand_id
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.organization_id = p_organization_id
    AND l.deleted_at IS NULL;

  v_result := public.get_category_performance_report(
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

  WITH source_rows AS (
    SELECT row_data, ordinality
    FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
      WITH ORDINALITY AS source(row_data, ordinality)
  ),
  exact_budgets AS (
    SELECT
      btrim(bt.category) AS category,
      bt.target_amount::numeric AS target_amount
    FROM public.budget_targets bt
    WHERE bt.organization_id = p_organization_id
      AND bt.location_id = p_location_id
      AND bt.brand_id IS NOT DISTINCT FROM v_location_brand_id
      AND bt.period_start = p_date_from
      AND bt.period_end = p_date_to
  ),
  enriched_rows AS (
    SELECT
      source_rows.ordinality,
      source_rows.row_data,
      exact_budgets.target_amount,
      NULLIF(source_rows.row_data->>'currentSpend', '')::numeric AS current_spend
    FROM source_rows
    LEFT JOIN exact_budgets
      ON exact_budgets.category = btrim(source_rows.row_data->>'category')
  )
  SELECT
    COALESCE(jsonb_agg(
      row_data || jsonb_build_object(
        'budget', target_amount,
        'budgetVariance', CASE
          WHEN target_amount IS NULL THEN NULL
          ELSE round(current_spend - target_amount, 2)
        END
      )
      ORDER BY ordinality
    ), '[]'::jsonb),
    COALESCE(count(*) FILTER (
      WHERE target_amount IS NOT NULL AND current_spend > target_amount
    ), 0)::integer,
    COALESCE(bool_or(target_amount IS NOT NULL), false)
  INTO v_table_rows, v_categories_over_budget, v_has_budget
  FROM enriched_rows;

  v_result := jsonb_set(
    COALESCE(v_result, '{}'::jsonb),
    '{tableRows}',
    v_table_rows,
    true
  );
  v_result := jsonb_set(
    v_result,
    '{summary,categoriesOverBudget}',
    to_jsonb(CASE WHEN v_has_budget THEN v_categories_over_budget ELSE NULL END),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,hasBudgetData}',
    to_jsonb(v_has_budget),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,budgetScope}',
    to_jsonb('exact_location_brand_period_category'::text),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{metadata,budgetPeriodRule}',
    to_jsonb('exact_period_match'::text),
    true
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) IS
  'Secured single-location Performance Category report with exact active-location brand, location, period, and category budget matching.';

NOTIFY pgrst, 'reload schema';

COMMIT;
