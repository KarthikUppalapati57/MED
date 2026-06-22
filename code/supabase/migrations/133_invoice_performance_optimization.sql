BEGIN;

-- 1. Upsert Line Items RPC
CREATE OR REPLACE FUNCTION public.upsert_invoice_line_items(p_invoice_id UUID, p_items JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_incoming_ids UUID[] := '{}';
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.invoices WHERE id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    id UUID,
    inventory_item_id UUID,
    internal_product_id UUID,
    item_name TEXT,
    quantity NUMERIC,
    unit_price NUMERIC,
    total_price NUMERIC,
    vendor_item_code TEXT,
    vendor_unit TEXT
  ) LOOP
    IF v_item.id IS NULL THEN
      v_item.id := gen_random_uuid();
      INSERT INTO public.invoice_line_items (
        id, invoice_id, organization_id, inventory_item_id, internal_product_id, item_name, quantity, unit_price, total_price, vendor_item_code, vendor_unit
      ) VALUES (
        v_item.id, p_invoice_id, v_org_id, v_item.inventory_item_id, v_item.internal_product_id, v_item.item_name, v_item.quantity, v_item.unit_price, v_item.total_price, v_item.vendor_item_code, v_item.vendor_unit
      );
    ELSE
      UPDATE public.invoice_line_items SET
        inventory_item_id = v_item.inventory_item_id,
        internal_product_id = v_item.internal_product_id,
        item_name = v_item.item_name,
        quantity = v_item.quantity,
        unit_price = v_item.unit_price,
        total_price = v_item.total_price,
        vendor_item_code = v_item.vendor_item_code,
        vendor_unit = v_item.vendor_unit
      WHERE id = v_item.id AND invoice_id = p_invoice_id;
    END IF;
    v_incoming_ids := array_append(v_incoming_ids, v_item.id);
  END LOOP;

  DELETE FROM public.invoice_line_items 
  WHERE invoice_id = p_invoice_id AND id != ALL(v_incoming_ids);
END;
$$;

-- 2. Sync Products RPC
CREATE OR REPLACE FUNCTION public.sync_invoice_products(p_invoice_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF v_invoice IS NULL THEN RETURN jsonb_build_object('status', 'error', 'message', 'Invoice not found'); END IF;

  -- Phase 8: Idempotency Check
  IF EXISTS (
    SELECT 1 FROM public.invoice_sync_log 
    WHERE invoice_id = p_invoice_id AND operation = 'sync_invoice_products'
  ) THEN
    RETURN jsonb_build_object('status', 'success', 'updates_count', 0, 'idempotent', true);
  END IF;

  FOR v_item IN SELECT * FROM public.invoice_line_items WHERE invoice_id = p_invoice_id LOOP
    v_product_id := v_item.internal_product_id;
    v_price_variance_flag := false;
    v_price_variance_percent := 0;

    IF v_product_id IS NULL AND v_item.item_name IS NOT NULL THEN
      SELECT id INTO v_product_id FROM public.products 
      WHERE organization_id = v_invoice.organization_id AND lower(name) = lower(v_item.item_name) LIMIT 1;
    END IF;

    IF v_invoice.vendor_id IS NOT NULL THEN
      SELECT id, last_price, price_variance_threshold_percent INTO v_vendor_item_id, v_previous_price, v_threshold 
      FROM public.vendor_items 
      WHERE organization_id = v_invoice.organization_id 
        AND vendor_id = v_invoice.vendor_id 
        AND lower(vendor_item_name) = lower(v_item.item_name) LIMIT 1;
        
      IF v_threshold IS NULL THEN v_threshold := 10; END IF;

      IF v_vendor_item_id IS NOT NULL THEN
        IF v_previous_price > 0 AND v_item.unit_price > 0 THEN
          v_price_variance_percent := ((v_item.unit_price - v_previous_price) / v_previous_price) * 100;
          IF abs(v_price_variance_percent) >= v_threshold THEN v_price_variance_flag := true; END IF;
        END IF;

        UPDATE public.vendor_items SET 
          last_price = v_item.unit_price, 
          previous_price = v_previous_price,
          last_invoice_id = p_invoice_id,
          last_price_change_percent = v_price_variance_percent,
          price_variance_flag = v_price_variance_flag,
          updated_at = now()
        WHERE id = v_vendor_item_id;
      ELSE
        INSERT INTO public.vendor_items (organization_id, vendor_id, vendor_item_name, default_price, last_price, last_invoice_id, updated_at) 
        VALUES (v_invoice.organization_id, v_invoice.vendor_id, v_item.item_name, v_item.unit_price, v_item.unit_price, p_invoice_id, now()) 
        RETURNING id INTO v_vendor_item_id;
      END IF;

      UPDATE public.invoice_line_items SET 
        vendor_item_id = v_vendor_item_id,
        price_variance_flag = v_price_variance_flag,
        price_variance_percent = v_price_variance_percent,
        internal_product_id = v_product_id
      WHERE id = v_item.id;
    END IF;

    IF v_product_id IS NOT NULL THEN
      SELECT id INTO v_inventory_id FROM public.inventory 
      WHERE product_id = v_product_id AND organization_id = v_invoice.organization_id FOR UPDATE LIMIT 1;

      IF v_inventory_id IS NOT NULL THEN
        UPDATE public.inventory SET 
          current_quantity = current_quantity + COALESCE(v_item.quantity, 0),
          current_value = current_value + COALESCE(v_item.total_price, 0),
          updated_at = now()
        WHERE id = v_inventory_id;
      ELSE
        INSERT INTO public.inventory (organization_id, product_id, product_name, current_quantity, current_value, updated_at)
        VALUES (v_invoice.organization_id, v_product_id, v_item.item_name, COALESCE(v_item.quantity, 0), COALESCE(v_item.total_price, 0), now());
      END IF;
      v_updates_count := v_updates_count + 1;
    END IF;
  END LOOP;

  -- Phase 9: Audit Logging
  INSERT INTO public.invoice_event_log (invoice_id, event_type, new_value, actor_id)
  VALUES (p_invoice_id, 'inventory_synced', jsonb_build_object('updates_count', v_updates_count), p_user_id);

  -- Phase 8: Record Idempotency
  INSERT INTO public.invoice_sync_log (invoice_id, operation, hash)
  VALUES (p_invoice_id, 'sync_invoice_products', md5(p_invoice_id::text || now()::text));

  RETURN jsonb_build_object('status', 'success', 'updates_count', v_updates_count);
END;
$$;

-- 3. Bulk Process Invoices RPC
CREATE OR REPLACE FUNCTION public.bulk_process_invoices(p_invoice_ids UUID[], p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_processed INT := 0;
BEGIN
  FOREACH v_id IN ARRAY p_invoice_ids LOOP
    UPDATE public.invoices SET status = p_status, updated_at = now() WHERE id = v_id;
    
    IF p_status = 'approved' THEN
      PERFORM public.sync_invoice_products(v_id);
    ELSIF p_status = 'pending_approval' THEN
      PERFORM public.evaluate_invoice_approval_policy(v_id);
    END IF;
    
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'processed', v_processed);
END;
$$;

COMMIT;
