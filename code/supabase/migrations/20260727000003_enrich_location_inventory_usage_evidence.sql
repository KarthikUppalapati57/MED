BEGIN;

-- Performance-only enrichment of the secured, single-location Inventory Usage
-- response. The shared base report remains unchanged for other modules.
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
  v_result jsonb;
  v_table_rows jsonb;
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );

  v_result := public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    p_timezone
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
    COALESCE(v_result, '{}'::jsonb),
    '{tableRows}',
    v_table_rows,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) IS
  'Secured single-location Performance Inventory Usage report enriched with current on-hand, reorder, cost provenance, and current-value evidence.';

NOTIFY pgrst, 'reload schema';

COMMIT;
