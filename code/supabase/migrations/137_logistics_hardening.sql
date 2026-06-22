-- Migration: 137_logistics_hardening.sql
-- Description: Move receiveOrderWorkflow and completeTransferWorkflow to atomic Postgres RPCs to prevent browser crashing and ensure data integrity.

BEGIN;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
    p_organization_id UUID,
    p_location_id UUID,
    p_order_id UUID,
    p_received_quantities JSONB,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item JSONB;
    v_expected NUMERIC;
    v_received NUMERIC;
    v_key TEXT;
    
    v_receiving_items JSONB := '[]'::jsonb;
    v_has_discrepancy BOOLEAN := false;
    v_has_short BOOLEAN := false;
    v_order_status TEXT;
    v_receiving_status TEXT;
    
    v_receiving_id UUID;
    v_inventory_id UUID;
    
    v_unit TEXT;
    v_unit_cost NUMERIC;
    v_current_inventory RECORD;
BEGIN
    -- 1. Load the order
    SELECT * INTO v_order FROM public.auto_orders WHERE id = p_order_id AND organization_id = p_organization_id FOR UPDATE;
    
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- 2. Process items to calculate discrepancies
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
    LOOP
        v_key := COALESCE(v_item->>'product_id', v_item->>'inventory_id', v_item->>'product_name');
        v_expected := COALESCE((v_item->>'approved_quantity')::NUMERIC, (v_item->>'suggested_quantity')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        
        IF p_received_quantities ? v_key THEN
            v_received := (p_received_quantities->>v_key)::NUMERIC;
        ELSE
            v_received := v_expected;
        END IF;
        
        IF v_received <> v_expected THEN
            v_has_discrepancy := true;
        END IF;
        
        IF v_received < v_expected THEN
            v_has_short := true;
        END IF;

        v_receiving_items := v_receiving_items || jsonb_build_object(
            'product_id', v_item->>'product_id',
            'inventory_id', v_item->>'inventory_id',
            'product_name', v_item->>'product_name',
            'unit', COALESCE(v_item->>'unit', 'ea'),
            'unit_price', COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'price')::NUMERIC, 0),
            'expected_quantity', v_expected,
            'received_quantity', v_received,
            'discrepancy', v_expected - v_received,
            'receiving_status', CASE WHEN v_received = v_expected THEN 'matched' WHEN v_received > v_expected THEN 'over' ELSE 'short' END
        );
    END LOOP;

    v_order_status := CASE WHEN v_has_short THEN 'partially_received' ELSE 'received' END;
    v_receiving_status := CASE WHEN v_has_discrepancy THEN 'discrepancy' ELSE 'received' END;

    -- 3. Create Receiving Record
    INSERT INTO public.receivings (
        organization_id,
        order_id,
        vendor_id,
        status,
        items,
        received_by
    ) VALUES (
        p_organization_id,
        p_order_id,
        v_order.vendor_id,
        v_receiving_status,
        v_receiving_items,
        p_user_id
    ) RETURNING id INTO v_receiving_id;

    -- 4. Update Order
    UPDATE public.auto_orders
    SET 
        status = v_order_status,
        last_workflow_step = CASE WHEN v_has_discrepancy THEN 'receiving_discrepancy' ELSE 'received' END
    WHERE id = p_order_id;

    -- 5. Process Inventory Math
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_receiving_items)
    LOOP
        v_received := (v_item->>'received_quantity')::NUMERIC;
        IF v_received <= 0 THEN
            CONTINUE;
        END IF;

        v_unit := COALESCE(v_item->>'unit', 'ea');
        v_unit_cost := (v_item->>'unit_price')::NUMERIC;
        
        -- Try to find existing inventory
        v_current_inventory := NULL;
        IF (v_item->>'product_id') IS NOT NULL THEN
            SELECT * INTO v_current_inventory FROM public.inventory WHERE product_id = v_item->>'product_id' AND organization_id = p_organization_id AND (location_id = p_location_id OR p_location_id IS NULL) LIMIT 1 FOR UPDATE;
        END IF;
        
        IF v_current_inventory IS NULL THEN
            SELECT * INTO v_current_inventory FROM public.inventory WHERE LOWER(product_name) = LOWER(v_item->>'product_name') AND organization_id = p_organization_id AND (location_id = p_location_id OR p_location_id IS NULL) LIMIT 1 FOR UPDATE;
        END IF;

        IF v_current_inventory IS NOT NULL THEN
            -- Update existing
            v_inventory_id := v_current_inventory.id;
            
            UPDATE public.inventory 
            SET 
                current_quantity = v_current_inventory.current_quantity + v_received,
                current_value = (v_current_inventory.current_quantity + v_received) * COALESCE(NULLIF(v_unit_cost, 0), v_current_inventory.unit_cost, 0),
                previous_quantity = v_current_inventory.current_quantity,
                previous_value = v_current_inventory.current_value,
                last_counted_date = CURRENT_DATE,
                updated_at = NOW()
            WHERE id = v_inventory_id;
        ELSE
            -- Create new
            INSERT INTO public.inventory (
                organization_id,
                location_id,
                product_id,
                product_name,
                current_quantity,
                current_unit,
                unit_cost,
                current_value,
                accounting_category,
                par_level,
                reorder_point,
                previous_quantity,
                previous_value
            ) VALUES (
                p_organization_id,
                p_location_id,
                COALESCE(v_item->>'product_id', 'PRD-' || extract(epoch from now())::TEXT),
                v_item->>'product_name',
                v_received,
                v_unit,
                v_unit_cost,
                v_received * v_unit_cost,
                'food',
                0,
                0,
                0,
                0
            ) RETURNING id INTO v_inventory_id;
            
            v_current_inventory := ROW(0, 0); -- Mock for movement previous state
        END IF;

        -- Create movement log
        INSERT INTO public.inventory_movements (
            organization_id,
            location_id,
            inventory_id,
            movement_type,
            quantity,
            source_type,
            source_id,
            previous_quantity,
            new_quantity,
            created_by
        ) VALUES (
            p_organization_id,
            p_location_id,
            v_inventory_id,
            'purchase_order',
            v_received,
            'receiving',
            v_receiving_id::TEXT,
            COALESCE(v_current_inventory.current_quantity, 0),
            COALESCE(v_current_inventory.current_quantity, 0) + v_received,
            p_user_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'receiving_id', v_receiving_id,
        'has_discrepancy', v_has_discrepancy,
        'order_status', v_order_status
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.complete_inventory_transfer(
    p_organization_id UUID,
    p_transfer_id UUID,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item JSONB;
    v_qty NUMERIC;
    
    v_source_inv RECORD;
    v_dest_inv RECORD;
    v_dest_inv_id UUID;
    v_unit_cost NUMERIC;
BEGIN
    -- 1. Load the transfer
    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id AND organization_id = p_organization_id FOR UPDATE;
    
    IF v_transfer IS NULL THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;
    
    IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Transfer already completed');
    END IF;

    -- 2. Process transfer items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
    LOOP
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
        
        -- Source Inventory
        SELECT * INTO v_source_inv FROM public.inventory WHERE id = (v_item->>'inventory_id')::UUID FOR UPDATE;
        IF v_source_inv IS NOT NULL THEN
            UPDATE public.inventory 
            SET 
                current_quantity = GREATEST(0, current_quantity - v_qty),
                current_value = GREATEST(0, current_quantity - v_qty) * COALESCE(unit_cost, v_unit_cost),
                previous_quantity = current_quantity,
                previous_value = current_value
            WHERE id = v_source_inv.id;
            
            INSERT INTO public.inventory_movements (
                organization_id, location_id, inventory_id, movement_type, quantity, source_type, source_id, previous_quantity, new_quantity, created_by
            ) VALUES (
                p_organization_id, COALESCE(v_transfer.from_location_id, v_source_inv.location_id), v_source_inv.id, 'transfer_out', -v_qty, 'transfer', p_transfer_id::TEXT, v_source_inv.current_quantity, GREATEST(0, v_source_inv.current_quantity - v_qty), p_user_id
            );
        END IF;

        -- Destination Inventory
        v_dest_inv := NULL;
        IF (v_item->>'product_id') IS NOT NULL THEN
            SELECT * INTO v_dest_inv FROM public.inventory WHERE product_id = v_item->>'product_id' AND organization_id = p_organization_id AND location_id = v_transfer.to_location_id LIMIT 1 FOR UPDATE;
        END IF;
        
        IF v_dest_inv IS NULL THEN
            SELECT * INTO v_dest_inv FROM public.inventory WHERE LOWER(product_name) = LOWER(v_item->>'product_name') AND organization_id = p_organization_id AND location_id = v_transfer.to_location_id LIMIT 1 FOR UPDATE;
        END IF;

        IF v_dest_inv IS NOT NULL THEN
            v_dest_inv_id := v_dest_inv.id;
            UPDATE public.inventory 
            SET 
                current_quantity = current_quantity + v_qty,
                current_value = (current_quantity + v_qty) * COALESCE(unit_cost, v_unit_cost),
                previous_quantity = current_quantity,
                previous_value = current_value
            WHERE id = v_dest_inv.id;
        ELSE
            INSERT INTO public.inventory (
                organization_id, location_id, product_id, product_name, current_quantity, current_unit, unit_cost, current_value, accounting_category, par_level, reorder_point, previous_quantity, previous_value
            ) VALUES (
                p_organization_id, v_transfer.to_location_id, COALESCE(v_item->>'product_id', 'PRD-' || extract(epoch from now())::TEXT), v_item->>'product_name', v_qty, COALESCE(v_item->>'unit', 'ea'), v_unit_cost, v_qty * v_unit_cost, 'food', 0, 0, 0, 0
            ) RETURNING id INTO v_dest_inv_id;
            
            v_dest_inv := ROW(0, 0);
        END IF;

        INSERT INTO public.inventory_movements (
            organization_id, location_id, inventory_id, movement_type, quantity, source_type, source_id, previous_quantity, new_quantity, created_by
        ) VALUES (
            p_organization_id, v_transfer.to_location_id, v_dest_inv_id, 'transfer_in', v_qty, 'transfer', p_transfer_id::TEXT, COALESCE(v_dest_inv.current_quantity, 0), COALESCE(v_dest_inv.current_quantity, 0) + v_qty, p_user_id
        );
        
    END LOOP;

    -- 3. Complete transfer
    UPDATE public.transfers
    SET status = 'completed', completed_at = NOW(), completed_by = p_user_id
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
