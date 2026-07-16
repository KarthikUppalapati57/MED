BEGIN;

CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
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

  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this product';
  END IF;

  UPDATE public.products
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         updated_at = now()
   WHERE id = p_product_id;

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

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
