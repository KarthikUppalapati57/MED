BEGIN;

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
  v_role text;
  v_user_org_id uuid;
  v_user_tenant_id uuid;
  v_user_brand_id uuid;
  v_user_location_id uuid;
  v_product_tenant_id uuid;
  v_can_write boolean := false;
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

  SELECT
    public.normalize_app_role(p.role),
    p.organization_id,
    p.tenant_id,
    p.brand_id,
    p.location_id
    INTO v_role, v_user_org_id, v_user_tenant_id, v_user_brand_id, v_user_location_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_user_tenant_id IS NULL AND v_user_org_id IS NOT NULL THEN
    SELECT o.tenant_id INTO v_user_tenant_id
    FROM public.organizations o
    WHERE o.id = v_user_org_id;
  END IF;

  SELECT o.tenant_id INTO v_product_tenant_id
  FROM public.organizations o
  WHERE o.id = v_product.organization_id;

  v_can_write := CASE
    WHEN v_role = 'platform_admin' THEN true
    WHEN v_role = 'tenant_super_admin' THEN v_user_tenant_id IS NOT NULL AND v_product_tenant_id = v_user_tenant_id
    WHEN v_role = 'org_manager' THEN v_user_org_id = v_product.organization_id
    WHEN v_role = 'branch_manager' THEN v_user_org_id = v_product.organization_id AND (v_product.brand_id IS NULL OR v_product.brand_id = v_user_brand_id)
    WHEN v_role = 'location_manager' THEN v_user_org_id = v_product.organization_id AND (v_product.location_id IS NULL OR v_product.location_id = v_user_location_id)
    ELSE false
  END;

  IF NOT v_can_write THEN
    RAISE EXCEPTION 'Not authorized to update inventory tracking for this product';
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

GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
