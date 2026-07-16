BEGIN;

CREATE OR REPLACE FUNCTION public.get_product_verification_queue(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  vendor_item_id uuid,
  vendor_item_code text,
  vendor_item_name text,
  vendor_name text,
  vendor_unit text,
  last_price numeric,
  last_purchased_at date,
  mapping_id uuid,
  internal_product_id uuid,
  restops_product_id text,
  product_name text,
  category_type text,
  category text,
  match_confidence numeric,
  mapping_status text,
  needs_verification boolean
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
  WITH vendor_queue AS (
    SELECT
      vi.id AS vendor_item_id,
      vi.vendor_item_code,
      vi.vendor_item_name,
      v.name AS vendor_name,
      vi.vendor_unit,
      vi.last_price,
      vi.last_purchased_at,
      vim.id AS mapping_id,
      vim.internal_product_id,
      p.product_id AS restops_product_id,
      p.name AS product_name,
      public.derive_product_category_type(p.accounting_category, p.category, COALESCE(p.name, vi.vendor_item_name)) AS category_type,
      COALESCE(NULLIF(p.suggested_category, ''), public.derive_product_category(p.category, COALESCE(p.name, vi.vendor_item_name))) AS category,
      COALESCE(p.category_confidence, vi.match_confidence, CASE WHEN vim.is_verified THEN 100 ELSE 0 END) AS match_confidence,
      COALESCE(vi.mapping_status, CASE WHEN vim.id IS NULL THEN 'unmapped' WHEN vim.is_verified THEN 'verified' ELSE 'suggested' END) AS mapping_status,
      (vim.id IS NULL OR COALESCE(vim.is_verified, false) = false OR COALESCE(vi.match_confidence, 0) < 90) AS needs_verification
    FROM public.vendor_items vi
    LEFT JOIN public.vendors v ON v.id = vi.vendor_id
    LEFT JOIN public.vendor_item_mappings vim ON vim.vendor_item_id = vi.id
    LEFT JOIN public.products p ON p.id = vim.internal_product_id AND p.deleted_at IS NULL
    WHERE vi.organization_id = v_org_id
      AND (p_search IS NULL OR vi.vendor_item_name ILIKE '%' || p_search || '%' OR COALESCE(p.name, '') ILIKE '%' || p_search || '%')
      AND (
        p_brand_id IS NULL
        OR p.brand_id IS NOT DISTINCT FROM p_brand_id
        OR p.id IS NULL
      )
      AND (
        p_location_id IS NULL
        OR p.location_id IS NOT DISTINCT FROM p_location_id
        OR p.id IS NULL
      )
  ),
  product_category_queue AS (
    SELECT
      NULL::uuid AS vendor_item_id,
      NULL::text AS vendor_item_code,
      p.name AS vendor_item_name,
      'Product Catalog'::text AS vendor_name,
      p.report_by_unit AS vendor_unit,
      p.latest_price AS last_price,
      p.updated_at::date AS last_purchased_at,
      NULL::uuid AS mapping_id,
      p.id AS internal_product_id,
      p.product_id AS restops_product_id,
      p.name AS product_name,
      COALESCE(p.suggested_category_type, public.derive_product_category_type(p.accounting_category, COALESCE(p.suggested_category, p.category), p.name)) AS category_type,
      COALESCE(NULLIF(p.suggested_category, ''), public.derive_product_category(p.category, p.name)) AS category,
      COALESCE(p.category_confidence, 0) AS match_confidence,
      CASE
        WHEN p.category_review_status = 'pending' THEN 'suggested'
        WHEN p.category_review_status = 'rejected' THEN 'rejected'
        ELSE 'unmapped'
      END AS mapping_status,
      true AS needs_verification
    FROM public.products p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NOT DISTINCT FROM p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NOT DISTINCT FROM p_location_id)
      AND public.reference_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
      AND (
        p.category_review_status = 'pending'
        OR NULLIF(trim(COALESCE(p.category, '')), '') IS NULL
        OR lower(trim(p.category)) = 'uncategorized'
      )
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR COALESCE(p.suggested_category, '') ILIKE '%' || p_search || '%')
  ),
  queue AS (
    SELECT * FROM vendor_queue vq WHERE vq.needs_verification
    UNION ALL
    SELECT * FROM product_category_queue
  )
  SELECT *
  FROM queue q
  WHERE (p_status IS NULL OR p_status = 'all' OR q.mapping_status = p_status)
  ORDER BY q.last_purchased_at DESC NULLS LAST, q.vendor_item_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;

COMMIT;
