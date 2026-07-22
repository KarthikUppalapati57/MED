BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_inventory_for_invoiced_products(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_count integer := 0;
  v_marked_count integer := 0;
BEGIN
  WITH invoice_products AS (
    SELECT DISTINCT
      i.organization_id,
      i.brand_id,
      i.location_id,
      l.name AS location_name,
      p.id AS internal_product_id,
      p.product_id,
      p.name AS product_name,
      p.category,
      p.accounting_category,
      COALESCE(p.report_by_unit, p.base_unit, 'Each') AS unit,
      COALESCE(p.latest_price, 0) AS unit_cost
    FROM public.invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    JOIN public.products p ON p.id = ili.internal_product_id
    LEFT JOIN public.locations l ON l.id = i.location_id
    WHERE i.id = p_invoice_id
      AND i.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND ili.internal_product_id IS NOT NULL
  ), marked AS (
    UPDATE public.products p
       SET is_inventoried = true,
           updated_at = now()
      FROM invoice_products ip
     WHERE p.id = ip.internal_product_id
       AND COALESCE(p.is_inventoried, false) IS DISTINCT FROM true
    RETURNING p.id
  ), inserted AS (
    INSERT INTO public.inventory (
      organization_id,
      brand_id,
      location_id,
      internal_product_id,
      product_id,
      product_name,
      category,
      accounting_category,
      location,
      current_quantity,
      current_unit,
      current_value,
      previous_quantity,
      previous_value,
      unit_cost,
      report_by,
      conversion_rates,
      created_at,
      updated_at
    )
    SELECT
      ip.organization_id,
      ip.brand_id,
      ip.location_id,
      ip.internal_product_id,
      ip.product_id,
      ip.product_name,
      ip.category,
      ip.accounting_category,
      ip.location_name,
      0,
      ip.unit,
      0,
      0,
      0,
      ip.unit_cost,
      ip.unit,
      '{}'::jsonb,
      now(),
      now()
    FROM invoice_products ip
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.inventory inv
      WHERE inv.organization_id = ip.organization_id
        AND inv.location_id IS NOT DISTINCT FROM ip.location_id
        AND inv.internal_product_id = ip.internal_product_id
        AND inv.deleted_at IS NULL
    )
    RETURNING id
  )
  SELECT
    (SELECT count(*) FROM marked),
    (SELECT count(*) FROM inserted)
  INTO v_marked_count, v_created_count;

  RETURN jsonb_build_object(
    'status', 'success',
    'marked_products_count', v_marked_count,
    'created_inventory_count', v_created_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_invoice_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM public.ensure_inventory_for_invoiced_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    PERFORM set_config('app.invoice_product_sync', 'on', true);
    PERFORM public.sync_invoice_products(NEW.id);
    PERFORM public.ensure_inventory_for_invoiced_products(NEW.id);
    PERFORM set_config('app.invoice_product_sync', '', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.invoice_product_sync', '', true);
  RAISE;
END;
$$;

WITH approved_invoice_products AS (
  SELECT DISTINCT
    i.id AS invoice_id,
    i.organization_id,
    i.brand_id,
    i.location_id,
    l.name AS location_name,
    p.id AS internal_product_id,
    p.product_id,
    p.name AS product_name,
    p.category,
    p.accounting_category,
    COALESCE(p.report_by_unit, p.base_unit, 'Each') AS unit,
    COALESCE(p.latest_price, 0) AS unit_cost
  FROM public.invoices i
  JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
  JOIN public.products p ON p.id = ili.internal_product_id
  LEFT JOIN public.locations l ON l.id = i.location_id
  WHERE i.status = 'approved'
    AND i.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND ili.internal_product_id IS NOT NULL
), marked AS (
  UPDATE public.products p
     SET is_inventoried = true,
         updated_at = now()
    FROM approved_invoice_products aip
   WHERE p.id = aip.internal_product_id
     AND COALESCE(p.is_inventoried, false) IS DISTINCT FROM true
  RETURNING p.id
)
INSERT INTO public.inventory (
  organization_id,
  brand_id,
  location_id,
  internal_product_id,
  product_id,
  product_name,
  category,
  accounting_category,
  location,
  current_quantity,
  current_unit,
  current_value,
  previous_quantity,
  previous_value,
  unit_cost,
  report_by,
  conversion_rates,
  created_at,
  updated_at
)
SELECT
  aip.organization_id,
  aip.brand_id,
  aip.location_id,
  aip.internal_product_id,
  aip.product_id,
  aip.product_name,
  aip.category,
  aip.accounting_category,
  aip.location_name,
  0,
  aip.unit,
  0,
  0,
  0,
  aip.unit_cost,
  aip.unit,
  '{}'::jsonb,
  now(),
  now()
FROM approved_invoice_products aip
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory inv
  WHERE inv.organization_id = aip.organization_id
    AND inv.location_id IS NOT DISTINCT FROM aip.location_id
    AND inv.internal_product_id = aip.internal_product_id
    AND inv.deleted_at IS NULL
);

GRANT EXECUTE ON FUNCTION public.ensure_inventory_for_invoiced_products(uuid) TO authenticated, service_role;

COMMIT;