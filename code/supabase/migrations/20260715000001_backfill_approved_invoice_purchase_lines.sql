BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_invoice_line_items_from_json(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_existing_count integer;
  v_inserted_count integer := 0;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)
    INTO v_existing_count
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;

  IF v_existing_count > 0 THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(COALESCE(v_invoice.line_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(v_invoice.line_items, '[]'::jsonb)) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.invoice_line_items (
    invoice_id,
    organization_id,
    vendor_id,
    internal_product_id,
    item_name,
    quantity,
    unit_price,
    total_price,
    vendor_item_code,
    vendor_unit
  )
  SELECT
    v_invoice.id,
    v_invoice.organization_id,
    v_invoice.vendor_id,
    CASE
      WHEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id')::uuid
      ELSE NULL
    END,
    trim(COALESCE(
      NULLIF(item.value->>'description', ''),
      NULLIF(item.value->>'item_name', ''),
      NULLIF(item.value->>'name', ''),
      'Unknown Item'
    )),
    amounts.quantity,
    amounts.unit_price,
    COALESCE(amounts.extended_price, amounts.total_price, amounts.quantity * amounts.unit_price),
    NULLIF(item.value->>'vendor_item_code', ''),
    COALESCE(NULLIF(item.value->>'vendor_unit', ''), NULLIF(item.value->>'unit', ''))
  FROM jsonb_array_elements(v_invoice.line_items) WITH ORDINALITY AS item(value, ordinal)
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'quantity', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 1) AS quantity,
      COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'unit_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS unit_price,
      NULLIF(regexp_replace(COALESCE(item.value->>'extended_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS extended_price,
      NULLIF(regexp_replace(COALESCE(item.value->>'total_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS total_price
  ) amounts
  WHERE NULLIF(trim(COALESCE(
    item.value->>'description',
    item.value->>'item_name',
    item.value->>'name',
    ''
  )), '') IS NOT NULL;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

WITH approved_invoices AS (
  SELECT id
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND (status = 'approved' OR ap_status = 'approved')
)
SELECT public.ensure_invoice_line_items_from_json(id)
FROM approved_invoices;

DELETE FROM public.invoice_sync_log isl
USING public.invoices i
WHERE isl.invoice_id = i.id
  AND isl.operation = 'sync_invoice_products'
  AND i.deleted_at IS NULL
  AND (i.status = 'approved' OR i.ap_status = 'approved');

DO $$
DECLARE
  v_invoice_id uuid;
BEGIN
  FOR v_invoice_id IN
    SELECT i.id
    FROM public.invoices i
    WHERE i.deleted_at IS NULL
      AND (i.status = 'approved' OR i.ap_status = 'approved')
      AND EXISTS (
        SELECT 1
        FROM public.invoice_line_items ili
        WHERE ili.invoice_id = i.id
      )
  LOOP
    PERFORM public.sync_invoice_products(v_invoice_id, NULL);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_invoice_line_items_from_json(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
