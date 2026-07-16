BEGIN;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_accounting_category_check;

CREATE OR REPLACE FUNCTION public.product_write_allowed(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_user_org_id uuid;
  v_user_tenant_id uuid;
  v_user_brand_id uuid;
  v_user_location_id uuid;
  v_target_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
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

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF v_user_tenant_id IS NULL AND v_user_org_id IS NOT NULL THEN
    SELECT o.tenant_id INTO v_user_tenant_id
    FROM public.organizations o
    WHERE o.id = v_user_org_id;
  END IF;

  SELECT o.tenant_id INTO v_target_tenant_id
  FROM public.organizations o
  WHERE o.id = p_organization_id;

  IF v_role = 'tenant_super_admin' THEN
    RETURN v_user_tenant_id IS NOT NULL AND v_target_tenant_id = v_user_tenant_id;
  END IF;

  IF v_user_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN p_brand_id IS NULL OR v_user_brand_id = p_brand_id;
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN p_location_id IS NULL OR v_user_location_id = p_location_id;
  END IF;

  RETURN false;
END;
$$;

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

  UPDATE public.products
     SET name = NULLIF(trim(p_name), ''),
         product_id = NULLIF(trim(COALESCE(p_restops_product_id, '')), ''),
         description = NULLIF(trim(COALESCE(p_description, '')), ''),
         category = NULLIF(trim(COALESCE(p_category, '')), ''),
         accounting_category = NULLIF(trim(COALESCE(p_accounting_category, '')), ''),
         is_tax_exempt = COALESCE(p_is_tax_exempt, false),
         report_by_unit = NULLIF(trim(COALESCE(p_report_by_unit, '')), ''),
         base_unit = NULLIF(trim(COALESCE(p_base_unit, '')), ''),
         latest_price = COALESCE(p_latest_price, 0),
         location_specific = COALESCE(p_location_specific, false),
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

GRANT EXECUTE ON FUNCTION public.product_write_allowed(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
