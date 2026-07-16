BEGIN;

CREATE OR REPLACE FUNCTION public.get_product_purchase_report(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_category_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  restaurant text,
  product_id uuid,
  restops_product_id text,
  product_name text,
  category_type text,
  category text,
  report_by text,
  invoice_count bigint,
  line_count bigint,
  purchased_units numeric,
  purchased_amount numeric,
  latest_cost numeric,
  avg_cost numeric,
  last_purchased_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  RETURN QUERY
  WITH approved_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (i.status = 'approved' OR i.ap_status = 'approved')
      AND (p_brand_id IS NULL OR i.brand_id IS NOT DISTINCT FROM p_brand_id OR i.brand_id IS NULL)
      AND (p_location_id IS NULL OR i.location_id IS NOT DISTINCT FROM p_location_id OR i.location_id IS NULL)
      AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
      AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
  ),
  normalized_lines AS (
    SELECT
      i.id AS invoice_id,
      i.invoice_date,
      i.organization_id,
      i.brand_id,
      i.location_id,
      i.vendor_id,
      ili.id AS line_id,
      ili.item_name,
      ili.quantity,
      ili.unit_price,
      ili.total_price,
      ili.vendor_unit,
      ili.internal_product_id,
      ili.inventory_item_id::text AS inventory_item_id
    FROM approved_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    WHERE public.tenant_scope_visible(ili.organization_id, i.brand_id, i.location_id, NULL)
  ),
  json_lines AS (
    SELECT
      i.id AS invoice_id,
      i.invoice_date,
      i.organization_id,
      i.brand_id,
      i.location_id,
      i.vendor_id,
      gen_random_uuid() AS line_id,
      trim(COALESCE(
        NULLIF(item.value->>'description', ''),
        NULLIF(item.value->>'item_name', ''),
        NULLIF(item.value->>'name', ''),
        'Unknown Item'
      )) AS item_name,
      amounts.quantity,
      amounts.unit_price,
      COALESCE(amounts.extended_price, amounts.total_price, amounts.quantity * amounts.unit_price) AS total_price,
      COALESCE(NULLIF(item.value->>'vendor_unit', ''), NULLIF(item.value->>'unit', '')) AS vendor_unit,
      CASE
        WHEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id')::uuid
        ELSE NULL
      END AS internal_product_id,
      NULLIF(item.value->>'inventory_item_id', '') AS inventory_item_id
    FROM approved_invoices i
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.line_items, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinal)
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'quantity', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 1) AS quantity,
        COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'unit_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS unit_price,
        NULLIF(regexp_replace(COALESCE(item.value->>'extended_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS extended_price,
        NULLIF(regexp_replace(COALESCE(item.value->>'total_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS total_price
    ) amounts
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.invoice_line_items ili
        WHERE ili.invoice_id = i.id
      )
      AND NULLIF(trim(COALESCE(
        item.value->>'description',
        item.value->>'item_name',
        item.value->>'name',
        ''
      )), '') IS NOT NULL
  ),
  approved_lines AS (
    SELECT * FROM normalized_lines
    UNION ALL
    SELECT * FROM json_lines
  ),
  enriched AS (
    SELECT
      COALESCE(l.name, 'Current Store') AS restaurant,
      p.id AS product_id,
      p.product_id AS restops_product_id,
      COALESCE(p.name, al.item_name) AS product_name,
      public.derive_product_category_type(p.accounting_category, p.category, COALESCE(p.name, al.item_name)) AS category_type,
      public.derive_product_category(p.category, COALESCE(p.name, al.item_name)) AS category,
      public.normalize_product_report_unit(COALESCE(p.report_by_unit, al.vendor_unit)) AS report_by,
      al.invoice_id,
      al.line_id,
      COALESCE(al.quantity, 0) AS quantity,
      COALESCE(al.total_price, COALESCE(al.quantity, 0) * COALESCE(al.unit_price, 0)) AS total_price,
      COALESCE(al.unit_price, 0) AS unit_price,
      al.invoice_date
    FROM approved_lines al
    LEFT JOIN public.products p
      ON p.id = al.internal_product_id
      OR (al.inventory_item_id IS NOT NULL AND p.product_id = al.inventory_item_id)
    LEFT JOIN public.locations l ON l.id = al.location_id
    WHERE (p_search IS NULL OR COALESCE(p.name, al.item_name, '') ILIKE '%' || p_search || '%')
  )
  SELECT
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by,
    count(DISTINCT e.invoice_id) AS invoice_count,
    count(e.line_id) AS line_count,
    round(sum(e.quantity), 4) AS purchased_units,
    round(sum(e.total_price), 2) AS purchased_amount,
    (array_agg(e.unit_price ORDER BY e.invoice_date DESC NULLS LAST, e.line_id DESC))[1] AS latest_cost,
    round(sum(e.total_price) / NULLIF(sum(e.quantity), 0), 4) AS avg_cost,
    max(e.invoice_date) AS last_purchased_at
  FROM enriched e
  WHERE (p_category_type IS NULL OR p_category_type = 'all' OR e.category_type = p_category_type)
    AND (p_category IS NULL OR p_category = 'all' OR e.category = p_category)
  GROUP BY
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by
  ORDER BY e.product_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
