-- Migration: 136_inventory_count_optimization.sql
-- Description: Move completeCountSession logic to an atomic Postgres RPC to prevent browser crashing and ensure data integrity.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_count_session(
    p_organization_id UUID,
    p_location_id UUID,
    p_count_sheet_id UUID,
    p_counts JSONB,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sheet RECORD;
    v_item JSONB;
    v_inv_id UUID;
    v_counted_qty NUMERIC;
    v_expected_qty NUMERIC;
    v_variance_qty NUMERIC;
    v_unit_cost NUMERIC;
    v_variance_dollar NUMERIC;
    v_total_variance_value NUMERIC := 0;
    
    v_counted_data JSONB := '{}'::jsonb;
    v_variance_data JSONB := '{}'::jsonb;
    
    v_count_session_id UUID;
    v_is_favorable BOOLEAN;
    
    v_current_inventory RECORD;
BEGIN
    -- 1. Load the count sheet
    SELECT * INTO v_sheet FROM public.count_sheets WHERE id = p_count_sheet_id AND organization_id = p_organization_id FOR UPDATE;
    
    IF v_sheet IS NULL THEN
        RAISE EXCEPTION 'Count sheet not found';
    END IF;

    -- 2. Process counts and calculate variances
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
    LOOP
        v_inv_id := (v_item->>'inventory_id')::UUID;
        v_expected_qty := COALESCE((v_item->>'expected_quantity')::NUMERIC, 0);
        
        -- Check if counted value exists in payload, otherwise default to expected
        IF p_counts ? v_inv_id::TEXT THEN
            v_counted_qty := COALESCE((p_counts->>v_inv_id::TEXT)::NUMERIC, 0);
        ELSE
            v_counted_qty := v_expected_qty;
        END IF;

        -- Get current inventory state to get unit_cost and lock row
        SELECT * INTO v_current_inventory FROM public.inventory WHERE id = v_inv_id AND organization_id = p_organization_id FOR UPDATE;
        
        v_unit_cost := COALESCE(v_current_inventory.unit_cost, 0);
        v_variance_qty := v_counted_qty - v_expected_qty;
        v_variance_dollar := v_variance_qty * v_unit_cost;
        
        IF v_variance_dollar <> 0 THEN
            v_total_variance_value := v_total_variance_value + v_variance_dollar;
            v_variance_data := jsonb_set(
                v_variance_data, 
                ARRAY[v_inv_id::TEXT], 
                jsonb_build_object('qty', v_variance_qty, 'value', v_variance_dollar)
            );
        END IF;
        
        v_counted_data := jsonb_set(
            v_counted_data,
            ARRAY[COALESCE(v_inv_id::TEXT, (v_item->>'product_name'))],
            jsonb_build_object(
                'product_name', v_item->>'product_name',
                'expected_quantity', v_expected_qty,
                'counted_quantity', v_counted_qty,
                'unit', COALESCE(v_item->>'unit', 'ea'),
                'unit_cost', v_unit_cost,
                'variance', v_variance_dollar
            )
        );

        -- Update Inventory record
        IF v_counted_qty <> v_expected_qty AND v_current_inventory IS NOT NULL THEN
            UPDATE public.inventory 
            SET 
                current_quantity = v_counted_qty,
                current_value = v_counted_qty * v_unit_cost,
                previous_quantity = v_expected_qty,
                previous_value = v_current_inventory.current_value,
                last_counted_date = CURRENT_DATE,
                updated_at = NOW()
            WHERE id = v_inv_id;
        END IF;
    END LOOP;

    -- 3. Create General Ledger Entry for total variance
    IF abs(v_total_variance_value) > 0.01 THEN
        v_is_favorable := v_total_variance_value > 0;
        
        INSERT INTO public.general_ledger_entries (
            organization_id, date, reference, description, debit_account, credit_account, amount, created_by
        ) VALUES (
            p_organization_id,
            NOW(),
            'INV-VAR-' || extract(epoch from now())::TEXT,
            'Inventory Count Variance Adjustment',
            CASE WHEN v_is_favorable THEN 'Inventory Asset (1210)' ELSE 'COGS - Variance (5100)' END,
            CASE WHEN v_is_favorable THEN 'COGS - Variance (5100)' ELSE 'Inventory Asset (1210)' END,
            abs(v_total_variance_value),
            p_user_id
        );
    END IF;

    -- 4. Create Count Session
    INSERT INTO public.count_sessions (
        organization_id,
        count_sheet_id,
        status,
        counted_data,
        variance_data,
        completed_at,
        counted_by
    ) VALUES (
        p_organization_id,
        p_count_sheet_id,
        'completed',
        v_counted_data,
        v_variance_data,
        NOW(),
        p_user_id
    ) RETURNING id INTO v_count_session_id;

    -- 5. Create Inventory Movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_sheet.items)
    LOOP
        v_inv_id := (v_item->>'inventory_id')::UUID;
        v_expected_qty := COALESCE((v_item->>'expected_quantity')::NUMERIC, 0);
        
        IF p_counts ? v_inv_id::TEXT THEN
            v_counted_qty := COALESCE((p_counts->>v_inv_id::TEXT)::NUMERIC, 0);
        ELSE
            v_counted_qty := v_expected_qty;
        END IF;

        IF v_counted_qty <> v_expected_qty THEN
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
                v_inv_id,
                'count_variance',
                v_counted_qty - v_expected_qty,
                'count_session',
                v_count_session_id::TEXT,
                v_expected_qty,
                v_counted_qty,
                p_user_id
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'count_session_id', v_count_session_id,
        'total_variance', v_total_variance_value
    );

END;
$$;

COMMIT;
