-- Minimal Products page RPCs for product catalog workflows.

DROP FUNCTION IF EXISTS public.get_product_dashboard_summary(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text);
DROP FUNCTION IF EXISTS public.get_product_verification_queue(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.set_product_inventory_tracking(uuid, boolean);
DROP FUNCTION IF EXISTS public.soft_delete_product_safe(uuid);
DROP FUNCTION IF EXISTS public.apply_product_category_suggestion(uuid);
DROP FUNCTION IF EXISTS public.reject_product_category_suggestion(uuid);

CREATE OR REPLACE FUNCTION public.get_product_dashboard_summary(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_products bigint,
  inventoried_count bigint,
  tax_exempt_count bigint,
  category_count bigint,
  missing_product_id_count bigint,
  uncategorized_count bigint,
  unmapped_vendor_item_count bigint,
  price_variance_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.products p
    WHERE p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_inventoried IS TRUE)::bigint,
    COUNT(*) FILTER (WHERE is_tax_exempt IS TRUE)::bigint,
    COUNT(DISTINCT NULLIF(accounting_category, ''))::bigint,
    COUNT(*) FILTER (WHERE COALESCE(product_id, '') = '')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(category, '') = '' OR category = 'Uncategorized')::bigint,
    COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.vendor_item_mappings vim
        WHERE vim.internal_product_id = scoped.id
          AND vim.organization_id = scoped.organization_id
      )
    )::bigint,
    0::bigint
  FROM scoped;
$$;

CREATE OR REPLACE FUNCTION public.get_product_purchase_report(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_category_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  restops_product_id text,
  name text,
  description text,
  category text,
  accounting_category text,
  purchased_units numeric,
  purchased_amount numeric,
  latest_cost numeric,
  avg_cost numeric,
  last_purchased_at date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.description,
    p.category,
    p.accounting_category,
    COALESCE(SUM(ili.quantity), 0)::numeric,
    COALESCE(SUM(ili.total_price), 0)::numeric,
    COALESCE(MAX(ili.unit_price), p.latest_price, 0)::numeric,
    COALESCE(AVG(NULLIF(ili.unit_price, 0)), p.average_price, p.latest_price, 0)::numeric,
    MAX(i.invoice_date)::date
  FROM public.products p
  LEFT JOIN public.invoice_line_items ili
    ON ili.internal_product_id = p.id
    AND ili.organization_id = p.organization_id
  LEFT JOIN public.invoices i
    ON i.id = ili.invoice_id
    AND i.organization_id = p.organization_id
    AND i.deleted_at IS NULL
    AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
    AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)
  WHERE p.organization_id = p_organization_id
    AND p.deleted_at IS NULL
    AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
    AND (p_category IS NULL OR p.category = p_category)
    AND (
      COALESCE(NULLIF(p_search, ''), NULL) IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
      OR p.product_id ILIKE '%' || p_search || '%'
    )
  GROUP BY p.id
  ORDER BY COALESCE(SUM(ili.total_price), 0) DESC, p.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_product_verification_queue(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  internal_product_id uuid,
  product_id text,
  name text,
  description text,
  category text,
  accounting_category text,
  suggested_category text,
  suggested_accounting_category text,
  category_confidence numeric,
  category_review_status text,
  latest_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.description,
    p.category,
    p.accounting_category,
    NULL::text,
    NULL::text,
    NULL::numeric,
    'verified'::text,
    p.latest_price
  FROM public.products p
  WHERE p.organization_id = p_organization_id
    AND p.deleted_at IS NULL
    AND (p_brand_id IS NULL OR p.brand_id IS NULL OR p.brand_id = p_brand_id)
    AND (p_location_id IS NULL OR p.location_id IS NULL OR p.location_id = p_location_id)
    AND (
      COALESCE(NULLIF(p_search, ''), NULL) IS NULL
      OR p.name ILIKE '%' || p_search || '%'
      OR p.description ILIKE '%' || p_search || '%'
      OR p.product_id ILIKE '%' || p_search || '%'
    )
  ORDER BY p.updated_at DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.create_product_details(
  p_name text,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT true,
  p_is_tax_exempt boolean DEFAULT false,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT 0,
  p_location_specific boolean DEFAULT false,
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products;
BEGIN
  INSERT INTO public.products (
    organization_id, brand_id, location_id, product_id, name, description,
    category, accounting_category, is_inventoried, is_tax_exempt,
    report_by_unit, base_unit, latest_price, location_specific, status,
    created_by
  )
  VALUES (
    p_organization_id, p_brand_id, p_location_id, p_restops_product_id, p_name, p_description,
    p_category, p_accounting_category, COALESCE(p_is_inventoried, true), COALESCE(p_is_tax_exempt, false),
    p_report_by_unit, p_base_unit, COALESCE(p_latest_price, 0), COALESCE(p_location_specific, false), 'active',
    auth.uid()
  )
  RETURNING * INTO v_product;

  RETURN to_jsonb(v_product);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
  p_name text DEFAULT NULL,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT NULL,
  p_is_tax_exempt boolean DEFAULT NULL,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT NULL,
  p_location_specific boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products;
BEGIN
  UPDATE public.products
  SET
    product_id = p_restops_product_id,
    name = COALESCE(p_name, name),
    description = p_description,
    category = p_category,
    accounting_category = p_accounting_category,
    is_inventoried = COALESCE(p_is_inventoried, is_inventoried),
    is_tax_exempt = COALESCE(p_is_tax_exempt, is_tax_exempt),
    report_by_unit = p_report_by_unit,
    base_unit = p_base_unit,
    latest_price = COALESCE(p_latest_price, latest_price),
    location_specific = COALESCE(p_location_specific, location_specific),
    updated_at = now()
  WHERE id = p_product_id
    AND deleted_at IS NULL
  RETURNING * INTO v_product;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN to_jsonb(v_product);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_product_inventory_tracking(
  p_product_id uuid,
  p_is_inventoried boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products;
BEGIN
  UPDATE public.products
  SET is_inventoried = COALESCE(p_is_inventoried, false),
      updated_at = now()
  WHERE id = p_product_id
    AND deleted_at IS NULL
  RETURNING * INTO v_product;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN to_jsonb(v_product);
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.products
  SET deleted_at = now(),
      deleted_by = auth.uid(),
      updated_at = now()
  WHERE id = p_product_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_product_category_suggestion(p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT to_jsonb(p) FROM public.products p WHERE p.id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION public.reject_product_category_suggestion(p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT to_jsonb(p) FROM public.products p WHERE p.id = p_product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_dashboard_summary(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_product_category_suggestion(uuid) TO authenticated, service_role;
