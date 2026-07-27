BEGIN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.locations.timezone IS
  'IANA timezone used by secured Performance report wrappers for location business-date boundaries. Invalid or missing values fall back to UTC.';

CREATE OR REPLACE FUNCTION public.resolve_performance_location_timezone(
  p_organization_id uuid,
  p_location_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT NULLIF(btrim(l.timezone), '')
    INTO v_timezone
  FROM public.locations l
  WHERE l.organization_id = p_organization_id
    AND l.id = p_location_id
    AND l.deleted_at IS NULL;

  IF v_timezone IS NULL THEN
    RETURN 'UTC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RETURN v_timezone;
  END IF;

  RETURN 'UTC';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  TO service_role;

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
  v_location_brand_id uuid;
  v_timezone text;
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

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
    v_timezone,
    p_selected_category,
    p_trend_categories
  );

  WITH rows AS (
    SELECT source.row_data, source.ordinality
    FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
      WITH ORDINALITY AS source(row_data, ordinality)
  ), scoped_budgets AS (
    SELECT
      btrim(bt.category) AS category,
      sum(bt.target_amount)::numeric AS budget
    FROM public.budget_targets bt
    WHERE bt.organization_id = p_organization_id
      AND bt.location_id = p_location_id
      AND bt.brand_id IS NOT DISTINCT FROM v_location_brand_id
      AND bt.period_start = p_date_from
      AND bt.period_end = p_date_to
      AND bt.category IS NOT NULL
    GROUP BY btrim(bt.category)
  )
  SELECT COALESCE(
    jsonb_agg(
      rows.row_data
      || jsonb_build_object(
        'budget', scoped_budgets.budget,
        'budgetVariance', CASE
          WHEN scoped_budgets.budget IS NULL THEN NULL
          ELSE round(
            COALESCE(NULLIF(rows.row_data->>'currentSpend', '')::numeric, 0)
            - scoped_budgets.budget,
            2
          )
        END
      )
      ORDER BY rows.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_table_rows
  FROM rows
  LEFT JOIN scoped_budgets
    ON scoped_budgets.category = btrim(rows.row_data->>'category');

  RETURN jsonb_set(
    jsonb_set(
      COALESCE(v_result, '{}'::jsonb),
      '{tableRows}',
      v_table_rows,
      true
    ),
    '{metadata}',
    COALESCE(v_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'timezone', v_timezone,
        'timezoneSource', 'locations.timezone',
        'timezoneFallback', CASE WHEN v_timezone = 'UTC' THEN 'UTC when missing or invalid' ELSE NULL END,
        'budgetScope', 'exact_location_brand_period_category',
        'budgetPeriodRule', 'exact_period_match'
      ),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_category_performance_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_category text,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_category_performance_drilldown(
    p_organization_id,
    p_category,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_vendor_ids,
    v_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_price_movers_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_price_movers_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_category_names,
    p_vendor_ids,
    v_timezone,
    p_product_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_price_movers_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_price_movers_drilldown(
    p_organization_id,
    p_product_id,
    p_product_name,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_comparison_date_from,
    p_comparison_date_to,
    p_vendor_ids,
    v_timezone
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_category_names text[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);

  v_result := public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    v_timezone
  );

  SELECT COALESCE(
    jsonb_agg(
      source.row_data
      || jsonb_build_object(
        'currentOnHandQuantity', evidence.current_on_hand_quantity,
        'reorderPoint', evidence.reorder_point,
        'unitCost', evidence.unit_cost,
        'unitCostSource', evidence.unit_cost_source,
        'usageValue', CASE
          WHEN NULLIF(source.row_data->>'actualUsage', '') IS NULL
            OR evidence.unit_cost IS NULL
          THEN NULL
          ELSE round(
            (source.row_data->>'actualUsage')::numeric * evidence.unit_cost,
            2
          )
        END,
        'currentInventoryValue', evidence.current_inventory_value,
        'currentInventoryValueSource', evidence.current_inventory_value_source
      )
      ORDER BY source.ordinality
    ),
    '[]'::jsonb
  )
  INTO v_table_rows
  FROM jsonb_array_elements(COALESCE(v_result->'tableRows', '[]'::jsonb))
    WITH ORDINALITY AS source(row_data, ordinality)
  LEFT JOIN LATERAL (
    SELECT
      inv.current_quantity::numeric AS current_on_hand_quantity,
      CASE
        WHEN inv.reorder_point > 0 THEN inv.reorder_point::numeric
        WHEN inv.par_level > 0 THEN inv.par_level::numeric
        ELSE NULL
      END AS reorder_point,
      CASE
        WHEN inv.unit_cost > 0 THEN inv.unit_cost::numeric
        WHEN product.latest_price > 0 THEN product.latest_price::numeric
        ELSE NULL
      END AS unit_cost,
      CASE
        WHEN inv.unit_cost > 0 THEN 'inventory.unit_cost'
        WHEN product.latest_price > 0 THEN 'products.latest_price'
        ELSE 'unavailable'
      END AS unit_cost_source,
      CASE
        WHEN inv.current_value IS NOT NULL THEN inv.current_value::numeric
        WHEN inv.current_quantity IS NOT NULL
          AND (
            CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
              ELSE NULL
            END
          ) IS NOT NULL
        THEN round(
          inv.current_quantity
          * CASE
              WHEN inv.unit_cost > 0 THEN inv.unit_cost
              WHEN product.latest_price > 0 THEN product.latest_price
            END,
          2
        )
        ELSE NULL
      END AS current_inventory_value,
      CASE
        WHEN inv.current_value IS NOT NULL THEN 'inventory.current_value'
        WHEN inv.current_quantity IS NOT NULL
          AND (inv.unit_cost > 0 OR product.latest_price > 0)
        THEN 'calculated_current_quantity_x_unit_cost'
        ELSE 'unavailable'
      END AS current_inventory_value_source
    FROM public.inventory inv
    LEFT JOIN public.products product
      ON product.id = inv.internal_product_id
     AND product.organization_id = p_organization_id
     AND product.deleted_at IS NULL
    WHERE inv.id = NULLIF(source.row_data->>'inventoryId', '')::uuid
      AND inv.organization_id = p_organization_id
      AND inv.location_id = p_location_id
      AND inv.deleted_at IS NULL
    LIMIT 1
  ) evidence ON TRUE;

  RETURN jsonb_set(
    jsonb_set(
      COALESCE(v_result, '{}'::jsonb),
      '{tableRows}',
      v_table_rows,
      true
    ),
    '{metadata}',
    COALESCE(v_result->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'timezone', v_timezone,
        'timezoneSource', 'locations.timezone',
        'timezoneFallback', CASE WHEN v_timezone = 'UTC' THEN 'UTC when missing or invalid' ELSE NULL END
      ),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_drilldown(
  p_organization_id uuid,
  p_location_id uuid,
  p_inventory_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id);
  RETURN public.get_inventory_usage_drilldown(
    p_organization_id,
    p_inventory_id,
    p_product_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    v_timezone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) IS
  'Secured single-location Performance Inventory Usage report enriched with current on-hand, reorder, cost provenance, current-value evidence, and server-derived location timezone.';

NOTIFY pgrst, 'reload schema';

COMMIT;