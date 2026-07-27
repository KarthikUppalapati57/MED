-- Fix linked-db lint failures and tighten the location-scoped inventory drilldown contract.
--
-- 1. get_inventory_usage_drilldown compared inventory.internal_product_id (uuid) to
--    inventory.product_id from the inv CTE, which is text in the live schema. It also accepted
--    a caller-supplied inventory_id without rechecking p_location_ids, so the secured
--    get_location_inventory_usage_drilldown wrapper could delegate to a sibling location row.
-- 2. get_price_movers_drilldown nested aggregate calls inside jsonb_agg(), which PostgreSQL
--    rejects. Aggregate by date/vendor first, then JSON-aggregate the prepared rows.
--
-- This migration preserves the current RPC exposure model: authenticated users call the
-- location-scoped wrappers; base drilldowns remain callable only by service_role/internal code.

BEGIN;

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
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
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
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        ((SELECT internal_product_id FROM inv) IS NOT NULL AND i.internal_product_id = (SELECT internal_product_id FROM inv))
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

CREATE OR REPLACE FUNCTION public.get_price_movers_drilldown(
  p_organization_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_comparison_date_from date DEFAULT NULL,
  p_comparison_date_to date DEFAULT NULL,
  p_vendor_ids uuid[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_result jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
  END IF;
  IF p_product_id IS NULL AND NULLIF(trim(COALESCE(p_product_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'product_id or product_name is required';
  END IF;

  WITH eligible_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND public.is_purchasing_spend_invoice(i.status, i.ap_status, i.deleted_at)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND (
        p_location_ids IS NULL OR cardinality(p_location_ids) = 0
        OR i.location_id = ANY (p_location_ids)
      )
      AND (
        p_vendor_ids IS NULL OR cardinality(p_vendor_ids) = 0
        OR i.vendor_id = ANY (p_vendor_ids)
      )
  ),
  lines AS (
    SELECT
      ili.id AS line_id,
      ili.invoice_id,
      i.invoice_number,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      l.name AS location_name,
      ili.internal_product_id,
      COALESCE(p.name, ili.item_name) AS product_name,
      COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') AS category_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(ili.vendor_unit), ''), 'Each')
      ) AS report_unit,
      COALESCE(ili.quantity, 0)::numeric AS quantity,
      COALESCE(ili.unit_price, 0)::numeric AS unit_price,
      COALESCE(ili.total_price, 0)::numeric AS total_price,
      COALESCE(vim.conversion_multiplier, 1)::numeric AS conversion_multiplier,
      CASE
        WHEN ili.internal_product_id IS NULL THEN 'unmapped'
        WHEN vim.is_verified IS TRUE THEN 'verified'
        WHEN vim.internal_product_id IS NOT NULL THEN 'mapped'
        ELSE 'mapped'
      END AS mapping_status,
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size,
      i.status
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id
    LEFT JOIN public.locations l ON l.id = i.location_id
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier, m.is_verified, m.internal_product_id
      FROM public.vendor_item_mappings m
      WHERE m.internal_product_id = ili.internal_product_id
      ORDER BY m.is_verified DESC NULLS LAST
      LIMIT 1
    ) vim ON TRUE
    LEFT JOIN public.vendor_items vi ON vi.id = ili.vendor_item_id
    WHERE (
      (p_product_id IS NOT NULL AND ili.internal_product_id = p_product_id)
      OR (
        p_product_id IS NULL
        AND lower(COALESCE(p.name, ili.item_name, '')) = lower(trim(p_product_name))
      )
    )
  ),
  priced AS (
    SELECT
      *,
      quantity * conversion_multiplier AS normalized_qty,
      CASE WHEN quantity * conversion_multiplier = 0 THEN NULL
           ELSE round(total_price / (quantity * conversion_multiplier), 6)
      END AS normalized_unit_cost
    FROM lines
  ),
  current_rows AS (
    SELECT * FROM priced
    WHERE invoice_date >= p_date_from AND invoice_date <= p_date_to
  ),
  previous_rows AS (
    SELECT * FROM priced
    WHERE p_comparison_date_from IS NOT NULL
      AND p_comparison_date_to IS NOT NULL
      AND invoice_date >= p_comparison_date_from
      AND invoice_date <= p_comparison_date_to
  ),
  summary AS (
    SELECT
      (SELECT product_name FROM current_rows LIMIT 1) AS product,
      (SELECT category_name FROM current_rows LIMIT 1) AS category,
      (SELECT report_unit FROM current_rows LIMIT 1) AS unit,
      (SELECT pack_size FROM current_rows WHERE pack_size IS NOT NULL LIMIT 1) AS pack_size,
      (array_agg(mapping_status ORDER BY CASE mapping_status WHEN 'verified' THEN 0 WHEN 'mapped' THEN 1 ELSE 2 END))[1] AS mapping_status,
      round(sum(normalized_qty)::numeric, 4) AS current_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6) END AS current_price,
      (SELECT CASE WHEN sum(pr.normalized_qty) = 0 THEN NULL
                   ELSE round(sum(pr.total_price) / sum(pr.normalized_qty), 6) END
       FROM previous_rows pr) AS previous_price,
      round(sum(total_price)::numeric, 2) AS current_spend,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      count(DISTINCT vendor_id)::bigint AS vendor_count
    FROM current_rows
  ),
  price_history_rows AS (
    SELECT
      invoice_date,
      round(avg(normalized_unit_cost)::numeric, 6) AS unit_cost,
      round(sum(total_price)::numeric, 2) AS spend,
      round(sum(normalized_qty)::numeric, 4) AS quantity
    FROM current_rows
    WHERE normalized_unit_cost IS NOT NULL
    GROUP BY invoice_date
  ),
  price_history AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'date', invoice_date,
        'unitCost', unit_cost,
        'spend', spend,
        'quantity', quantity
      )
      ORDER BY invoice_date
    ), '[]'::jsonb) AS arr
    FROM price_history_rows
  ),
  vendor_comparison_rows AS (
    SELECT
      vendor_id,
      vendor_name,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6) END AS current_price,
      round(sum(total_price)::numeric, 2) AS spend,
      count(DISTINCT invoice_id) AS invoice_count,
      (array_agg(report_unit))[1] AS unit
    FROM current_rows
    GROUP BY vendor_id, vendor_name
  ),
  vendor_comparison AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor_name,
        'vendorId', vendor_id,
        'currentPrice', current_price,
        'spend', spend,
        'invoiceCount', invoice_count,
        'unit', unit
      )
      ORDER BY spend DESC
    ), '[]'::jsonb) AS arr
    FROM vendor_comparison_rows
  ),
  purchases AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'invoiceId', invoice_id,
        'invoiceNumber', invoice_number,
        'date', invoice_date,
        'vendor', vendor_name,
        'quantity', quantity,
        'unitPrice', unit_price,
        'normalizedUnitCost', normalized_unit_cost,
        'amount', total_price,
        'unit', report_unit,
        'status', status,
        'location', location_name
      )
      ORDER BY invoice_date DESC
    ), '[]'::jsonb) AS arr
    FROM current_rows
  ),
  normalization AS (
    SELECT jsonb_build_object(
      'reportUnit', (SELECT unit FROM summary),
      'packSize', (SELECT pack_size FROM summary),
      'conversionMultiplier', (SELECT conversion_multiplier FROM current_rows LIMIT 1),
      'formula', 'normalized_unit_cost = total_price / (quantity * COALESCE(conversion_multiplier, 1))',
      'comparabilityRule', 'Same internal_product_id and normalized UOM required across periods'
    ) AS obj
  )
  SELECT jsonb_build_object(
    'productId', p_product_id,
    'summary', jsonb_build_object(
      'product', s.product,
      'category', s.category,
      'unit', s.unit,
      'packSize', s.pack_size,
      'currentPrice', s.current_price,
      'previousPrice', s.previous_price,
      'priceChange', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
                          ELSE round(s.current_price - s.previous_price, 6) END,
      'percentageChange', CASE
        WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL
        WHEN s.previous_price = 0 AND s.current_price = 0 THEN 0
        WHEN s.previous_price = 0 THEN NULL
        ELSE round(((s.current_price - s.previous_price) / abs(s.previous_price)) * 100, 2)
      END,
      'currentSpend', s.current_spend,
      'estimatedImpact', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL OR s.current_qty IS NULL OR s.current_qty = 0 THEN NULL ELSE round((s.current_price - s.previous_price) * s.current_qty, 2) END,
      'normalizedPurchasedQuantity', s.current_qty,
      'normalizedQuantityUnit', s.unit,
      'currentWeightedUnitPrice', s.current_price,
      'comparisonWeightedUnitPrice', s.previous_price,
      'unitPriceDifference', CASE WHEN s.current_price IS NULL OR s.previous_price IS NULL THEN NULL ELSE round(s.current_price - s.previous_price, 6) END,
      'mappingConfidence', CASE s.mapping_status WHEN 'verified' THEN 'verified' WHEN 'mapped' THEN 'mapped_unverified' ELSE s.mapping_status END,
      'impactEvidenceComplete', (
        s.mapping_status = 'verified'
        AND s.current_price IS NOT NULL
        AND s.previous_price IS NOT NULL
        AND s.current_qty IS NOT NULL
        AND s.current_qty <> 0
      ),
      'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity',
      'invoiceCount', s.invoice_count,
      'vendorCount', s.vendor_count
    ),
    'priceHistory', (SELECT arr FROM price_history),
    'vendorComparison', (SELECT arr FROM vendor_comparison),
    'purchaseHistory', (SELECT arr FROM purchases),
    'normalization', (SELECT obj FROM normalization)
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
