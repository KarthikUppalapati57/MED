BEGIN;

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS pack_size text;

ALTER TABLE public.vendor_items
  ADD COLUMN IF NOT EXISTS pack_size text;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS report_by text;

CREATE OR REPLACE FUNCTION public.product_unit_is_generic(p_unit text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(trim(COALESCE(p_unit, '')), '') IS NULL
    OR lower(trim(p_unit)) IN ('ea', 'each', 'other', 'unit', 'units');
$$;

CREATE OR REPLACE FUNCTION public.format_product_unit_quantity(p_quantity numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(regexp_replace(COALESCE(p_quantity, 0)::text, '0+$', ''), '\.$', '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_product_unit_label(
  p_unit text,
  p_quantity numeric DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_unit text := upper(regexp_replace(trim(COALESCE(p_unit, '')), '[^A-Z]', '', 'g'));
  v_plural boolean := COALESCE(p_quantity, 2) <> 1;
BEGIN
  IF v_unit = '' THEN
    RETURN NULL;
  END IF;

  RETURN CASE
    WHEN v_unit IN ('EA', 'EACH', 'EACHES', 'CT', 'COUNT', 'CN') THEN 'Each'
    WHEN v_unit IN ('CS', 'CASE', 'CASES') THEN 'Case'
    WHEN v_unit IN ('LB', 'LBS', 'POUND', 'POUNDS') THEN CASE WHEN v_plural THEN 'Pounds' ELSE 'Pound' END
    WHEN v_unit IN ('OZ', 'OZS', 'OUNCE', 'OUNCES') THEN CASE WHEN v_plural THEN 'Ounces' ELSE 'Ounce' END
    WHEN v_unit IN ('GA', 'GAL', 'GALS', 'GALLON', 'GALLONS') THEN CASE WHEN v_plural THEN 'Gallons' ELSE 'Gallon' END
    WHEN v_unit IN ('L', 'LT', 'LTR', 'LTRS', 'LITER', 'LITERS', 'LITRE', 'LITRES') THEN CASE WHEN v_plural THEN 'Liters' ELSE 'Liter' END
    WHEN v_unit IN ('ML', 'MLS', 'MILLILITER', 'MILLILITERS') THEN CASE WHEN v_plural THEN 'Milliliters' ELSE 'Milliliter' END
    WHEN v_unit IN ('G', 'GM', 'GRAM', 'GRAMS') THEN CASE WHEN v_plural THEN 'Grams' ELSE 'Gram' END
    WHEN v_unit IN ('KG', 'KGS', 'KILOGRAM', 'KILOGRAMS') THEN CASE WHEN v_plural THEN 'Kilograms' ELSE 'Kilogram' END
    WHEN v_unit IN ('BTL', 'BTLS', 'BOTTLE', 'BOTTLES') THEN CASE WHEN v_plural THEN 'Bottles' ELSE 'Bottle' END
    WHEN v_unit IN ('CAN', 'CANS') THEN CASE WHEN v_plural THEN 'Cans' ELSE 'Can' END
    WHEN v_unit IN ('BAG', 'BAGS') THEN CASE WHEN v_plural THEN 'Bags' ELSE 'Bag' END
    WHEN v_unit IN ('BOX', 'BOXES', 'BX') THEN CASE WHEN v_plural THEN 'Boxes' ELSE 'Box' END
    WHEN v_unit IN ('PK', 'PKG', 'PACK', 'PACKAGE') THEN CASE WHEN v_plural THEN 'Packs' ELSE 'Pack' END
    WHEN v_unit IN ('DOZ', 'DOZEN') THEN 'Dozen'
    WHEN v_unit IN ('FLAT', 'FLATS') THEN CASE WHEN v_plural THEN 'Flats' ELSE 'Flat' END
    WHEN v_unit IN ('CUP', 'CUPS') THEN CASE WHEN v_plural THEN 'Cups' ELSE 'Cup' END
    WHEN v_unit IN ('QT', 'QTS', 'QUART', 'QUARTS') THEN CASE WHEN v_plural THEN 'Quarts' ELSE 'Quart' END
    ELSE initcap(lower(v_unit))
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_product_report_unit(
  p_vendor_unit text DEFAULT NULL,
  p_pack_size text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pack text := upper(regexp_replace(trim(COALESCE(p_pack_size, '')), '[^A-Z0-9./ ]', ' ', 'g'));
  v_vendor text := trim(COALESCE(p_vendor_unit, ''));
  v_vendor_label text := public.normalize_product_unit_label(v_vendor);
  v_match text[];
  v_outer numeric;
  v_inner numeric;
  v_qty numeric;
  v_unit text;
  v_unit_label text;
  v_qty_label text;
  v_container_label text;
BEGIN
  IF v_pack = '' AND v_vendor ~ '[0-9]' THEN
    v_pack := upper(regexp_replace(v_vendor, '[^A-Z0-9./ ]', ' ', 'g'));
  END IF;

  v_match := regexp_match(v_pack, '^\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Z]+)');
  IF v_match IS NOT NULL THEN
    v_outer := v_match[1]::numeric;
    v_inner := v_match[2]::numeric;
    v_unit := v_match[3];
    v_unit_label := public.normalize_product_unit_label(v_unit, v_inner);
    v_container_label := CASE
      WHEN v_vendor_label IS NOT NULL AND lower(v_vendor_label) NOT IN ('each', 'unit', 'other') THEN v_vendor_label
      ELSE NULL
    END;

    IF v_container_label IS NOT NULL THEN
      RETURN v_container_label || ' (' || public.format_product_unit_quantity(v_outer) || ' x '
        || public.format_product_unit_quantity(v_inner) || ' ' || v_unit_label || ')';
    END IF;

    RETURN public.format_product_unit_quantity(v_outer) || ' x '
      || public.format_product_unit_quantity(v_inner) || ' ' || v_unit_label;
  END IF;

  v_match := regexp_match(v_pack, '([0-9]+(?:\.[0-9]+)?)\s*([A-Z]+)\b');
  IF v_match IS NOT NULL THEN
    v_qty := v_match[1]::numeric;
    v_unit := v_match[2];
    v_unit_label := public.normalize_product_unit_label(v_unit, v_qty);
    v_qty_label := public.format_product_unit_quantity(v_qty);

    IF v_vendor_label IS NOT NULL
      AND lower(v_vendor_label) NOT IN ('each', 'unit', 'other')
      AND lower(v_vendor_label) <> lower(v_unit_label)
      AND v_unit_label IS NOT NULL THEN
      RETURN v_vendor_label || ' (' || v_qty_label || ' ' || v_unit_label || ')';
    END IF;

    RETURN v_qty_label || ' ' || COALESCE(v_unit_label, initcap(lower(v_unit)));
  END IF;

  IF v_pack <> '' THEN
    v_unit_label := public.normalize_product_unit_label(v_pack);
    IF v_unit_label IS NOT NULL THEN
      RETURN v_unit_label;
    END IF;
  END IF;

  RETURN COALESCE(v_vendor_label, NULLIF(v_vendor, ''), 'Each');
END;
$$;

CREATE OR REPLACE FUNCTION public.best_product_report_unit(
  p_product_unit text DEFAULT NULL,
  p_vendor_unit text DEFAULT NULL,
  p_pack_size text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.product_unit_is_generic(p_product_unit)
      THEN public.derive_product_report_unit(p_vendor_unit, p_pack_size)
    ELSE p_product_unit
  END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_invoice_line_items(p_invoice_id UUID, p_items JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_incoming_ids UUID[] := ARRAY[]::UUID[];
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.invoices
  WHERE id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    id UUID,
    inventory_item_id TEXT,
    internal_product_id UUID,
    item_name TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    total_price NUMERIC,
    vendor_item_code TEXT,
    vendor_unit TEXT,
    pack_size TEXT
  ) LOOP
    IF v_item.id IS NULL THEN
      v_item.id := gen_random_uuid();

      INSERT INTO public.invoice_line_items (
        id, invoice_id, organization_id, inventory_item_id, internal_product_id,
        item_name, quantity, unit_price, total_price, vendor_item_code, vendor_unit, pack_size
      ) VALUES (
        v_item.id, p_invoice_id, v_org_id, v_item.inventory_item_id, v_item.internal_product_id,
        v_item.item_name, v_item.quantity, v_item.unit_price, v_item.total_price,
        v_item.vendor_item_code, v_item.vendor_unit, NULLIF(v_item.pack_size, '')
      );
    ELSE
      UPDATE public.invoice_line_items
         SET inventory_item_id = v_item.inventory_item_id,
             internal_product_id = v_item.internal_product_id,
             item_name = v_item.item_name,
             quantity = v_item.quantity,
             unit_price = v_item.unit_price,
             total_price = v_item.total_price,
             vendor_item_code = v_item.vendor_item_code,
             vendor_unit = v_item.vendor_unit,
             pack_size = NULLIF(v_item.pack_size, '')
       WHERE id = v_item.id
         AND invoice_id = p_invoice_id;
    END IF;

    v_incoming_ids := array_append(v_incoming_ids, v_item.id);
  END LOOP;

  DELETE FROM public.invoice_line_items
   WHERE invoice_id = p_invoice_id
     AND id <> ALL(v_incoming_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_products(p_invoice_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product_id UUID;
  v_vendor_item_id UUID;
  v_mapping_id UUID;
  v_previous_price NUMERIC;
  v_threshold NUMERIC := 10;
  v_price_variance_flag BOOLEAN;
  v_price_variance_percent NUMERIC;
  v_line_hash TEXT;
  v_existing_hash TEXT;
  v_updates_count INT := 0;
  v_report_unit TEXT;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Invoice not found');
  END IF;

  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
      'id', ili.id,
      'item_name', ili.item_name,
      'quantity', ili.quantity,
      'unit_price', ili.unit_price,
      'total_price', ili.total_price,
      'vendor_item_code', ili.vendor_item_code,
      'vendor_unit', ili.vendor_unit,
      'pack_size', ili.pack_size
    ) ORDER BY ili.id)::TEXT, '[]'))
    INTO v_line_hash
  FROM public.invoice_line_items ili
  WHERE ili.invoice_id = p_invoice_id;

  SELECT hash INTO v_existing_hash
  FROM public.invoice_sync_log
  WHERE invoice_id = p_invoice_id
    AND operation = 'sync_invoice_products'
  ORDER BY processed_at DESC
  LIMIT 1;

  IF v_existing_hash IS NOT NULL AND v_existing_hash = v_line_hash THEN
    RETURN jsonb_build_object('status', 'success', 'updates_count', 0, 'idempotent', true);
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.invoice_line_items
    WHERE invoice_id = p_invoice_id
      AND NULLIF(trim(COALESCE(item_name, '')), '') IS NOT NULL
  LOOP
    v_product_id := v_item.internal_product_id;
    v_vendor_item_id := NULL;
    v_mapping_id := NULL;
    v_price_variance_flag := false;
    v_price_variance_percent := 0;
    v_report_unit := public.derive_product_report_unit(v_item.vendor_unit, v_item.pack_size);

    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE organization_id = v_invoice.organization_id
        AND lower(name) = lower(v_item.item_name)
        AND deleted_at IS NULL
        AND (
          brand_id IS NOT DISTINCT FROM v_invoice.brand_id
          OR brand_id IS NULL
        )
      ORDER BY CASE WHEN brand_id IS NOT DISTINCT FROM v_invoice.brand_id THEN 0 ELSE 1 END
      LIMIT 1;

      IF v_product_id IS NULL THEN
        INSERT INTO public.products (
          organization_id,
          brand_id,
          location_id,
          product_id,
          name,
          category,
          accounting_category,
          report_by_unit,
          base_unit,
          latest_price,
          is_inventoried
        ) VALUES (
          v_invoice.organization_id,
          v_invoice.brand_id,
          v_invoice.location_id,
          public.generate_restops_product_id(),
          v_item.item_name,
          public.derive_product_category(NULL, v_item.item_name),
          CASE
            WHEN public.derive_product_category_type(NULL, NULL, v_item.item_name) = 'Beverage' THEN '5200'
            ELSE '5100'
          END,
          COALESCE(v_report_unit, 'Each'),
          COALESCE(v_report_unit, 'Each'),
          COALESCE(v_item.unit_price, 0),
          false
        )
        ON CONFLICT ON CONSTRAINT products_org_name_key
        DO UPDATE SET
          deleted_at = NULL,
          report_by_unit = CASE
            WHEN public.product_unit_is_generic(products.report_by_unit) THEN COALESCE(EXCLUDED.report_by_unit, products.report_by_unit)
            ELSE products.report_by_unit
          END,
          base_unit = CASE
            WHEN public.product_unit_is_generic(products.base_unit) THEN COALESCE(EXCLUDED.base_unit, products.base_unit)
            ELSE products.base_unit
          END,
          latest_price = CASE
            WHEN COALESCE(EXCLUDED.latest_price, 0) > 0 THEN EXCLUDED.latest_price
            ELSE products.latest_price
          END,
          updated_at = now()
        RETURNING id INTO v_product_id;
      ELSE
        UPDATE public.products
           SET product_id = COALESCE(NULLIF(product_id, ''), public.generate_restops_product_id()),
               report_by_unit = CASE
                 WHEN public.product_unit_is_generic(report_by_unit) THEN COALESCE(v_report_unit, report_by_unit)
                 ELSE report_by_unit
               END,
               base_unit = CASE
                 WHEN public.product_unit_is_generic(base_unit) THEN COALESCE(v_report_unit, base_unit)
                 ELSE base_unit
               END,
               latest_price = CASE
                 WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
                 ELSE latest_price
               END,
               category = CASE
                 WHEN NULLIF(trim(COALESCE(category, '')), '') IS NULL OR lower(category) = 'uncategorized'
                   THEN public.derive_product_category(category, v_item.item_name)
                 ELSE category
               END,
               brand_id = COALESCE(brand_id, v_invoice.brand_id),
               location_id = COALESCE(location_id, v_invoice.location_id),
               updated_at = now()
         WHERE id = v_product_id;
      END IF;
    ELSE
      UPDATE public.products
         SET report_by_unit = CASE
               WHEN public.product_unit_is_generic(report_by_unit) THEN COALESCE(v_report_unit, report_by_unit)
               ELSE report_by_unit
             END,
             base_unit = CASE
               WHEN public.product_unit_is_generic(base_unit) THEN COALESCE(v_report_unit, base_unit)
               ELSE base_unit
             END,
             latest_price = CASE
               WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
               ELSE latest_price
             END,
             updated_at = now()
       WHERE id = v_product_id
         AND deleted_at IS NULL;
    END IF;

    IF v_invoice.vendor_id IS NOT NULL THEN
      SELECT id, last_price, price_variance_threshold_percent
        INTO v_vendor_item_id, v_previous_price, v_threshold
      FROM public.vendor_items
      WHERE organization_id = v_invoice.organization_id
        AND vendor_id = v_invoice.vendor_id
        AND lower(vendor_item_name) = lower(v_item.item_name)
        AND COALESCE(vendor_item_code, '') = COALESCE(v_item.vendor_item_code, '')
      LIMIT 1;

      v_threshold := COALESCE(v_threshold, 10);

      IF v_vendor_item_id IS NOT NULL THEN
        IF COALESCE(v_previous_price, 0) > 0 AND COALESCE(v_item.unit_price, 0) > 0 THEN
          v_price_variance_percent := ((v_item.unit_price - v_previous_price) / v_previous_price) * 100;
          v_price_variance_flag := abs(v_price_variance_percent) >= v_threshold;
        END IF;

        UPDATE public.vendor_items
           SET vendor_unit = COALESCE(NULLIF(v_item.vendor_unit, ''), vendor_unit),
               pack_size = COALESCE(NULLIF(v_item.pack_size, ''), pack_size),
               previous_price = last_price,
               last_price = COALESCE(v_item.unit_price, last_price),
               last_invoice_id = p_invoice_id,
               last_invoice_line_id = v_item.id,
               last_purchased_at = COALESCE(v_invoice.invoice_date, CURRENT_DATE),
               last_price_change_percent = v_price_variance_percent,
               price_variance_flag = v_price_variance_flag,
               updated_at = now()
         WHERE id = v_vendor_item_id;
      ELSE
        INSERT INTO public.vendor_items (
          organization_id,
          vendor_id,
          vendor_item_code,
          vendor_item_name,
          vendor_unit,
          pack_size,
          default_price,
          last_price,
          last_invoice_id,
          last_invoice_line_id,
          last_purchased_at,
          updated_at
        ) VALUES (
          v_invoice.organization_id,
          v_invoice.vendor_id,
          NULLIF(v_item.vendor_item_code, ''),
          v_item.item_name,
          NULLIF(v_item.vendor_unit, ''),
          NULLIF(v_item.pack_size, ''),
          v_item.unit_price,
          v_item.unit_price,
          p_invoice_id,
          v_item.id,
          COALESCE(v_invoice.invoice_date, CURRENT_DATE),
          now()
        )
        RETURNING id INTO v_vendor_item_id;
      END IF;

      IF v_product_id IS NOT NULL AND v_vendor_item_id IS NOT NULL THEN
        INSERT INTO public.vendor_item_mappings (
          organization_id,
          vendor_item_id,
          internal_product_id,
          conversion_multiplier,
          is_verified,
          updated_at
        ) VALUES (
          v_invoice.organization_id,
          v_vendor_item_id,
          v_product_id,
          1,
          false,
          now()
        )
        ON CONFLICT (vendor_item_id, internal_product_id)
        DO UPDATE SET updated_at = now()
        RETURNING id INTO v_mapping_id;
      END IF;
    END IF;

    UPDATE public.invoice_line_items
       SET vendor_id = v_invoice.vendor_id,
           vendor_item_id = v_vendor_item_id,
           internal_product_id = v_product_id,
           price_variance_flag = v_price_variance_flag,
           price_variance_percent = v_price_variance_percent
     WHERE id = v_item.id;

    UPDATE public.inventory inv
       SET current_unit = CASE
             WHEN public.product_unit_is_generic(inv.current_unit) THEN COALESCE(v_report_unit, inv.current_unit)
             ELSE inv.current_unit
           END,
           report_by = CASE
             WHEN public.product_unit_is_generic(inv.report_by) THEN COALESCE(v_report_unit, inv.report_by)
             ELSE inv.report_by
           END,
           updated_at = now()
     WHERE v_product_id IS NOT NULL
       AND inv.organization_id = v_invoice.organization_id
       AND inv.deleted_at IS NULL
       AND (
         inv.internal_product_id = v_product_id
         OR inv.product_id = (SELECT product_id FROM public.products WHERE id = v_product_id)
       );

    v_updates_count := v_updates_count + 1;
  END LOOP;

  INSERT INTO public.invoice_event_log (invoice_id, event_type, new_value, actor_id)
  VALUES (
    p_invoice_id,
    'product_catalog_synced',
    jsonb_build_object('updates_count', v_updates_count),
    COALESCE(p_user_id, auth.uid())
  );

  INSERT INTO public.invoice_sync_log (invoice_id, operation, hash)
  VALUES (p_invoice_id, 'sync_invoice_products', v_line_hash);

  RETURN jsonb_build_object('status', 'success', 'updates_count', v_updates_count);
END;
$$;

UPDATE public.invoice_line_items ili
   SET pack_size = (
     SELECT NULLIF(trim(COALESCE(
       item.value->>'pack_size',
       item.value->>'PackSize',
       item.value->>'pack',
       item.value->>'Pack',
       item.value->>'size',
       item.value->>'Size'
     )), '')
     FROM public.invoices i
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.line_items, '[]'::jsonb)) AS item(value)
     WHERE i.id = ili.invoice_id
       AND lower(trim(COALESCE(
           item.value->>'description',
           item.value->>'item_name',
           item.value->>'name',
           ''
         ))) = lower(trim(ili.item_name))
       AND (
         NULLIF(trim(COALESCE(ili.vendor_item_code, '')), '') IS NULL
         OR NULLIF(trim(COALESCE(
           item.value->>'vendor_item_code',
           item.value->>'product_number',
           item.value->>'item_code',
           ''
         )), '') = NULLIF(trim(COALESCE(ili.vendor_item_code, '')), '')
       )
     LIMIT 1
   )
 WHERE NULLIF(trim(COALESCE(ili.pack_size, '')), '') IS NULL
   AND EXISTS (
     SELECT 1
     FROM public.invoices i
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.line_items, '[]'::jsonb)) AS item(value)
     WHERE i.id = ili.invoice_id
       AND NULLIF(trim(COALESCE(
         item.value->>'pack_size',
         item.value->>'PackSize',
         item.value->>'pack',
         item.value->>'Pack',
         item.value->>'size',
         item.value->>'Size'
       )), '') IS NOT NULL
       AND lower(trim(COALESCE(
           item.value->>'description',
           item.value->>'item_name',
           item.value->>'name',
           ''
         ))) = lower(trim(ili.item_name))
   );

UPDATE public.vendor_items vi
   SET pack_size = COALESCE(NULLIF(ili.pack_size, ''), vi.pack_size),
       updated_at = now()
  FROM public.invoice_line_items ili
 WHERE vi.last_invoice_line_id = ili.id
   AND NULLIF(trim(COALESCE(vi.pack_size, '')), '') IS NULL
   AND NULLIF(trim(COALESCE(ili.pack_size, '')), '') IS NOT NULL;

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
   SET report_by_unit = CASE
         WHEN public.product_unit_is_generic(p.report_by_unit) THEN latest_units.report_unit
         ELSE p.report_by_unit
       END,
       base_unit = CASE
         WHEN public.product_unit_is_generic(p.base_unit) THEN latest_units.report_unit
         ELSE p.base_unit
       END,
       updated_at = now()
  FROM latest_units
 WHERE p.id = latest_units.product_id
   AND latest_units.report_unit IS NOT NULL
   AND (
     public.product_unit_is_generic(p.report_by_unit)
     OR public.product_unit_is_generic(p.base_unit)
   );

UPDATE public.inventory inv
   SET current_unit = CASE
         WHEN public.product_unit_is_generic(inv.current_unit) THEN p.report_by_unit
         ELSE inv.current_unit
       END,
       report_by = CASE
         WHEN public.product_unit_is_generic(inv.report_by) THEN p.report_by_unit
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
   );

DROP FUNCTION IF EXISTS public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text);

CREATE OR REPLACE FUNCTION public.get_product_purchase_report(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_category_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  restaurant text,
  product_id uuid,
  restops_product_id text,
  product_name text,
  category_type text,
  category text,
  report_by text,
  invoice_count bigint,
  line_count bigint,
  purchased_units numeric,
  purchased_amount numeric,
  latest_cost numeric,
  avg_cost numeric,
  last_purchased_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  RETURN QUERY
  WITH approved_invoices AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (i.status = 'approved' OR i.ap_status = 'approved')
      AND (p_brand_id IS NULL OR i.brand_id IS NOT DISTINCT FROM p_brand_id OR i.brand_id IS NULL)
      AND (p_location_id IS NULL OR i.location_id IS NOT DISTINCT FROM p_location_id OR i.location_id IS NULL)
      AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
      AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
  ),
  normalized_lines AS (
    SELECT
      i.id AS invoice_id,
      i.invoice_date,
      i.organization_id,
      i.brand_id,
      i.location_id,
      i.vendor_id,
      ili.id AS line_id,
      ili.item_name,
      ili.quantity,
      ili.unit_price,
      ili.total_price,
      ili.vendor_unit,
      ili.pack_size,
      ili.internal_product_id,
      ili.inventory_item_id::text AS inventory_item_id
    FROM approved_invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    WHERE public.tenant_scope_visible(ili.organization_id, i.brand_id, i.location_id, NULL)
  ),
  json_lines AS (
    SELECT
      i.id AS invoice_id,
      i.invoice_date,
      i.organization_id,
      i.brand_id,
      i.location_id,
      i.vendor_id,
      gen_random_uuid() AS line_id,
      trim(COALESCE(
        NULLIF(item.value->>'description', ''),
        NULLIF(item.value->>'item_name', ''),
        NULLIF(item.value->>'name', ''),
        'Unknown Item'
      )) AS item_name,
      amounts.quantity,
      amounts.unit_price,
      COALESCE(amounts.extended_price, amounts.total_price, amounts.quantity * amounts.unit_price) AS total_price,
      COALESCE(NULLIF(item.value->>'vendor_unit', ''), NULLIF(item.value->>'unit', '')) AS vendor_unit,
      COALESCE(
        NULLIF(item.value->>'pack_size', ''),
        NULLIF(item.value->>'PackSize', ''),
        NULLIF(item.value->>'pack', ''),
        NULLIF(item.value->>'size', '')
      ) AS pack_size,
      CASE
        WHEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN COALESCE(item.value->>'internal_product_id', item.value->>'product_id')::uuid
        ELSE NULL
      END AS internal_product_id,
      NULLIF(item.value->>'inventory_item_id', '') AS inventory_item_id
    FROM approved_invoices i
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.line_items, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinal)
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'quantity', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 1) AS quantity,
        COALESCE(NULLIF(regexp_replace(COALESCE(item.value->>'unit_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS unit_price,
        NULLIF(regexp_replace(COALESCE(item.value->>'extended_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS extended_price,
        NULLIF(regexp_replace(COALESCE(item.value->>'total_price', ''), '[^0-9.\-]', '', 'g'), '')::numeric AS total_price
    ) amounts
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.invoice_line_items ili
        WHERE ili.invoice_id = i.id
      )
      AND NULLIF(trim(COALESCE(
        item.value->>'description',
        item.value->>'item_name',
        item.value->>'name',
        ''
      )), '') IS NOT NULL
  ),
  approved_lines AS (
    SELECT * FROM normalized_lines
    UNION ALL
    SELECT * FROM json_lines
  ),
  enriched AS (
    SELECT
      COALESCE(l.name, 'Current Store') AS restaurant,
      p.id AS product_id,
      p.product_id AS restops_product_id,
      COALESCE(p.name, al.item_name) AS product_name,
      public.derive_product_category_type(p.accounting_category, p.category, COALESCE(p.name, al.item_name)) AS category_type,
      public.derive_product_category(p.category, COALESCE(p.name, al.item_name)) AS category,
      public.best_product_report_unit(p.report_by_unit, al.vendor_unit, al.pack_size) AS report_by,
      al.invoice_id,
      al.line_id,
      COALESCE(al.quantity, 0) AS quantity,
      COALESCE(al.total_price, COALESCE(al.quantity, 0) * COALESCE(al.unit_price, 0)) AS total_price,
      COALESCE(al.unit_price, 0) AS unit_price,
      al.invoice_date
    FROM approved_lines al
    LEFT JOIN public.products p
      ON p.id = al.internal_product_id
      OR (al.inventory_item_id IS NOT NULL AND p.product_id = al.inventory_item_id)
    LEFT JOIN public.locations l ON l.id = al.location_id
    WHERE (p_search IS NULL OR COALESCE(p.name, al.item_name, '') ILIKE '%' || p_search || '%')
  )
  SELECT
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by,
    count(DISTINCT e.invoice_id) AS invoice_count,
    count(e.line_id) AS line_count,
    round(sum(e.quantity), 4) AS purchased_units,
    round(sum(e.total_price), 2) AS purchased_amount,
    (array_agg(e.unit_price ORDER BY e.invoice_date DESC NULLS LAST, e.line_id DESC))[1] AS latest_cost,
    round(sum(e.total_price) / NULLIF(sum(e.quantity), 0), 4) AS avg_cost,
    max(e.invoice_date) AS last_purchased_at
  FROM enriched e
  WHERE (p_category_type IS NULL OR p_category_type = 'all' OR e.category_type = p_category_type)
    AND (p_category IS NULL OR p_category = 'all' OR e.category = p_category)
  GROUP BY
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by
  ORDER BY e.product_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_invoice_line_items(uuid, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
