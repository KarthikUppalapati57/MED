BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_product_count_unit(
  p_product_id uuid,
  p_name text,
  p_quantity numeric,
  p_unit text,
  p_unit_price numeric,
  p_source_quantity numeric,
  p_source_unit text,
  p_source_price numeric
)
RETURNS public.product_count_units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_normalized_name text;
  v_existing_id uuid;
  v_count_unit public.product_count_units%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND deleted_at IS NULL;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  v_normalized_name := lower(trim(COALESCE(p_name, '')));

  IF v_normalized_name = '' THEN
    RAISE EXCEPTION 'Count unit name is required';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Count unit quantity must be greater than zero';
  END IF;

  IF COALESCE(p_source_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Source package quantity must be greater than zero';
  END IF;

  SELECT id
    INTO v_existing_id
  FROM public.product_count_units
  WHERE organization_id = v_product.organization_id
    AND product_id = v_product.id
    AND normalized_name = v_normalized_name
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.product_count_units
       SET brand_id = v_product.brand_id,
           location_id = v_product.location_id,
           name = trim(p_name),
           quantity = p_quantity,
           unit = trim(p_unit),
           unit_price = COALESCE(p_unit_price, 0),
           source_quantity = p_source_quantity,
           source_unit = trim(p_source_unit),
           source_price = COALESCE(p_source_price, 0),
           is_active = true,
           updated_at = now()
     WHERE id = v_existing_id
     RETURNING * INTO v_count_unit;
  ELSE
    INSERT INTO public.product_count_units (
      organization_id,
      brand_id,
      location_id,
      product_id,
      name,
      normalized_name,
      quantity,
      unit,
      unit_price,
      source_quantity,
      source_unit,
      source_price,
      is_active,
      created_by
    )
    VALUES (
      v_product.organization_id,
      v_product.brand_id,
      v_product.location_id,
      v_product.id,
      trim(p_name),
      v_normalized_name,
      p_quantity,
      trim(p_unit),
      COALESCE(p_unit_price, 0),
      p_source_quantity,
      trim(p_source_unit),
      COALESCE(p_source_price, 0),
      true,
      auth.uid()
    )
    RETURNING * INTO v_count_unit;
  END IF;

  RETURN v_count_unit;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_product_count_unit(
  p_count_unit_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_unit public.product_count_units%ROWTYPE;
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_count_unit
  FROM public.product_count_units
  WHERE id = p_count_unit_id
    AND deleted_at IS NULL;

  IF v_count_unit.id IS NULL THEN
    RETURN true;
  END IF;

  SELECT *
    INTO v_product
  FROM public.products
  WHERE id = v_count_unit.product_id
    AND deleted_at IS NULL;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  UPDATE public.product_count_units
     SET deleted_at = now(),
         is_active = false,
         updated_at = now()
   WHERE id = p_count_unit_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_product_count_unit(uuid, text, numeric, text, numeric, numeric, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_product_count_unit(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
