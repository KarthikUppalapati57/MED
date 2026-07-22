-- Inventory Usage Report: actual inventory movement/count analytics (no POS).
-- Locked rules:
--   Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing
--   Waste reported separately (not added into Actual Usage)
--   Official Actual Usage only when opening AND closing counts exist; else Not Calculable
--   Exclude POS/theoretical movement types
--   Widen movement_type CHECK for writer RPC types

BEGIN;

-- 1) Widen CHECK so transfer_in/out and count_variance (and related) are valid.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'invoice_received'::text,
    'recipe_consumption'::text,
    'manual_adjustment'::text,
    'transfer'::text,
    'transfer_in'::text,
    'transfer_out'::text,
    'wastage'::text,
    'spoilage'::text,
    'purchase_order'::text,
    'stock_count'::text,
    'count_variance'::text,
    'sales_depletion'::text,
    'pos_adjustment'::text
  ]));

CREATE OR REPLACE FUNCTION public.get_inventory_usage_report(
  p_organization_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_category_names text[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;

  WITH scoped_inventory AS (
    SELECT
      inv.id AS inventory_id,
      inv.organization_id,
      inv.location_id,
      COALESCE(loc.name, inv.location, 'Unknown location') AS location_name,
      inv.internal_product_id AS product_id,
      COALESCE(p.name, inv.product_name, 'Unknown product') AS product,
      COALESCE(NULLIF(trim(COALESCE(p.category, inv.category)), ''), 'Uncategorized') AS category,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(inv.current_unit), ''), NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(p.base_unit), ''), 'Each')
      ) AS unit,
      COALESCE(inv.unit_cost, p.latest_price, 0)::numeric AS unit_cost,
      COALESCE(inv.current_quantity, 0)::numeric AS current_quantity,
      inv.last_counted_date
    FROM public.inventory inv
    LEFT JOIN public.products p
      ON p.id = inv.internal_product_id AND p.deleted_at IS NULL
    LEFT JOIN public.locations loc
      ON loc.id = inv.location_id
    WHERE inv.organization_id = v_org_id
      AND inv.deleted_at IS NULL
      AND public.tenant_scope_visible(inv.organization_id, inv.brand_id, inv.location_id, inv.deleted_at)
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR inv.location_id = ANY (p_location_ids)
      )
      AND (
        p_category_names IS NULL OR cardinality(p_category_names) = 0
        OR COALESCE(NULLIF(trim(COALESCE(p.category, inv.category)), ''), 'Uncategorized') = ANY (p_category_names)
      )
  ),
  -- Completed count lines: counted_data object keyed by inventory_id
  count_object_lines AS (
    SELECT
      cs.id AS session_id,
      cs.completed_at,
      (cs.completed_at AT TIME ZONE v_tz)::date AS count_date,
      sh.location_id,
      (e.key)::uuid AS inventory_id,
      COALESCE(
        NULLIF(e.value->>'counted_quantity', '')::numeric,
        NULLIF(e.value->>'count', '')::numeric,
        NULLIF(e.value->>'quantity', '')::numeric
      ) AS counted_qty,
      public.normalize_product_report_unit(COALESCE(NULLIF(trim(e.value->>'unit'), ''), 'Each')) AS unit
    FROM public.count_sessions cs
    JOIN public.count_sheets sh ON sh.id = cs.count_sheet_id
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(cs.counted_data) = 'object' THEN cs.counted_data ELSE '{}'::jsonb END
    ) e
    WHERE cs.organization_id = v_org_id
      AND lower(cs.status) = 'completed'
      AND cs.completed_at IS NOT NULL
      AND e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR sh.location_id = ANY (p_location_ids)
      )
  ),
  count_array_lines AS (
    SELECT
      cs.id AS session_id,
      cs.completed_at,
      (cs.completed_at AT TIME ZONE v_tz)::date AS count_date,
      sh.location_id,
      NULLIF(elem->>'inventory_id', '')::uuid AS inventory_id,
      COALESCE(
        NULLIF(elem->>'counted_quantity', '')::numeric,
        NULLIF(elem->>'count', '')::numeric,
        NULLIF(elem->>'quantity', '')::numeric
      ) AS counted_qty,
      public.normalize_product_report_unit(COALESCE(NULLIF(trim(elem->>'unit'), ''), 'Each')) AS unit
    FROM public.count_sessions cs
    JOIN public.count_sheets sh ON sh.id = cs.count_sheet_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(cs.counted_data) = 'array' THEN cs.counted_data ELSE '[]'::jsonb END
    ) elem
    WHERE cs.organization_id = v_org_id
      AND lower(cs.status) = 'completed'
      AND cs.completed_at IS NOT NULL
      AND NULLIF(elem->>'inventory_id', '') IS NOT NULL
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR sh.location_id = ANY (p_location_ids)
      )
  ),
  count_lines AS (
    SELECT * FROM count_object_lines WHERE counted_qty IS NOT NULL
    UNION ALL
    SELECT * FROM count_array_lines WHERE counted_qty IS NOT NULL AND inventory_id IS NOT NULL
  ),
  opening_counts AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      counted_qty AS opening_qty,
      count_date AS opening_count_date,
      session_id AS opening_session_id,
      unit AS opening_unit
    FROM count_lines
    WHERE count_date <= p_date_from
    ORDER BY inventory_id, count_date DESC, completed_at DESC
  ),
  closing_counts AS (
    SELECT DISTINCT ON (inventory_id)
      inventory_id,
      counted_qty AS closing_qty,
      count_date AS closing_count_date,
      session_id AS closing_session_id,
      unit AS closing_unit
    FROM count_lines
    WHERE count_date <= p_date_to
    ORDER BY inventory_id, count_date DESC, completed_at DESC
  ),
  period_movements AS (
    SELECT
      im.id,
      im.inventory_id,
      im.location_id,
      im.movement_type,
      im.quantity::numeric AS quantity,
      im.source_type,
      im.source_id,
      im.created_at,
      (im.created_at AT TIME ZONE v_tz)::date AS movement_date,
      CASE
        WHEN im.movement_type IN ('purchase_order', 'invoice_received') AND im.quantity > 0 THEN 'receipt'
        WHEN im.movement_type = 'transfer_in' OR (im.movement_type = 'transfer' AND im.quantity >= 0) THEN 'transfer_in'
        WHEN im.movement_type = 'transfer_out' OR (im.movement_type = 'transfer' AND im.quantity < 0) THEN 'transfer_out'
        WHEN im.movement_type IN ('wastage', 'spoilage') THEN 'waste'
        WHEN im.movement_type = 'manual_adjustment' THEN 'adjustment'
        WHEN im.movement_type IN ('count_variance', 'stock_count') THEN 'count_variance'
        WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'pos_adjustment') THEN 'pos_excluded'
        ELSE 'other'
      END AS class
    FROM public.inventory_movements im
    WHERE im.organization_id = v_org_id
      AND (im.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (im.created_at AT TIME ZONE v_tz)::date <= p_date_to
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR im.location_id = ANY (p_location_ids)
      )
  ),
  movement_agg AS (
    SELECT
      inventory_id,
      round(sum(quantity) FILTER (WHERE class = 'receipt'), 4) AS received_qty,
      round(sum(quantity) FILTER (WHERE class = 'transfer_in'), 4) AS transfers_in_qty,
      round(sum(abs(quantity)) FILTER (WHERE class = 'transfer_out'), 4) AS transfers_out_qty,
      -- When opening/closing come from counts, exclude count_variance from adjustments (absorbed).
      round(sum(quantity) FILTER (WHERE class = 'adjustment'), 4) AS adjustment_qty,
      round(sum(abs(quantity)) FILTER (WHERE class = 'waste'), 4) AS waste_qty_from_movements,
      max(movement_date) AS last_movement_date
    FROM period_movements
    WHERE class <> 'pos_excluded'
    GROUP BY inventory_id
  ),
  waste_from_logs AS (
    SELECT
      inv.id AS inventory_id,
      round(sum(w.quantity)::numeric, 4) AS waste_qty,
      round(sum(COALESCE(w.value, w.quantity * COALESCE(inv.unit_cost, 0)))::numeric, 2) AS waste_value
    FROM public.wastage_logs w
    JOIN public.inventory inv
      ON inv.organization_id = w.organization_id
     AND inv.deleted_at IS NULL
     AND (
       (w.product_id IS NOT NULL AND inv.product_id = w.product_id)
       OR lower(inv.product_name) = lower(w.product_name)
     )
     AND (w.location_id IS NULL OR inv.location_id IS NOT DISTINCT FROM w.location_id)
    WHERE w.organization_id = v_org_id
      AND (w.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (w.created_at AT TIME ZONE v_tz)::date <= p_date_to
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR w.location_id = ANY (p_location_ids)
        OR (w.location_id IS NULL AND inv.location_id = ANY (p_location_ids))
      )
    GROUP BY inv.id
  ),
  base AS (
    SELECT
      si.*,
      oc.opening_qty,
      oc.opening_count_date,
      oc.opening_unit,
      cc.closing_qty,
      cc.closing_count_date,
      cc.closing_unit,
      COALESCE(ma.received_qty, 0) AS received_qty,
      COALESCE(ma.transfers_in_qty, 0) AS transfers_in_qty,
      COALESCE(ma.transfers_out_qty, 0) AS transfers_out_qty,
      COALESCE(ma.adjustment_qty, 0) AS adjustment_qty,
      COALESCE(wl.waste_qty, ma.waste_qty_from_movements, 0) AS waste_qty,
      COALESCE(wl.waste_value, COALESCE(ma.waste_qty_from_movements, 0) * si.unit_cost) AS waste_value,
      ma.last_movement_date,
      CASE
        WHEN oc.opening_qty IS NULL OR cc.closing_qty IS NULL THEN 'not_calculable'
        WHEN oc.opening_unit IS DISTINCT FROM cc.closing_unit
          AND oc.opening_unit IS NOT NULL AND cc.closing_unit IS NOT NULL
          THEN 'not_calculable'
        ELSE 'calculable'
      END AS data_quality_status,
      CASE
        WHEN oc.opening_qty IS NULL OR cc.closing_qty IS NULL THEN NULL
        WHEN oc.opening_unit IS DISTINCT FROM cc.closing_unit
          AND oc.opening_unit IS NOT NULL AND cc.closing_unit IS NOT NULL
          THEN NULL
        ELSE round(
          oc.opening_qty
          + COALESCE(ma.received_qty, 0)
          + COALESCE(ma.transfers_in_qty, 0)
          - COALESCE(ma.transfers_out_qty, 0)
          + COALESCE(ma.adjustment_qty, 0)
          - cc.closing_qty
        , 4)
      END AS actual_usage
    FROM scoped_inventory si
    LEFT JOIN opening_counts oc ON oc.inventory_id = si.inventory_id
    LEFT JOIN closing_counts cc ON cc.inventory_id = si.inventory_id
    LEFT JOIN movement_agg ma ON ma.inventory_id = si.inventory_id
    LEFT JOIN waste_from_logs wl ON wl.inventory_id = si.inventory_id
  ),
  enriched AS (
    SELECT
      b.*,
      CASE WHEN b.actual_usage IS NULL THEN NULL
           ELSE round(b.actual_usage * b.unit_cost, 2)
      END AS usage_value,
      CASE WHEN b.opening_qty IS NULL THEN NULL
           ELSE round(b.opening_qty * b.unit_cost, 2)
      END AS opening_value,
      CASE WHEN b.closing_qty IS NULL THEN NULL
           ELSE round(b.closing_qty * b.unit_cost, 2)
      END AS closing_value,
      CASE WHEN b.opening_qty IS NULL OR b.closing_qty IS NULL THEN NULL
           ELSE round((b.closing_qty - b.opening_qty) * b.unit_cost, 2)
      END AS inventory_value_change,
      round(b.received_qty * b.unit_cost, 2) AS received_value,
      round(b.transfers_in_qty * b.unit_cost, 2) AS transfers_in_value,
      round(b.transfers_out_qty * b.unit_cost, 2) AS transfers_out_value,
      round(b.adjustment_qty * b.unit_cost, 2) AS adjustment_value
    FROM base b
  ),
  calculable AS (
    SELECT * FROM enriched WHERE data_quality_status = 'calculable' AND actual_usage IS NOT NULL
  ),
  abc_ranked AS (
    SELECT
      e.*,
      sum(COALESCE(e.usage_value, 0)) OVER (ORDER BY COALESCE(e.usage_value, 0) DESC, e.product) AS cum_usage_value,
      sum(COALESCE(e.usage_value, 0)) OVER () AS total_usage_value
    FROM calculable e
  ),
  with_abc AS (
    SELECT
      e.*,
      CASE
        WHEN e.data_quality_status <> 'calculable' OR e.usage_value IS NULL THEN 'n/a'
        WHEN ar.total_usage_value <= 0 THEN 'C'
        WHEN ar.cum_usage_value <= ar.total_usage_value * 0.80 THEN 'A'
        WHEN ar.cum_usage_value <= ar.total_usage_value * 0.95 THEN 'B'
        ELSE 'C'
      END AS abc_class
    FROM enriched e
    LEFT JOIN abc_ranked ar ON ar.inventory_id = e.inventory_id
  ),
  summary AS (
    SELECT
      round(sum(opening_value)::numeric, 2) AS opening_inventory_value,
      round(sum(closing_value)::numeric, 2) AS closing_inventory_value,
      round(sum(received_value)::numeric, 2) AS inventory_received,
      round(sum(usage_value)::numeric, 2) AS actual_inventory_usage,
      round(sum(waste_value)::numeric, 2) AS waste_value,
      round(sum(transfers_in_value)::numeric, 2) AS transfers_in,
      round(sum(transfers_out_value)::numeric, 2) AS transfers_out,
      round(sum(adjustment_value)::numeric, 2) AS inventory_adjustments,
      round(sum(inventory_value_change)::numeric, 2) AS inventory_value_change,
      count(*) FILTER (WHERE opening_qty IS NULL OR closing_qty IS NULL OR last_counted_date IS NULL)::int AS uncounted_or_missing,
      count(*)::int AS total_products,
      count(*) FILTER (WHERE data_quality_status = 'calculable')::int AS calculable_products
    FROM with_abc
  ),
  highest_usage_category AS (
    SELECT jsonb_build_object(
      'category', category,
      'usageValue', round(sum(usage_value)::numeric, 2),
      'usageQty', round(sum(actual_usage)::numeric, 4)
    ) AS obj
    FROM calculable
    GROUP BY category
    ORDER BY sum(usage_value) DESC NULLS LAST
    LIMIT 1
  ),
  highest_waste_product AS (
    SELECT jsonb_build_object(
      'product', product,
      'category', category,
      'wasteValue', waste_value,
      'wasteQty', waste_qty
    ) AS obj
    FROM with_abc
    WHERE waste_qty > 0
    ORDER BY waste_value DESC NULLS LAST
    LIMIT 1
  ),
  waterfall AS (
    SELECT jsonb_build_array(
      jsonb_build_object('step', 'Opening', 'value', (SELECT opening_inventory_value FROM summary)),
      jsonb_build_object('step', 'Receipts', 'value', (SELECT inventory_received FROM summary)),
      jsonb_build_object('step', 'Transfers In', 'value', (SELECT transfers_in FROM summary)),
      jsonb_build_object('step', 'Transfers Out', 'value', -abs(COALESCE((SELECT transfers_out FROM summary), 0))),
      jsonb_build_object('step', 'Adjustments', 'value', (SELECT inventory_adjustments FROM summary)),
      jsonb_build_object('step', 'Closing', 'value', -abs(COALESCE((SELECT closing_inventory_value FROM summary), 0))),
      jsonb_build_object('step', 'Actual Usage', 'value', (SELECT actual_inventory_usage FROM summary))
    ) AS arr
  ),
  usage_by_category AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category', category,
        'usageValue', usage_value,
        'usageQty', usage_qty,
        'wasteValue', waste_value,
        'productCount', product_count
      )
      ORDER BY usage_value DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        category,
        round(sum(usage_value)::numeric, 2) AS usage_value,
        round(sum(actual_usage)::numeric, 4) AS usage_qty,
        round(sum(waste_value)::numeric, 2) AS waste_value,
        count(*)::int AS product_count
      FROM calculable
      GROUP BY category
    ) c
  ),
  value_trend AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', bucket,
        'receivedValue', received_value,
        'usageProxyValue', usage_proxy_value,
        'wasteValue', waste_value
      )
      ORDER BY bucket
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        to_char(date_trunc('week', m.created_at AT TIME ZONE v_tz), 'YYYY-MM-DD') AS bucket,
        round(sum(CASE WHEN m.class = 'receipt' THEN m.quantity * COALESCE(si.unit_cost, 0) ELSE 0 END)::numeric, 2) AS received_value,
        round(sum(CASE WHEN m.class = 'transfer_out' THEN abs(m.quantity) * COALESCE(si.unit_cost, 0) ELSE 0 END)::numeric, 2) AS usage_proxy_value,
        round(sum(CASE WHEN m.class = 'waste' THEN abs(m.quantity) * COALESCE(si.unit_cost, 0) ELSE 0 END)::numeric, 2) AS waste_value
      FROM period_movements m
      LEFT JOIN scoped_inventory si ON si.inventory_id = m.inventory_id
      WHERE m.class <> 'pos_excluded'
      GROUP BY 1
    ) t
  ),
  waste_trend AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', bucket,
        'wasteValue', waste_value,
        'wasteQty', waste_qty
      )
      ORDER BY bucket
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        ((created_at AT TIME ZONE v_tz)::date)::text AS bucket,
        round(COALESCE(sum(value), 0)::numeric, 2) AS waste_value,
        round(COALESCE(sum(quantity), 0)::numeric, 4) AS waste_qty
      FROM public.wastage_logs
      WHERE organization_id = v_org_id
        AND (created_at AT TIME ZONE v_tz)::date >= p_date_from
        AND (created_at AT TIME ZONE v_tz)::date <= p_date_to
        AND (
          p_location_ids IS NULL OR cardinality(p_location_ids) = 0
          OR location_id = ANY (p_location_ids)
        )
      GROUP BY 1
    ) w
  ),
  product_ranking AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'product', product,
        'productId', product_id,
        'inventoryId', inventory_id,
        'category', category,
        'location', location_name,
        'actualUsage', actual_usage,
        'usageValue', usage_value,
        'wasteValue', waste_value
      )
      ORDER BY usage_value DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT * FROM calculable
      ORDER BY usage_value DESC NULLS LAST
      LIMIT 20
    ) top_u
  ),
  location_comparison AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'location', location_name,
        'locationId', location_id,
        'openingValue', opening_value,
        'closingValue', closing_value,
        'usageValue', usage_value,
        'wasteValue', waste_value,
        'receivedValue', received_value
      )
      ORDER BY usage_value DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        location_id,
        location_name,
        round(sum(opening_value)::numeric, 2) AS opening_value,
        round(sum(closing_value)::numeric, 2) AS closing_value,
        round(sum(usage_value)::numeric, 2) AS usage_value,
        round(sum(waste_value)::numeric, 2) AS waste_value,
        round(sum(received_value)::numeric, 2) AS received_value
      FROM with_abc
      GROUP BY location_id, location_name
    ) loc
  ),
  heatmap AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category', category,
        'location', location_name,
        'usageValue', usage_value,
        'wasteValue', waste_value
      )
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT category, location_name,
             round(sum(usage_value)::numeric, 2) AS usage_value,
             round(sum(waste_value)::numeric, 2) AS waste_value
      FROM with_abc
      GROUP BY category, location_name
    ) h
  ),
  abc AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'class', abc_class,
        'productCount', product_count,
        'usageValue', usage_value
      )
      ORDER BY abc_class
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT abc_class,
             count(*)::int AS product_count,
             round(sum(COALESCE(usage_value, 0))::numeric, 2) AS usage_value
      FROM with_abc
      WHERE abc_class <> 'n/a'
      GROUP BY abc_class
    ) a
  ),
  insights AS (
    SELECT COALESCE(jsonb_agg(ins ORDER BY (ins->>'impact')::numeric DESC), '[]'::jsonb) AS arr
    FROM (
      SELECT jsonb_build_object(
        'id', 'usage-total',
        'impact', abs(COALESCE(s.actual_inventory_usage, 0)),
        'text', format('Calculable actual inventory usage value is $%s across %s products.',
          to_char(COALESCE(s.actual_inventory_usage, 0), 'FM999,999,990'),
          s.calculable_products)
      ) AS ins
      FROM summary s
      UNION ALL
      SELECT jsonb_build_object(
        'id', 'waste',
        'impact', abs(COALESCE(s.waste_value, 0)),
        'text', format('Waste value in period is $%s (reported separately; not added into Actual Usage).',
          to_char(COALESCE(s.waste_value, 0), 'FM999,999,990'))
      )
      FROM summary s
      WHERE COALESCE(s.waste_value, 0) > 0
      UNION ALL
      SELECT jsonb_build_object(
        'id', 'uncounted',
        'impact', s.uncounted_or_missing,
        'text', format('%s inventory items are missing opening/closing counts (Actual Usage = Not Calculable).',
          s.uncounted_or_missing)
      )
      FROM summary s
      WHERE s.uncounted_or_missing > 0
      UNION ALL
      SELECT jsonb_build_object(
        'id', 'top-cat',
        'impact', COALESCE((SELECT (obj->>'usageValue')::numeric FROM highest_usage_category), 0),
        'text', format('%s is the highest-usage category.',
          (SELECT obj->>'category' FROM highest_usage_category))
      )
      WHERE EXISTS (SELECT 1 FROM highest_usage_category WHERE obj IS NOT NULL)
    ) x
  ),
  filter_options AS (
    SELECT
      COALESCE((
        SELECT jsonb_agg(DISTINCT category ORDER BY category)
        FROM with_abc WHERE category IS NOT NULL
      ), '[]'::jsonb) AS categories,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', location_id, 'name', location_name) ORDER BY location_name)
        FROM (
          SELECT DISTINCT location_id, location_name FROM with_abc WHERE location_id IS NOT NULL
        ) l
      ), '[]'::jsonb) AS locations
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'openingInventoryValue', s.opening_inventory_value,
      'closingInventoryValue', s.closing_inventory_value,
      'inventoryReceived', s.inventory_received,
      'actualInventoryUsage', s.actual_inventory_usage,
      'wasteValue', s.waste_value,
      'transfersIn', s.transfers_in,
      'transfersOut', s.transfers_out,
      'inventoryAdjustments', s.inventory_adjustments,
      'highestUsageCategory', (SELECT obj FROM highest_usage_category),
      'highestWasteProduct', (SELECT obj FROM highest_waste_product),
      'inventoryValueChange', s.inventory_value_change,
      'uncountedOrMissing', s.uncounted_or_missing,
      'totalProducts', s.total_products,
      'calculableProducts', s.calculable_products
    ),
    'waterfall', (SELECT arr FROM waterfall),
    'usageByCategory', (SELECT arr FROM usage_by_category),
    'valueTrend', (SELECT arr FROM value_trend),
    'wasteTrend', (SELECT arr FROM waste_trend),
    'productRanking', (SELECT arr FROM product_ranking),
    'locationComparison', (SELECT arr FROM location_comparison),
    'heatmap', (SELECT arr FROM heatmap),
    'abc', (SELECT arr FROM abc),
    'tableRows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'inventoryId', w.inventory_id,
          'productId', w.product_id,
          'product', w.product,
          'category', w.category,
          'location', w.location_name,
          'locationId', w.location_id,
          'openingQuantity', w.opening_qty,
          'receivedQuantity', w.received_qty,
          'transfersIn', w.transfers_in_qty,
          'transfersOut', w.transfers_out_qty,
          'wasteQuantity', w.waste_qty,
          'adjustmentQuantity', w.adjustment_qty,
          'closingQuantity', w.closing_qty,
          'actualUsage', w.actual_usage,
          'unit', w.unit,
          'unitCost', w.unit_cost,
          'usageValue', w.usage_value,
          'wasteValue', w.waste_value,
          'countDate', w.closing_count_date,
          'lastMovementDate', w.last_movement_date,
          'dataQualityStatus', w.data_quality_status,
          'abcClass', w.abc_class
        )
        ORDER BY COALESCE(w.usage_value, 0) DESC, w.product
      )
      FROM with_abc w
    ), '[]'::jsonb),
    'insights', (SELECT arr FROM insights),
    'metadata', jsonb_build_object(
      'currency', 'USD',
      'timezone', v_tz,
      'dataFreshness', to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD HH24:MI'),
      'usageDefinition', 'Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing. Waste is reported separately and not added into Actual Usage. POS/theoretical movements are excluded. Official usage requires opening and closing completed counts.',
      'filterOptions', jsonb_build_object(
        'categories', (SELECT categories FROM filter_options),
        'locations', (SELECT locations FROM filter_options)
      )
    )
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_inventory_usage_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_inventory_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
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
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_inv_id uuid := p_inventory_id;
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;
  IF v_inv_id IS NULL AND p_product_id IS NULL THEN
    RAISE EXCEPTION 'inventory_id or product_id is required';
  END IF;

  IF v_inv_id IS NULL THEN
    SELECT id INTO v_inv_id
    FROM public.inventory
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
      AND internal_product_id = p_product_id
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR location_id = ANY (p_location_ids)
      )
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  WITH inv AS (
    SELECT
      i.*,
      COALESCE(p.name, i.product_name) AS product,
      COALESCE(NULLIF(trim(COALESCE(p.category, i.category)), ''), 'Uncategorized') AS category,
      COALESCE(loc.name, i.location, 'Unknown') AS location_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(i.current_unit), ''), NULLIF(trim(p.report_by_unit), ''), 'Each')
      ) AS unit,
      COALESCE(i.unit_cost, p.latest_price, 0)::numeric AS unit_cost
    FROM public.inventory i
    LEFT JOIN public.products p ON p.id = i.internal_product_id
    LEFT JOIN public.locations loc ON loc.id = i.location_id
    WHERE i.id = v_inv_id
      AND i.organization_id = v_org_id
      AND i.deleted_at IS NULL
  ),
  counts AS (
    SELECT
      cs.id AS session_id,
      (cs.completed_at AT TIME ZONE v_tz)::date AS count_date,
      cs.completed_at,
      COALESCE(
        NULLIF(cs.counted_data->(v_inv_id::text)->>'counted_quantity', '')::numeric,
        NULLIF(cs.counted_data->(v_inv_id::text)->>'count', '')::numeric
      ) AS counted_qty,
      cs.status
    FROM public.count_sessions cs
    JOIN public.count_sheets sh ON sh.id = cs.count_sheet_id
    WHERE cs.organization_id = v_org_id
      AND lower(cs.status) = 'completed'
      AND cs.counted_data ? (v_inv_id::text)
      AND (cs.completed_at AT TIME ZONE v_tz)::date >= p_date_from - 90
      AND (cs.completed_at AT TIME ZONE v_tz)::date <= p_date_to
    ORDER BY cs.completed_at DESC
    LIMIT 50
  ),
  movements AS (
    SELECT
      im.id,
      im.movement_type,
      im.quantity,
      im.source_type,
      im.source_id,
      im.created_at,
      (im.created_at AT TIME ZONE v_tz)::date AS movement_date,
      CASE
        WHEN im.movement_type IN ('purchase_order', 'invoice_received') THEN 'receipt'
        WHEN im.movement_type IN ('transfer_in') OR (im.movement_type = 'transfer' AND im.quantity >= 0) THEN 'transfer_in'
        WHEN im.movement_type IN ('transfer_out') OR (im.movement_type = 'transfer' AND im.quantity < 0) THEN 'transfer_out'
        WHEN im.movement_type IN ('wastage', 'spoilage') THEN 'waste'
        WHEN im.movement_type = 'manual_adjustment' THEN 'adjustment'
        WHEN im.movement_type IN ('count_variance', 'stock_count') THEN 'count_variance'
        WHEN im.movement_type IN ('recipe_consumption', 'sales_depletion', 'pos_adjustment') THEN 'pos_excluded'
        ELSE 'other'
      END AS class
    FROM public.inventory_movements im
    WHERE im.organization_id = v_org_id
      AND im.inventory_id = v_inv_id
      AND (im.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (im.created_at AT TIME ZONE v_tz)::date <= p_date_to
  ),
  waste AS (
    SELECT
      w.id,
      w.quantity,
      w.unit,
      w.value,
      w.reason,
      w.created_at,
      (w.created_at AT TIME ZONE v_tz)::date AS waste_date
    FROM public.wastage_logs w
    JOIN inv ON true
    WHERE w.organization_id = v_org_id
      AND (
        (w.product_id IS NOT NULL AND w.product_id = inv.product_id)
        OR lower(w.product_name) = lower(inv.product_name)
      )
      AND (w.created_at AT TIME ZONE v_tz)::date >= p_date_from
      AND (w.created_at AT TIME ZONE v_tz)::date <= p_date_to
    ORDER BY w.created_at DESC
    LIMIT 50
  ),
  usage_trend AS (
    SELECT
      movement_date AS bucket,
      round(sum(CASE WHEN class = 'receipt' THEN quantity ELSE 0 END)::numeric, 4) AS received,
      round(sum(CASE WHEN class = 'transfer_in' THEN quantity ELSE 0 END)::numeric, 4) AS transfers_in,
      round(sum(CASE WHEN class = 'transfer_out' THEN abs(quantity) ELSE 0 END)::numeric, 4) AS transfers_out,
      round(sum(CASE WHEN class = 'waste' THEN abs(quantity) ELSE 0 END)::numeric, 4) AS waste_qty,
      round(sum(CASE WHEN class = 'adjustment' THEN quantity ELSE 0 END)::numeric, 4) AS adjustments
    FROM movements
    WHERE class <> 'pos_excluded'
    GROUP BY movement_date
    ORDER BY movement_date
  ),
  location_comp AS (
    SELECT
      COALESCE(loc.name, i.location, 'Unknown') AS location,
      i.location_id,
      i.current_quantity,
      COALESCE(i.unit_cost, 0) AS unit_cost,
      round(i.current_quantity * COALESCE(i.unit_cost, 0), 2) AS value
    FROM public.inventory i
    LEFT JOIN public.locations loc ON loc.id = i.location_id
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (
        (SELECT product_id FROM inv) IS NOT NULL AND i.internal_product_id = (SELECT product_id FROM inv)
        OR lower(i.product_name) = lower((SELECT product FROM inv))
      )
  )
  SELECT jsonb_build_object(
    'inventoryId', v_inv_id,
    'summary', jsonb_build_object(
      'product', (SELECT product FROM inv),
      'category', (SELECT category FROM inv),
      'location', (SELECT location_name FROM inv),
      'unit', (SELECT unit FROM inv),
      'unitCost', (SELECT unit_cost FROM inv),
      'currentQuantity', (SELECT current_quantity FROM inv),
      'lastCountedDate', (SELECT last_counted_date FROM inv)
    ),
    'countHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sessionId', session_id,
        'date', count_date,
        'countedQuantity', counted_qty,
        'status', status
      ) ORDER BY completed_at DESC)
      FROM counts
    ), '[]'::jsonb),
    'receiptHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'sourceType', source_type,
        'sourceId', source_id,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class = 'receipt'
    ), '[]'::jsonb),
    'wasteHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'date', waste_date,
        'quantity', quantity,
        'unit', unit,
        'value', value,
        'reason', reason
      ) ORDER BY created_at DESC)
      FROM waste
    ), '[]'::jsonb),
    'transferHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'class', class,
        'sourceId', source_id,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class IN ('transfer_in', 'transfer_out')
    ), '[]'::jsonb),
    'adjustmentHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'movementId', id,
        'date', movement_date,
        'quantity', quantity,
        'sourceType', source_type,
        'movementType', movement_type
      ) ORDER BY created_at DESC)
      FROM movements WHERE class IN ('adjustment', 'count_variance')
    ), '[]'::jsonb),
    'usageTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'received', received,
        'transfersIn', transfers_in,
        'transfersOut', transfers_out,
        'wasteQty', waste_qty,
        'adjustments', adjustments
      ) ORDER BY bucket)
      FROM usage_trend
    ), '[]'::jsonb),
    'locationComparison', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'location', location,
        'locationId', location_id,
        'currentQuantity', current_quantity,
        'unitCost', unit_cost,
        'value', value
      ))
      FROM location_comp
    ), '[]'::jsonb),
    'normalization', jsonb_build_object(
      'reportUnit', (SELECT unit FROM inv),
      'formula', 'Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing',
      'wasteRule', 'Waste is reported separately and is not added into Actual Usage',
      'posExcluded', true
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_created
  ON public.inventory_movements (organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_created
  ON public.inventory_movements (inventory_id, created_at);

NOTIFY pgrst, 'reload schema';

COMMIT;
