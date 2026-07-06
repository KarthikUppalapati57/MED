BEGIN;

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
  v_inventory_id UUID;
  v_vendor_item_id UUID;
  v_previous_price NUMERIC;
  v_price_variance_flag BOOLEAN;
  v_price_variance_percent NUMERIC;
  v_threshold NUMERIC := 10;
  v_updates_count INT := 0;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Invoice not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_sync_log
    WHERE invoice_id = p_invoice_id
      AND operation = 'sync_invoice_products'
  ) THEN
    RETURN jsonb_build_object('status', 'success', 'updates_count', 0, 'idempotent', true);
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.invoice_line_items
    WHERE invoice_id = p_invoice_id
  LOOP
    v_product_id := v_item.internal_product_id;
    v_price_variance_flag := false;
    v_price_variance_percent := 0;

    IF v_product_id IS NULL AND v_item.item_name IS NOT NULL THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE organization_id = v_invoice.organization_id
        AND lower(name) = lower(v_item.item_name)
      LIMIT 1;

      -- If product still not found, create a new one automatically
      IF v_product_id IS NULL THEN
        INSERT INTO public.products (
          organization_id,
          name,
          category,
          accounting_category,
          report_by_unit,
          base_unit,
          latest_price,
          is_inventoried,
          location_id,
          created_by,
          created_from_invoice_id
        ) VALUES (
          v_invoice.organization_id,
          v_item.item_name,
          'Uncategorized',
          '5100',
          COALESCE(v_item.vendor_unit, 'ea'),
          COALESCE(v_item.vendor_unit, 'ea'),
          v_item.unit_price,
          true,
          v_invoice.location_id,
          COALESCE(p_user_id, v_invoice.created_by),
          p_invoice_id
        )
        RETURNING id INTO v_product_id;
      END IF;
    END IF;

    IF v_invoice.vendor_id IS NOT NULL THEN
      SELECT id, last_price, price_variance_threshold_percent
        INTO v_vendor_item_id, v_previous_price, v_threshold
      FROM public.vendor_items
      WHERE organization_id = v_invoice.organization_id
        AND vendor_id = v_invoice.vendor_id
        AND lower(vendor_item_name) = lower(v_item.item_name)
      LIMIT 1;

      v_threshold := COALESCE(v_threshold, 10);

      IF v_vendor_item_id IS NOT NULL THEN
        IF v_previous_price > 0 AND v_item.unit_price > 0 THEN
          v_price_variance_percent := ((v_item.unit_price - v_previous_price) / v_previous_price) * 100;
          v_price_variance_flag := abs(v_price_variance_percent) >= v_threshold;
        END IF;

        UPDATE public.vendor_items
           SET last_price = v_item.unit_price,
               previous_price = v_previous_price,
               last_invoice_id = p_invoice_id,
               last_price_change_percent = v_price_variance_percent,
               price_variance_flag = v_price_variance_flag,
               updated_at = now()
         WHERE id = v_vendor_item_id;
      ELSE
        INSERT INTO public.vendor_items (
          organization_id, vendor_id, vendor_item_name, default_price,
          last_price, last_invoice_id, updated_at
        ) VALUES (
          v_invoice.organization_id, v_invoice.vendor_id, v_item.item_name, v_item.unit_price,
          v_item.unit_price, p_invoice_id, now()
        )
        RETURNING id INTO v_vendor_item_id;
      END IF;

      UPDATE public.invoice_line_items
         SET vendor_item_id = v_vendor_item_id,
             price_variance_flag = v_price_variance_flag,
             price_variance_percent = v_price_variance_percent,
             internal_product_id = v_product_id
       WHERE id = v_item.id;
    END IF;

    IF v_product_id IS NOT NULL THEN
      SELECT id INTO v_inventory_id
      FROM public.inventory
      WHERE organization_id = v_invoice.organization_id
        AND (
          internal_product_id = v_product_id
          OR product_id = v_product_id::TEXT
        )
      LIMIT 1
      FOR UPDATE;

      IF v_inventory_id IS NOT NULL THEN
        UPDATE public.inventory
           SET current_quantity = COALESCE(current_quantity, 0) + COALESCE(v_item.quantity, 0),
               current_value = COALESCE(current_value, 0) + COALESCE(v_item.total_price, 0),
               updated_at = now()
         WHERE id = v_inventory_id;
      ELSE
        INSERT INTO public.inventory (
          organization_id, internal_product_id, product_id, product_name,
          current_quantity, current_value, updated_at
        ) VALUES (
          v_invoice.organization_id, v_product_id, v_product_id::TEXT, v_item.item_name,
          COALESCE(v_item.quantity, 0), COALESCE(v_item.total_price, 0), now()
        );
      END IF;

      v_updates_count := v_updates_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.invoice_event_log (invoice_id, event_type, new_value, actor_id)
  VALUES (
    p_invoice_id,
    'inventory_synced',
    jsonb_build_object('updates_count', v_updates_count),
    p_user_id
  );

  INSERT INTO public.invoice_sync_log (invoice_id, operation, hash)
  VALUES (p_invoice_id, 'sync_invoice_products', md5(p_invoice_id::TEXT || now()::TEXT));

  RETURN jsonb_build_object('status', 'success', 'updates_count', v_updates_count);
END;
$$;

COMMIT;
