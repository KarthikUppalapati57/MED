-- Product catalog RPC used by the Products page.
-- Keeps pagination/search/sort in Postgres and returns a couple of computed
-- fields the UI expects: item_count/vendor_item_count and last_purchased_at.

CREATE OR REPLACE FUNCTION public.get_product_catalog(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'name',
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  product_id text,
  name text,
  description text,
  category text,
  accounting_category text,
  is_inventoried boolean,
  is_tax_exempt boolean,
  report_by_unit text,
  base_unit text,
  latest_price numeric,
  average_price numeric,
  price_history jsonb,
  preferred_vendor_id uuid,
  par_level numeric,
  reorder_point numeric,
  location_specific boolean,
  locations jsonb,
  status text,
  created_from_invoice_id uuid,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  organization_id uuid,
  location_id uuid,
  brand_id uuid,
  item_count bigint,
  vendor_item_count bigint,
  last_purchased_at date,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 0), 0) * LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_sort text := COALESCE(NULLIF(p_sort_by, ''), 'name');
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.*,
      COUNT(*) OVER () AS total_count,
      COUNT(vim.id) AS item_count,
      MAX(vi.last_purchased_at) AS last_purchased_at
    FROM public.products p
    LEFT JOIN public.vendor_item_mappings vim
      ON vim.internal_product_id = p.id
      AND vim.organization_id = p.organization_id
    LEFT JOIN public.vendor_items vi
      ON vi.id = vim.vendor_item_id
      AND vi.organization_id = p.organization_id
    WHERE p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
      AND (
        COALESCE(NULLIF(p_search, ''), NULL) IS NULL
        OR p.name ILIKE '%' || p_search || '%'
        OR p.description ILIKE '%' || p_search || '%'
        OR p.product_id ILIKE '%' || p_search || '%'
        OR p.category ILIKE '%' || p_search || '%'
        OR p.accounting_category ILIKE '%' || p_search || '%'
      )
    GROUP BY p.id
  )
  SELECT
    b.id,
    b.product_id,
    b.name,
    b.description,
    b.category,
    b.accounting_category,
    b.is_inventoried,
    b.is_tax_exempt,
    b.report_by_unit,
    b.base_unit,
    b.latest_price,
    b.average_price,
    b.price_history,
    b.preferred_vendor_id,
    b.par_level,
    b.reorder_point,
    b.location_specific,
    b.locations,
    b.status,
    b.created_from_invoice_id,
    b.created_by,
    b.created_at,
    b.updated_at,
    b.organization_id,
    b.location_id,
    b.brand_id,
    GREATEST(b.item_count, 1)::bigint AS item_count,
    GREATEST(b.item_count, 1)::bigint AS vendor_item_count,
    b.last_purchased_at,
    b.total_count
  FROM base b
  ORDER BY
    CASE WHEN v_sort = 'name' THEN b.name END ASC NULLS LAST,
    CASE WHEN v_sort = '-name' THEN b.name END DESC NULLS LAST,
    CASE WHEN v_sort = 'category' THEN b.category END ASC NULLS LAST,
    CASE WHEN v_sort = '-category' THEN b.category END DESC NULLS LAST,
    CASE WHEN v_sort = 'accounting_category' THEN b.accounting_category END ASC NULLS LAST,
    CASE WHEN v_sort = '-accounting_category' THEN b.accounting_category END DESC NULLS LAST,
    CASE WHEN v_sort = 'is_inventoried' THEN b.is_inventoried END ASC NULLS LAST,
    CASE WHEN v_sort = '-is_inventoried' THEN b.is_inventoried END DESC NULLS LAST,
    CASE WHEN v_sort = 'is_tax_exempt' THEN b.is_tax_exempt END ASC NULLS LAST,
    CASE WHEN v_sort = '-is_tax_exempt' THEN b.is_tax_exempt END DESC NULLS LAST,
    CASE WHEN v_sort = 'report_by_unit' THEN b.report_by_unit END ASC NULLS LAST,
    CASE WHEN v_sort = '-report_by_unit' THEN b.report_by_unit END DESC NULLS LAST,
    CASE WHEN v_sort = 'latest_price' THEN b.latest_price END ASC NULLS LAST,
    CASE WHEN v_sort = '-latest_price' THEN b.latest_price END DESC NULLS LAST,
    b.name ASC NULLS LAST,
    b.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

