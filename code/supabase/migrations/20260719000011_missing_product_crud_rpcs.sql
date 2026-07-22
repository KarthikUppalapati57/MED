-- 20260719000011: create_product_details / update_product_details /
-- set_product_inventory_tracking / soft_delete_product_safe
--
-- Discovered while adding a vendor-quantity field to product creation (tracker item 17.1):
-- Products.jsx's Add/Edit/Delete/inventory-toggle actions all call these 4 RPCs
-- (code/src/lib/apiClient.js api.products.*) but NONE of them exist anywhere -- not in the
-- live DB, not in any migration file. The entire Products page write path has never worked.
--
-- products is a REFERENCE table (brand-shared + location-specific hybrid, CLAUDE.md section
-- 4) and already has the correct RLS policies for this using reference_scope_writable() --
-- operational_products_insert/update already exist and are correct. These RPCs reuse that
-- exact same helper explicitly (SECURITY DEFINER functions bypass RLS, so they need their own
-- check) rather than re-deriving the write rule, so RPC and any future direct-table-write path
-- stay consistent.

BEGIN;

-- DROP first: CREATE OR REPLACE cannot change parameter defaults
-- (earlier workflow RPC used DEFAULT NULL; this version uses true/false/0).
DROP FUNCTION IF EXISTS public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.set_product_inventory_tracking(uuid, boolean);
DROP FUNCTION IF EXISTS public.soft_delete_product_safe(uuid);

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

  RETURN to_jsonb(v_product);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_inventory_tracking(
  p_product_id uuid,
  p_is_inventoried boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, v_existing.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this product';
  END IF;

  UPDATE public.products SET is_inventoried = p_is_inventoried, updated_at = now() WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'id', p_product_id, 'is_inventoried', p_is_inventoried);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, v_existing.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this product';
  END IF;

  UPDATE public.products SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_product_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;

COMMIT;
