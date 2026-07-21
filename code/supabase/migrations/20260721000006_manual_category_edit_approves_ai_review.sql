BEGIN;

DROP FUNCTION IF EXISTS public.update_product_details;

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
  p_name text,
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
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_updated public.products%ROWTYPE;
  v_category text;
  v_accounting_category text;
  v_category_changed boolean;
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
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  v_category := NULLIF(trim(COALESCE(p_category, '')), '');
  v_accounting_category := NULLIF(trim(COALESCE(p_accounting_category, '')), '');
  v_category_changed :=
    COALESCE(v_product.category, '') IS DISTINCT FROM COALESCE(v_category, '')
    OR COALESCE(v_product.accounting_category, '') IS DISTINCT FROM COALESCE(v_accounting_category, '');

  UPDATE public.products
     SET name = upper(trim(p_name)),
         product_id = NULLIF(trim(COALESCE(p_restops_product_id, '')), ''),
         description = NULLIF(trim(COALESCE(p_description, '')), ''),
         category = v_category,
         accounting_category = v_accounting_category,
         is_tax_exempt = COALESCE(p_is_tax_exempt, false),
         report_by_unit = NULLIF(trim(COALESCE(p_report_by_unit, '')), ''),
         base_unit = NULLIF(trim(COALESCE(p_base_unit, '')), ''),
         latest_price = COALESCE(p_latest_price, 0),
         location_specific = COALESCE(p_location_specific, false),
         category_source = CASE WHEN v_category_changed THEN 'manual' ELSE category_source END,
         category_review_status = CASE WHEN v_category_changed THEN 'approved' ELSE category_review_status END,
         category_reviewed_at = CASE WHEN v_category_changed THEN now() ELSE category_reviewed_at END,
         category_reviewed_by = CASE WHEN v_category_changed THEN auth.uid() ELSE category_reviewed_by END,
         suggested_category = CASE WHEN v_category_changed THEN NULL ELSE suggested_category END,
         suggested_category_type = CASE WHEN v_category_changed THEN NULL ELSE suggested_category_type END,
         suggested_accounting_category = CASE WHEN v_category_changed THEN NULL ELSE suggested_accounting_category END,
         category_reason = CASE WHEN v_category_changed THEN NULL ELSE category_reason END,
         updated_at = now()
   WHERE id = p_product_id
   RETURNING * INTO v_updated;

  IF p_is_inventoried IS NOT NULL AND p_is_inventoried IS DISTINCT FROM v_product.is_inventoried THEN
    PERFORM public.set_product_inventory_tracking(p_product_id, p_is_inventoried);

    SELECT *
      INTO v_updated
    FROM public.products
    WHERE id = p_product_id;
  ELSIF p_is_inventoried IS NOT NULL THEN
    UPDATE public.products
       SET is_inventoried = p_is_inventoried,
           updated_at = now()
     WHERE id = p_product_id
     RETURNING * INTO v_updated;
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
