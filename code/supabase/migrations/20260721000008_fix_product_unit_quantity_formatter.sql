BEGIN;

CREATE OR REPLACE FUNCTION public.format_product_unit_quantity(p_quantity numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(trim(to_char(COALESCE(p_quantity, 0), 'FM999999999999990.9999')), '\.$', '');
$$;

WITH latest_units AS (
  SELECT DISTINCT ON (p.id)
    p.id AS product_id,
    public.derive_product_report_unit(
      COALESCE(ili.vendor_unit, vi.vendor_unit),
      COALESCE(ili.pack_size, vi.pack_size)
    ) AS report_unit
  FROM public.products p
  LEFT JOIN public.invoice_line_items ili ON ili.internal_product_id = p.id
  LEFT JOIN public.invoices invc ON invc.id = ili.invoice_id
  LEFT JOIN public.vendor_item_mappings vim ON vim.internal_product_id = p.id
  LEFT JOIN public.vendor_items vi ON vi.id = vim.vendor_item_id
  WHERE p.deleted_at IS NULL
    AND (
      NULLIF(trim(COALESCE(ili.pack_size, '')), '') IS NOT NULL
      OR NULLIF(trim(COALESCE(vi.pack_size, '')), '') IS NOT NULL
      OR NULLIF(trim(COALESCE(ili.vendor_unit, vi.vendor_unit, '')), '') IS NOT NULL
    )
  ORDER BY p.id, invc.invoice_date DESC NULLS LAST, ili.created_at DESC NULLS LAST, vi.last_purchased_at DESC NULLS LAST
)
UPDATE public.products p
   SET report_by_unit = latest_units.report_unit,
       base_unit = CASE
         WHEN public.product_unit_is_generic(p.base_unit) OR p.base_unit = p.report_by_unit THEN latest_units.report_unit
         ELSE p.base_unit
       END,
       updated_at = now()
  FROM latest_units
 WHERE p.id = latest_units.product_id
   AND latest_units.report_unit IS NOT NULL
   AND (
     public.product_unit_is_generic(p.report_by_unit)
     OR p.report_by_unit ~ '^[0-9]+(\.[0-9]+)?\s'
   );

UPDATE public.inventory inv
   SET current_unit = CASE
         WHEN public.product_unit_is_generic(inv.current_unit) OR inv.current_unit ~ '^[0-9]+(\.[0-9]+)?\s' THEN p.report_by_unit
         ELSE inv.current_unit
       END,
       report_by = CASE
         WHEN public.product_unit_is_generic(inv.report_by) OR inv.report_by ~ '^[0-9]+(\.[0-9]+)?\s' THEN p.report_by_unit
         ELSE inv.report_by
       END,
       updated_at = now()
  FROM public.products p
 WHERE inv.deleted_at IS NULL
   AND p.deleted_at IS NULL
   AND NULLIF(trim(COALESCE(p.report_by_unit, '')), '') IS NOT NULL
   AND (
     inv.internal_product_id = p.id
     OR inv.product_id = p.product_id
   )
   AND (
     public.product_unit_is_generic(inv.current_unit)
     OR public.product_unit_is_generic(inv.report_by)
     OR inv.current_unit ~ '^[0-9]+(\.[0-9]+)?\s'
     OR inv.report_by ~ '^[0-9]+(\.[0-9]+)?\s'
   );

NOTIFY pgrst, 'reload schema';

COMMIT;
