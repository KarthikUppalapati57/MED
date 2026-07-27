-- Rollback Phase 7 Price Movers impact evidence exposure.
-- Safe comparison: same internal_product_id + same normalized UOM.
-- Normalized unit cost = total_price / NULLIF(quantity * COALESCE(conversion_multiplier, 1), 0).
-- Eligibility: is_purchasing_spend_invoice (same as Category Report).

BEGIN;

-- Ensure UOM normalization helper exists (may be missing if product-module
-- migration was not applied to this environment).
CREATE OR REPLACE FUNCTION public.normalize_product_report_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(COALESCE(p_unit, '')), '') IS NULL THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('ea', 'each', 'unit', 'units') THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('cs', 'case', 'cases') THEN 'Case'
    WHEN lower(trim(p_unit)) IN ('lb', 'lbs', 'pound', 'pounds') THEN 'Pound'
    WHEN lower(trim(p_unit)) IN ('oz', 'ounce', 'ounces') THEN 'Ounce'
    WHEN lower(trim(p_unit)) IN ('gal', 'gallon', 'gallons') THEN 'Gallon'
    WHEN lower(trim(p_unit)) IN ('qt', 'quart', 'quarts') THEN 'Quart'
    WHEN lower(trim(p_unit)) IN ('pt', 'pint', 'pints') THEN 'Pint'
    WHEN lower(trim(p_unit)) IN ('floz', 'fl oz', 'fluid ounce', 'fluid ounces') THEN 'Fluid Ounce'
    WHEN lower(trim(p_unit)) IN ('kg', 'kilogram', 'kilograms') THEN 'Kilogram'
    WHEN lower(trim(p_unit)) IN ('g', 'gram', 'grams') THEN 'Gram'
    WHEN lower(trim(p_unit)) IN ('box', 'boxes') THEN 'Box'
    WHEN lower(trim(p_unit)) IN ('bag', 'bags') THEN 'Bag'
    WHEN lower(trim(p_unit)) IN ('btl', 'bottle', 'bottles') THEN 'Bottle'
    WHEN lower(trim(p_unit)) IN ('can', 'cans') THEN 'Can'
    ELSE initcap(trim(p_unit))
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_price_movers_report(
  p_organization_id uuid DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
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
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
  v_result jsonb;
  v_outlier_threshold numeric := 50; -- abs % change above this flagged as outlier
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'date_from and date_to are required';
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
  mapped_lines AS (
    SELECT
      ili.id AS line_id,
      ili.invoice_id,
      i.invoice_date,
      i.vendor_id,
      COALESCE(NULLIF(trim(i.vendor_name), ''), 'Unknown vendor') AS vendor_name,
      i.location_id,
      ili.internal_product_id,
      COALESCE(p.name, ili.item_name, 'Unknown product') AS product_name,
      COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') AS category_name,
      public.normalize_product_report_unit(
        COALESCE(NULLIF(trim(p.report_by_unit), ''), NULLIF(trim(ili.vendor_unit), ''), 'Each')
      ) AS report_unit,
      COALESCE(ili.quantity, 0)::numeric AS quantity,
      COALESCE(ili.unit_price, 0)::numeric AS unit_price,
      COALESCE(ili.total_price, COALESCE(ili.quantity, 0) * COALESCE(ili.unit_price, 0))::numeric AS total_price,
      COALESCE(vim.conversion_multiplier, 1)::numeric AS conversion_multiplier,
      CASE
        WHEN ili.internal_product_id IS NULL THEN 'unmapped'
        WHEN vim.is_verified IS TRUE THEN 'verified'
        WHEN vim.internal_product_id IS NOT NULL THEN 'mapped'
        ELSE 'mapped'
      END AS mapping_status,
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id AND p.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier, m.is_verified, m.internal_product_id
      FROM public.vendor_item_mappings m
      WHERE m.internal_product_id = ili.internal_product_id
        AND (ili.vendor_item_id IS NULL OR m.vendor_item_id = ili.vendor_item_id)
      ORDER BY m.is_verified DESC NULLS LAST
      LIMIT 1
    ) vim ON TRUE
    LEFT JOIN public.vendor_items vi ON vi.id = ili.vendor_item_id
    WHERE (
        p_category_names IS NULL OR cardinality(p_category_names) = 0
        OR COALESCE(NULLIF(trim(p.category), ''), 'Uncategorized') = ANY (p_category_names)
      )
      AND (p_product_id IS NULL OR ili.internal_product_id = p_product_id)
  ),
  priced AS (
    SELECT
      ml.*,
      (ml.quantity * ml.conversion_multiplier) AS normalized_qty,
      CASE
        WHEN (ml.quantity * ml.conversion_multiplier) = 0 THEN NULL
        ELSE round(ml.total_price / (ml.quantity * ml.conversion_multiplier), 6)
      END AS normalized_unit_cost
    FROM mapped_lines ml
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
  current_agg AS (
    SELECT
      internal_product_id,
      product_name,
      category_name,
      report_unit,
      (array_agg(vendor_name ORDER BY total_price DESC))[1] AS primary_vendor,
      (array_agg(vendor_id ORDER BY total_price DESC))[1] AS primary_vendor_id,
      (array_agg(mapping_status ORDER BY CASE mapping_status WHEN 'verified' THEN 0 WHEN 'mapped' THEN 1 ELSE 2 END))[1] AS mapping_status,
      (array_agg(pack_size) FILTER (WHERE pack_size IS NOT NULL))[1] AS pack_size,
      round(sum(total_price)::numeric, 2) AS current_spend,
      round(sum(normalized_qty)::numeric, 4) AS current_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6)
      END AS current_price,
      count(DISTINCT invoice_id)::bigint AS invoice_count,
      max(invoice_date) AS last_purchase
    FROM current_rows
    GROUP BY internal_product_id, product_name, category_name, report_unit
  ),
  previous_agg AS (
    SELECT
      internal_product_id,
      report_unit,
      round(sum(total_price)::numeric, 2) AS previous_spend,
      round(sum(normalized_qty)::numeric, 4) AS previous_qty,
      CASE WHEN sum(normalized_qty) = 0 THEN NULL
           ELSE round(sum(total_price) / sum(normalized_qty), 6)
      END AS previous_price
    FROM previous_rows
    GROUP BY internal_product_id, report_unit
  ),
  joined AS (
    SELECT
      c.internal_product_id AS product_id,
      c.product_name AS product,
      c.primary_vendor AS vendor,
      c.primary_vendor_id AS vendor_id,
      c.category_name AS category,
      c.report_unit AS unit,
      c.pack_size,
      c.current_price,
      p.previous_price,
      c.current_spend,
      COALESCE(p.previous_spend, 0) AS previous_spend,
      c.current_qty,
      c.invoice_count,
      c.last_purchase,
      c.mapping_status,
      CASE
        WHEN c.internal_product_id IS NULL THEN 'not_comparable'
        WHEN c.current_price IS NULL THEN 'not_comparable'
        WHEN p.previous_price IS NULL THEN 'not_comparable'
        WHEN c.report_unit IS DISTINCT FROM p.report_unit THEN 'not_comparable'
        ELSE 'comparable'
      END AS comparability_status,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
        THEN NULL
        ELSE round(c.current_price - p.previous_price, 6)
      END AS price_change,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
        THEN NULL
        WHEN p.previous_price = 0 AND c.current_price = 0 THEN 0
        WHEN p.previous_price = 0 THEN NULL
        ELSE round(((c.current_price - p.previous_price) / abs(p.previous_price)) * 100, 2)
      END AS percentage_change,
      CASE
        WHEN c.internal_product_id IS NULL OR c.current_price IS NULL OR p.previous_price IS NULL
          OR c.report_unit IS DISTINCT FROM p.report_unit
        THEN NULL
        ELSE round((c.current_price - p.previous_price) * c.current_qty, 2)
      END AS estimated_impact
    FROM current_agg c
    LEFT JOIN previous_agg p
      ON p.internal_product_id IS NOT DISTINCT FROM c.internal_product_id
     AND p.report_unit = c.report_unit
  ),
  enriched AS (
    SELECT
      j.*,
      CASE
        WHEN j.comparability_status <> 'comparable' OR j.percentage_change IS NULL THEN 'n/a'
        WHEN abs(j.percentage_change) >= v_outlier_threshold THEN 'outlier'
        ELSE 'normal'
      END AS outlier_status
    FROM joined j
  ),
  comparable AS (
    SELECT * FROM enriched WHERE comparability_status = 'comparable'
  ),
  summary AS (
    SELECT
      (SELECT count(*) FROM comparable WHERE price_change > 0)::int AS products_with_increases,
      (SELECT count(*) FROM comparable WHERE price_change < 0)::int AS products_with_decreases,
      (SELECT round(avg(percentage_change)::numeric, 2) FROM comparable WHERE percentage_change IS NOT NULL) AS average_price_change,
      (SELECT round(coalesce(sum(estimated_impact), 0)::numeric, 2) FROM comparable WHERE estimated_impact > 0) AS estimated_unfavorable_impact,
      (SELECT round(coalesce(sum(estimated_impact), 0)::numeric, 2) FROM comparable WHERE estimated_impact < 0) AS estimated_favorable_impact,
      (SELECT count(*) FROM enriched WHERE comparability_status = 'not_comparable')::int AS non_comparable_count,
      (SELECT count(*) FROM enriched)::int AS total_products,
      (SELECT count(DISTINCT vendor_id) FROM comparable WHERE price_change > 0 AND vendor_id IS NOT NULL)::int AS vendors_driving_increases
  ),
  largest_increase AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'priceChange', price_change,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact
    ) AS obj
    FROM comparable
    WHERE price_change IS NOT NULL
    ORDER BY price_change DESC NULLS LAST
    LIMIT 1
  ),
  largest_decrease AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'priceChange', price_change,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact
    ) AS obj
    FROM comparable
    WHERE price_change IS NOT NULL
    ORDER BY price_change ASC NULLS LAST
    LIMIT 1
  ),
  most_volatile AS (
    SELECT jsonb_build_object(
      'product', product,
      'vendor', vendor,
      'category', category,
      'percentageChange', percentage_change,
      'estimatedImpact', estimated_impact
    ) AS obj
    FROM comparable
    WHERE percentage_change IS NOT NULL
    ORDER BY abs(percentage_change) DESC NULLS LAST
    LIMIT 1
  ),
  ranking AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'product', product,
        'productId', product_id,
        'vendor', vendor,
        'category', category,
        'percentageChange', percentage_change,
        'priceChange', price_change,
        'estimatedImpact', estimated_impact,
        'currentPrice', current_price
      )
      ORDER BY estimated_impact DESC NULLS LAST
    ) AS arr
    FROM (
      SELECT * FROM comparable
      WHERE estimated_impact IS NOT NULL
      ORDER BY estimated_impact DESC NULLS LAST
      LIMIT 20
    ) top_impact
  ),
  -- Histogram buckets of percentage change
  hist AS (
    SELECT
      width_bucket(percentage_change, -50, 50, 10) AS bucket,
      count(*)::int AS count
    FROM comparable
    WHERE percentage_change IS NOT NULL
      AND percentage_change BETWEEN -50 AND 50
    GROUP BY 1
  ),
  distribution AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', bucket,
        'label', CASE bucket
          WHEN 1 THEN '-50 to -40'
          WHEN 2 THEN '-40 to -30'
          WHEN 3 THEN '-30 to -20'
          WHEN 4 THEN '-20 to -10'
          WHEN 5 THEN '-10 to 0'
          WHEN 6 THEN '0 to 10'
          WHEN 7 THEN '10 to 20'
          WHEN 8 THEN '20 to 30'
          WHEN 9 THEN '30 to 40'
          WHEN 10 THEN '40 to 50'
          ELSE 'other'
        END,
        'count', count
      )
      ORDER BY bucket
    ), '[]'::jsonb) AS arr
    FROM hist
  ),
  scatter AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'productId', product_id,
        'product', product,
        'percentageChange', percentage_change,
        'estimatedImpact', estimated_impact,
        'currentSpend', current_spend,
        'category', category
      )
    ), '[]'::jsonb) AS arr
    FROM comparable
    WHERE percentage_change IS NOT NULL AND estimated_impact IS NOT NULL
  ),
  category_inflation AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'category', category,
        'averagePercentageChange', average_percentage_change,
        'unfavorableImpact', unfavorable_impact,
        'productCount', product_count
      )
      ORDER BY average_percentage_change DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        category,
        round(avg(percentage_change)::numeric, 2) AS average_percentage_change,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact > 0)::numeric, 2) AS unfavorable_impact,
        count(*)::int AS product_count
      FROM comparable
      WHERE percentage_change IS NOT NULL
      GROUP BY category
    ) cat
  ),
  vendor_impact AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor,
        'vendorId', vendor_id,
        'unfavorableImpact', unfavorable_impact,
        'favorableImpact', favorable_impact,
        'netImpact', net_impact,
        'productsIncreased', products_increased,
        'productCount', product_count
      )
      ORDER BY unfavorable_impact DESC NULLS LAST
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        vendor,
        vendor_id,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact > 0)::numeric, 2) AS unfavorable_impact,
        round(sum(estimated_impact) FILTER (WHERE estimated_impact < 0)::numeric, 2) AS favorable_impact,
        round(sum(estimated_impact)::numeric, 2) AS net_impact,
        count(*) FILTER (WHERE price_change > 0)::int AS products_increased,
        count(*)::int AS product_count
      FROM comparable
      WHERE vendor IS NOT NULL AND estimated_impact IS NOT NULL
      GROUP BY vendor, vendor_id
    ) ven
  ),
  -- Trend for top volatile / impact products (daily or weekly points in current period)
  top_trend_products AS (
    SELECT product_id
    FROM comparable
    WHERE product_id IS NOT NULL AND percentage_change IS NOT NULL
    ORDER BY abs(COALESCE(estimated_impact, 0)) DESC
    LIMIT 5
  ),
  trend AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'bucket', t.bucket,
        'bucketStart', t.bucket_start,
        'product', t.product_name,
        'productId', t.internal_product_id,
        'unitCost', t.unit_cost
      )
      ORDER BY t.bucket_start, t.product_name
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        cr.invoice_date::text AS bucket,
        cr.invoice_date AS bucket_start,
        cr.internal_product_id,
        cr.product_name,
        round(avg(cr.normalized_unit_cost)::numeric, 6) AS unit_cost
      FROM current_rows cr
      WHERE cr.internal_product_id IN (SELECT product_id FROM top_trend_products)
        AND cr.normalized_unit_cost IS NOT NULL
      GROUP BY cr.invoice_date, cr.internal_product_id, cr.product_name
    ) t
  ),
  filter_options AS (
    SELECT
      COALESCE((
        SELECT jsonb_agg(DISTINCT category_name ORDER BY category_name)
        FROM priced WHERE category_name IS NOT NULL
      ), '[]'::jsonb) AS categories,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', vendor_id, 'name', vendor_name) ORDER BY vendor_name)
        FROM (
          SELECT DISTINCT vendor_id, vendor_name FROM priced WHERE vendor_id IS NOT NULL
        ) v
      ), '[]'::jsonb) AS vendors
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'productsWithIncreases', s.products_with_increases,
      'productsWithDecreases', s.products_with_decreases,
      'averagePriceChange', s.average_price_change,
      'estimatedUnfavorableImpact', s.estimated_unfavorable_impact,
      'estimatedFavorableImpact', s.estimated_favorable_impact,
      'largestPriceIncrease', (SELECT obj FROM largest_increase),
      'largestPriceDecrease', (SELECT obj FROM largest_decrease),
      'mostVolatileProduct', (SELECT obj FROM most_volatile),
      'vendorsDrivingIncreases', s.vendors_driving_increases,
      'nonComparableProducts', s.non_comparable_count,
      'totalProducts', s.total_products
    ),
    'ranking', COALESCE((SELECT arr FROM ranking), '[]'::jsonb),
    'trend', COALESCE((SELECT arr FROM trend), '[]'::jsonb),
    'distribution', COALESCE((SELECT arr FROM distribution), '[]'::jsonb),
    'scatter', COALESCE((SELECT arr FROM scatter), '[]'::jsonb),
    'categoryInflation', COALESCE((SELECT arr FROM category_inflation), '[]'::jsonb),
    'vendorImpact', COALESCE((SELECT arr FROM vendor_impact), '[]'::jsonb),
    'tableRows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'productId', e.product_id,
          'product', e.product,
          'vendor', e.vendor,
          'vendorId', e.vendor_id,
          'category', e.category,
          'unit', e.unit,
          'packSize', e.pack_size,
          'currentPrice', e.current_price,
          'previousPrice', e.previous_price,
          'priceChange', e.price_change,
          'percentageChange', e.percentage_change,
          'currentSpend', e.current_spend,
          'estimatedImpact', e.estimated_impact,
          'invoiceCount', e.invoice_count,
          'lastPurchase', e.last_purchase,
          'mappingStatus', e.mapping_status,
          'comparabilityStatus', e.comparability_status,
          'outlierStatus', e.outlier_status
        )
        ORDER BY COALESCE(e.estimated_impact, 0) DESC
      )
      FROM enriched e
    ), '[]'::jsonb),
    'insights', COALESCE((
      SELECT jsonb_agg(ins ORDER BY (ins->>'impact')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', 'unfavorable-impact',
          'impact', abs(s.estimated_unfavorable_impact),
          'text', format(
            'Estimated unfavorable purchasing impact from price increases is $%s.',
            to_char(s.estimated_unfavorable_impact, 'FM999,999,990')
          )
        ) AS ins
        WHERE s.estimated_unfavorable_impact > 0
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'avg-change',
          'impact', abs(COALESCE(s.average_price_change, 0)) * 100,
          'text', format(
            'Average comparable price change is %s%% across %s products.',
            to_char(COALESCE(s.average_price_change, 0), 'FM990.0'),
            s.products_with_increases + s.products_with_decreases
          )
        )
        WHERE s.average_price_change IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'non-comparable',
          'impact', s.non_comparable_count,
          'text', format(
            '%s products are not comparable due to missing product mapping or incompatible units.',
            s.non_comparable_count
          )
        )
        WHERE s.non_comparable_count > 0
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'largest-inc',
          'impact', abs(COALESCE((SELECT (obj->>'estimatedImpact')::numeric FROM largest_increase), 0)),
          'text', format(
            '%s had the largest price increase (%s%%).',
            (SELECT obj->>'product' FROM largest_increase),
            (SELECT obj->>'percentageChange' FROM largest_increase)
          )
        )
        WHERE EXISTS (SELECT 1 FROM largest_increase WHERE obj IS NOT NULL)
      ) insight_rows
    ), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'currency', 'USD',
      'timezone', v_tz,
      'dataFreshness', to_char(now() AT TIME ZONE v_tz, 'YYYY-MM-DD HH24:MI'),
      'priceDefinition', 'Normalized weighted-average unit cost = line total_price / (quantity * COALESCE(conversion_multiplier, 1)). Comparisons require the same internal product and normalized UOM. Incompatible units return not_comparable with null percentage change.',
      'outlierThresholdPercent', v_outlier_threshold,
      'filterOptions', jsonb_build_object(
        'categories', (SELECT categories FROM filter_options),
        'vendors', (SELECT vendors FROM filter_options)
      )
    )
  )
  INTO v_result
  FROM summary s;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;

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
SECURITY DEFINER
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
      NULLIF(trim(ili.vendor_unit), '') AS vendor_unit,
      NULLIF(trim(vi.pack_size), '') AS pack_size,
      i.status
    FROM eligible_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    LEFT JOIN public.products p ON p.id = ili.internal_product_id
    LEFT JOIN public.locations l ON l.id = i.location_id
    LEFT JOIN LATERAL (
      SELECT m.conversion_multiplier
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
  price_history AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'date', invoice_date,
        'unitCost', round(avg(normalized_unit_cost)::numeric, 6),
        'spend', round(sum(total_price)::numeric, 2),
        'quantity', round(sum(normalized_qty)::numeric, 4)
      )
      ORDER BY invoice_date
    ), '[]'::jsonb) AS arr
    FROM current_rows
    WHERE normalized_unit_cost IS NOT NULL
    GROUP BY invoice_date
  ),
  vendor_comparison AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'vendor', vendor_name,
        'vendorId', vendor_id,
        'currentPrice', CASE WHEN sum(normalized_qty) = 0 THEN NULL
                             ELSE round(sum(total_price) / sum(normalized_qty), 6) END,
        'spend', round(sum(total_price)::numeric, 2),
        'invoiceCount', count(DISTINCT invoice_id),
        'unit', (array_agg(report_unit))[1]
      )
      ORDER BY sum(total_price) DESC
    ), '[]'::jsonb) AS arr
    FROM current_rows
    GROUP BY vendor_id, vendor_name
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

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_product
  ON public.invoice_line_items (organization_id, internal_product_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
