BEGIN;

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
  inventory_item_id uuid
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
    COALESCE(vic.vendor_item_count, 0) AS item_count,
    COALESCE(vic.vendor_item_count, 0) AS vendor_item_count,
    inv.id AS inventory_item_id
  FROM product_scope p
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT vim.vendor_item_id)::bigint AS vendor_item_count
    FROM public.vendor_item_mappings vim
    JOIN public.vendor_items vi ON vi.id = vim.vendor_item_id
    WHERE vim.internal_product_id = p.id
      AND vi.organization_id = p.organization_id
  ) vic ON true
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

CREATE OR REPLACE FUNCTION public.set_product_inventory_tracking(
  p_product_id uuid,
  p_is_inventoried boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_inventory_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Product not found');
  END IF;

  IF NOT public.reference_scope_writable(
    v_product.organization_id,
    v_product.brand_id,
    v_product.location_id,
    v_product.deleted_at,
    'location_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  UPDATE public.products
     SET is_inventoried = COALESCE(p_is_inventoried, false),
         updated_at = now()
   WHERE id = p_product_id;

  IF COALESCE(p_is_inventoried, false) THEN
    SELECT i.id
      INTO v_inventory_id
    FROM public.inventory i
    WHERE i.organization_id = v_product.organization_id
      AND (
        i.internal_product_id = v_product.id
        OR (NULLIF(i.product_id, '') IS NOT NULL AND i.product_id = v_product.product_id)
      )
      AND (v_product.location_id IS NULL OR i.location_id IS NULL OR i.location_id IS NOT DISTINCT FROM v_product.location_id)
    ORDER BY
      CASE WHEN i.deleted_at IS NULL THEN 0 ELSE 1 END,
      CASE WHEN i.internal_product_id = v_product.id THEN 0 ELSE 1 END,
      i.updated_at DESC NULLS LAST,
      i.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_inventory_id IS NULL THEN
      INSERT INTO public.inventory (
        organization_id,
        brand_id,
        location_id,
        internal_product_id,
        product_id,
        product_name,
        category,
        accounting_category,
        current_quantity,
        current_unit,
        current_value,
        unit_cost,
        par_level,
        reorder_point,
        report_by,
        deleted_at,
        updated_at
      ) VALUES (
        v_product.organization_id,
        v_product.brand_id,
        v_product.location_id,
        v_product.id,
        v_product.product_id,
        v_product.name,
        v_product.category,
        v_product.accounting_category,
        0,
        COALESCE(NULLIF(v_product.report_by_unit, ''), NULLIF(v_product.base_unit, ''), 'Each'),
        0,
        COALESCE(v_product.latest_price, 0),
        v_product.par_level,
        v_product.reorder_point,
        COALESCE(NULLIF(v_product.report_by_unit, ''), NULLIF(v_product.base_unit, ''), 'Each'),
        NULL,
        now()
      )
      RETURNING id INTO v_inventory_id;
    ELSE
      UPDATE public.inventory
         SET internal_product_id = COALESCE(internal_product_id, v_product.id),
             product_id = COALESCE(NULLIF(product_id, ''), v_product.product_id),
             product_name = COALESCE(NULLIF(product_name, ''), v_product.name),
             category = COALESCE(NULLIF(category, ''), v_product.category),
             accounting_category = COALESCE(NULLIF(accounting_category, ''), v_product.accounting_category),
             current_unit = COALESCE(NULLIF(current_unit, ''), NULLIF(v_product.report_by_unit, ''), NULLIF(v_product.base_unit, ''), 'Each'),
             unit_cost = COALESCE(unit_cost, v_product.latest_price, 0),
             report_by = COALESCE(NULLIF(report_by, ''), NULLIF(v_product.report_by_unit, ''), NULLIF(v_product.base_unit, ''), 'Each'),
             deleted_at = NULL,
             deleted_by = NULL,
             updated_at = now()
       WHERE id = v_inventory_id;
    END IF;
  ELSE
    UPDATE public.inventory i
       SET deleted_at = COALESCE(i.deleted_at, now()),
           deleted_by = COALESCE(i.deleted_by, auth.uid()),
           updated_at = now()
     WHERE i.organization_id = v_product.organization_id
       AND i.deleted_at IS NULL
       AND (
         i.internal_product_id = v_product.id
         OR (NULLIF(i.product_id, '') IS NOT NULL AND i.product_id = v_product.product_id)
       )
       AND (v_product.location_id IS NULL OR i.location_id IS NULL OR i.location_id IS NOT DISTINCT FROM v_product.location_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'is_inventoried', COALESCE(p_is_inventoried, false),
    'inventory_item_id', v_inventory_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

COMMIT;
