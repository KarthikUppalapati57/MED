-- 20260719000013: Friendly error on duplicate product_id
--
-- Re-checks tracker items 17.4/17.6 against live state: products.product_id already has a
-- genuine, unconditionally-enforced UNIQUE constraint (products_product_id_key, since
-- 001_initial_schema.sql) -- a duplicate literally cannot be saved today. The earlier audit
-- that flagged 17.4/17.6 as gaps was wrong (it conflated a comment in
-- 106_schema_hardening_and_perfect_tables.sql about a different column's backfill join with
-- this constraint). No new constraint is needed.
--
-- The one real, small gap: create_product_details/update_product_details (20260719000011) let
-- the raw Postgres unique_violation ("duplicate key value violates unique constraint
-- \"products_product_id_key\"") bubble straight up to the UI's toast.error(). This wraps the
-- insert/update in an exception handler that re-raises a message a user can actually act on.

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
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_my_org());
  v_brand_id uuid;
  v_location_id uuid;
  v_product public.products%ROWTYPE;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF p_location_specific THEN
    v_location_id := COALESCE(p_location_id, (SELECT location_id FROM public.profiles WHERE id = auth.uid()));
    v_brand_id := COALESCE(p_brand_id, (SELECT brand_id FROM public.locations WHERE id = v_location_id));
  ELSE
    v_location_id := NULL;
    v_brand_id := p_brand_id;
  END IF;

  IF NOT public.reference_scope_writable(v_org_id, v_brand_id, v_location_id, NULL, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to create this product';
  END IF;

  BEGIN
    INSERT INTO public.products (
      name, product_id, description, category, accounting_category,
      is_inventoried, is_tax_exempt, report_by_unit, base_unit, latest_price,
      location_specific, organization_id, brand_id, location_id, created_by
    ) VALUES (
      btrim(p_name), p_restops_product_id, p_description, p_category, p_accounting_category,
      p_is_inventoried, p_is_tax_exempt, p_report_by_unit, p_base_unit, p_latest_price,
      p_location_specific, v_org_id, v_brand_id, v_location_id, auth.uid()
    )
    RETURNING * INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM ILIKE '%products_product_id_key%' THEN
      RAISE EXCEPTION 'Product ID "%" is already in use. Choose a different one.', p_restops_product_id;
    END IF;
    RAISE;
  END;

  RETURN to_jsonb(v_product);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
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
  p_location_specific boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
  v_product public.products%ROWTYPE;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, v_existing.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this product';
  END IF;

  BEGIN
    UPDATE public.products SET
      name = btrim(p_name),
      product_id = COALESCE(p_restops_product_id, product_id),
      description = p_description,
      category = p_category,
      accounting_category = COALESCE(p_accounting_category, accounting_category),
      is_inventoried = p_is_inventoried,
      is_tax_exempt = p_is_tax_exempt,
      report_by_unit = p_report_by_unit,
      base_unit = p_base_unit,
      latest_price = p_latest_price,
      location_specific = p_location_specific,
      updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM ILIKE '%products_product_id_key%' THEN
      RAISE EXCEPTION 'Product ID "%" is already in use. Choose a different one.', p_restops_product_id;
    END IF;
    RAISE;
  END;

  RETURN to_jsonb(v_product);
END;
$$;

COMMIT;
