BEGIN;

-- Organization-level reference rows (brand_id IS NULL AND location_id IS NULL) are the
-- default product shape for many tenants. 20260721191500 made every reference row require
-- an active location and then returned false for this org-level tier, so Products /
-- get_product_catalog could hide an entire org catalog even though rows exist.
--
-- After this change:
--   * Same organization only (tenant/org isolation unchanged via organization_id match)
--   * Org-level rows are visible to callers in that organization (no location required)
--   * Brand-shared / location-specific rows still require an active location and match
--     the previous exact brand / location rules
--
-- Also widen get_product_catalog's optional brand/location filters so passing the active
-- brand/location (Products page + Recipe Unit Conversion) still includes ancestor scopes:
-- org-level and brand-shared rows remain in the catalog alongside exact location matches.

CREATE OR REPLACE FUNCTION public.reference_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
  v_location_id uuid;
  v_active_location_brand_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id, location_id
    INTO v_role, v_org_id, v_location_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  -- Tenant / organization isolation: never leak across organizations.
  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Organization-level reference row (shared across the org catalog).
  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RETURN true;
  END IF;

  -- Brand-shared and location-specific rows still require an active location.
  IF v_location_id IS NULL THEN
    RETURN false;
  END IF;

  -- Location-specific reference row: exact match.
  IF p_location_id IS NOT NULL THEN
    RETURN p_location_id = v_location_id;
  END IF;

  -- Brand-shared reference row (location intentionally NULL): visible when it matches the
  -- brand of the caller's currently active location.
  IF p_brand_id IS NOT NULL THEN
    SELECT l.brand_id INTO v_active_location_brand_id
    FROM public.locations l
    WHERE l.id = v_location_id;

    RETURN p_brand_id IS NOT NULL AND p_brand_id = v_active_location_brand_id;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone)
  TO authenticated, service_role;

-- Keep Products and Recipe Unit Conversion on the same inclusive catalog when the UI
-- passes the active brand/location context.
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
      -- Inclusive hierarchy filter: org-level + matching brand-shared + exact location.
      AND (
        p_brand_id IS NULL
        OR p.brand_id IS NULL
        OR p.brand_id IS NOT DISTINCT FROM p_brand_id
      )
      AND (
        p_location_id IS NULL
        OR p.location_id IS NULL
        OR p.location_id IS NOT DISTINCT FROM p_location_id
      )
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

GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
