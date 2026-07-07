BEGIN;

-- Keep invoice approval user-friendly: approved invoice lines update the Product
-- catalog and vendor pricing, but do not automatically add every purchased line
-- to Inventory. Inventory remains opt-in via product/count-sheet setup.
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
      'vendor_unit', ili.vendor_unit
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
          name,
          category,
          accounting_category,
          report_by_unit,
          base_unit,
          latest_price,
          is_inventoried,
          created_by,
          created_from_invoice_id
        ) VALUES (
          v_invoice.organization_id,
          v_invoice.brand_id,
          v_invoice.location_id,
          v_item.item_name,
          'Uncategorized',
          '5100',
          COALESCE(NULLIF(v_item.vendor_unit, ''), 'ea'),
          COALESCE(NULLIF(v_item.vendor_unit, ''), 'ea'),
          COALESCE(v_item.unit_price, 0),
          false,
          COALESCE(p_user_id, v_invoice.created_by),
          p_invoice_id
        )
        RETURNING id INTO v_product_id;
      ELSE
        UPDATE public.products
           SET latest_price = CASE
                 WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
                 ELSE latest_price
               END,
               brand_id = COALESCE(brand_id, v_invoice.brand_id),
               location_id = COALESCE(location_id, v_invoice.location_id),
               updated_at = now()
         WHERE id = v_product_id;
      END IF;
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

COMMIT;
