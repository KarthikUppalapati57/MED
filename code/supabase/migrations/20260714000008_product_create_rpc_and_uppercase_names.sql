BEGIN;

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
  p_latest_price numeric DEFAULT NULL,
  p_location_specific boolean DEFAULT false,
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_brand_id uuid := p_brand_id;
  v_location_id uuid := p_location_id;
  v_product_id text := NULLIF(trim(COALESCE(p_restops_product_id, '')), '');
  v_created public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  IF v_brand_id IS NULL THEN
    SELECT p.brand_id INTO v_brand_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = v_org_id
      AND p.deleted_at IS NULL;
  END IF;

  IF v_location_id IS NULL THEN
    SELECT p.location_id INTO v_location_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = v_org_id
      AND p.deleted_at IS NULL;
  END IF;

  IF NOT public.product_write_allowed(v_org_id, v_brand_id, v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to create products for this scope';
  END IF;

  IF v_product_id IS NULL THEN
    v_product_id := public.generate_restops_product_id();
  END IF;

  INSERT INTO public.products (
    organization_id,
    brand_id,
    location_id,
    product_id,
    name,
    description,
    category,
    accounting_category,
    is_inventoried,
    is_tax_exempt,
    report_by_unit,
    base_unit,
    latest_price,
    location_specific,
    created_by,
    updated_at
  ) VALUES (
    v_org_id,
    v_brand_id,
    v_location_id,
    v_product_id,
    upper(trim(p_name)),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    NULLIF(trim(COALESCE(p_category, '')), ''),
    NULLIF(trim(COALESCE(p_accounting_category, '')), ''),
    COALESCE(p_is_inventoried, false),
    COALESCE(p_is_tax_exempt, false),
    NULLIF(trim(COALESCE(p_report_by_unit, '')), ''),
    NULLIF(trim(COALESCE(p_base_unit, '')), ''),
    COALESCE(p_latest_price, 0),
    COALESCE(p_location_specific, false),
    auth.uid(),
    now()
  )
  RETURNING * INTO v_created;

  IF COALESCE(p_is_inventoried, false) THEN
    PERFORM public.set_product_inventory_tracking(v_created.id, true);

    SELECT *
      INTO v_created
    FROM public.products
    WHERE id = v_created.id;
  END IF;

  RETURN v_created;
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
     SET name = upper(trim(p_name)),
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

GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
