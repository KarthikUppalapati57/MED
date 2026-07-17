BEGIN;

-- The inventory page reads wastage_logs through the soft-delete entity client.
ALTER TABLE public.wastage_logs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_wastage_logs_deleted_at
  ON public.wastage_logs(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Recreate the product catalog RPC without the removed products.preferred_vendor_id
-- column and include vendor names for the Products table display.
DROP FUNCTION IF EXISTS public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_product_catalog(
  p_organization_id uuid DEFAULT NULL,
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
  category_confidence numeric,
  category_source text,
  category_review_status text,
  suggested_category text,
  suggested_category_type text,
  suggested_accounting_category text,
  category_reason text,
  is_inventoried boolean,
  is_tax_exempt boolean,
  report_by_unit text,
  base_unit text,
  latest_price numeric,
  location_specific boolean,
  organization_id uuid,
  brand_id uuid,
  location_id uuid,
  created_at timestamptz,
  item_count bigint,
  vendor_item_count bigint,
  inventory_item_id uuid,
  vendor_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_page integer := GREATEST(COALESCE(p_page, 0), 0);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
  v_sort_by text := COALESCE(NULLIF(p_sort_by, ''), 'name');
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  RETURN QUERY
  WITH product_scope AS (
    SELECT p.*
    FROM public.products p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NOT DISTINCT FROM p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NOT DISTINCT FROM p_location_id)
      AND public.reference_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
      AND (
        p_search IS NULL
        OR p.name ILIKE '%' || p_search || '%'
        OR COALESCE(p.description, '') ILIKE '%' || p_search || '%'
        OR COALESCE(p.product_id, '') ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.description,
    p.category,
    p.accounting_category,
    p.category_confidence,
    p.category_source,
    p.category_review_status,
    p.suggested_category,
    p.suggested_category_type,
    p.suggested_accounting_category,
    p.category_reason,
    p.is_inventoried,
    p.is_tax_exempt,
    p.report_by_unit,
    p.base_unit,
    p.latest_price,
    p.location_specific,
    p.organization_id,
    p.brand_id,
    p.location_id,
    p.created_at,
    COALESCE(vendor_info.vendor_item_count, 0) AS item_count,
    COALESCE(vendor_info.vendor_item_count, 0) AS vendor_item_count,
    inv.id AS inventory_item_id,
    vendor_info.vendor_name
  FROM product_scope p
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT vim.vendor_item_id)::bigint AS vendor_item_count,
      string_agg(DISTINCT v.name, ', ' ORDER BY v.name) AS vendor_name
    FROM public.vendor_item_mappings vim
    JOIN public.vendor_items vi ON vi.id = vim.vendor_item_id
    LEFT JOIN public.vendors v ON v.id = vi.vendor_id
    WHERE vim.internal_product_id = p.id
      AND vim.organization_id = p.organization_id
      AND vi.organization_id = p.organization_id
  ) vendor_info ON true
  LEFT JOIN LATERAL (
    SELECT i.id
    FROM public.inventory i
    WHERE i.organization_id = p.organization_id
      AND i.deleted_at IS NULL
      AND (
        i.internal_product_id = p.id
        OR (NULLIF(i.product_id, '') IS NOT NULL AND i.product_id = p.product_id)
      )
      AND (p.location_id IS NULL OR i.location_id IS NULL OR i.location_id IS NOT DISTINCT FROM p.location_id)
    ORDER BY
      CASE WHEN i.internal_product_id = p.id THEN 0 ELSE 1 END,
      i.updated_at DESC NULLS LAST,
      i.created_at DESC NULLS LAST
    LIMIT 1
  ) inv ON true
  ORDER BY
    CASE WHEN v_sort_by = 'name' THEN p.name END ASC NULLS LAST,
    CASE WHEN v_sort_by = '-name' THEN p.name END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'category' THEN p.category END ASC NULLS LAST,
    CASE WHEN v_sort_by = '-category' THEN p.category END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'accounting_category' THEN p.accounting_category END ASC NULLS LAST,
    CASE WHEN v_sort_by = '-accounting_category' THEN p.accounting_category END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'is_inventoried' THEN p.is_inventoried END ASC NULLS LAST,
    CASE WHEN v_sort_by = '-is_inventoried' THEN p.is_inventoried END DESC NULLS LAST,
    CASE WHEN v_sort_by = 'latest_price' THEN p.latest_price END ASC NULLS LAST,
    CASE WHEN v_sort_by = '-latest_price' THEN p.latest_price END DESC NULLS LAST,
    p.name ASC NULLS LAST,
    p.created_at DESC NULLS LAST
  LIMIT v_page_size
  OFFSET v_page * v_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
