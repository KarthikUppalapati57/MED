-- 1. Deduplicate products to allow for UNIQUE constraint
-- We will append a suffix to any duplicate names within the same organization
WITH duplicates AS (
    SELECT id, name, organization_id,
           ROW_NUMBER() OVER(PARTITION BY organization_id, name ORDER BY created_at ASC) as row_num
    FROM public.products
    WHERE organization_id IS NOT NULL
)
UPDATE public.products p
SET name = p.name || ' (Dup ' || substr(p.id::text, 1, 8) || ')'
FROM duplicates d
WHERE p.id = d.id AND d.row_num > 1;

-- Now add the strict composite unique constraint
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_org_name_key;
ALTER TABLE public.products ADD CONSTRAINT products_org_name_key UNIQUE (organization_id, name);

-- 2. Transactional RPC for Inventory Transfers
-- This wraps creating the transfer record and updating inventory into a single atomic transaction
-- to prevent network drops from causing partial state.
CREATE OR REPLACE FUNCTION public.execute_internal_transfer(
    p_organization_id UUID,
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_items JSONB,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_id UUID;
    v_item JSONB;
    v_qty NUMERIC;
    v_source_inv RECORD;
    v_dest_inv RECORD;
    v_unit_cost NUMERIC;
BEGIN
    -- 1. Create the transfer record in completed state
    INSERT INTO public.transfers (
        organization_id, from_location_id, to_location_id, status, items, created_by, completed_at, completed_by
    ) VALUES (
        p_organization_id, p_from_location_id, p_to_location_id, 'completed', p_items, p_user_id, now(), p_user_id
    ) RETURNING id INTO v_transfer_id;

    -- 2. Process transfer items to adjust inventory atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
        
        -- Source Inventory Deduction
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
                p_organization_id, COALESCE(p_from_location_id, v_source_inv.location_id), v_source_inv.id, 'transfer_out', -v_qty, 'transfer', v_transfer_id::TEXT, v_source_inv.current_quantity, GREATEST(0, v_source_inv.current_quantity - v_qty), p_user_id
            );
        END IF;

        -- Destination Inventory Addition
        v_dest_inv := NULL;
        IF (v_item->>'product_id') IS NOT NULL THEN
            SELECT * INTO v_dest_inv FROM public.inventory WHERE product_id = v_item->>'product_id' AND organization_id = p_organization_id AND location_id = p_to_location_id LIMIT 1 FOR UPDATE;
        END IF;
        
        IF v_dest_inv IS NULL THEN
            SELECT * INTO v_dest_inv FROM public.inventory WHERE LOWER(product_name) = LOWER(v_item->>'product_name') AND organization_id = p_organization_id AND location_id = p_to_location_id LIMIT 1 FOR UPDATE;
        END IF;

        IF v_dest_inv IS NOT NULL THEN
            UPDATE public.inventory 
            SET 
                current_quantity = current_quantity + v_qty,
                current_value = (current_quantity + v_qty) * COALESCE(unit_cost, v_unit_cost),
                previous_quantity = current_quantity,
                previous_value = current_value
            WHERE id = v_dest_inv.id;
            
            INSERT INTO public.inventory_movements (
                organization_id, location_id, inventory_id, movement_type, quantity, source_type, source_id, previous_quantity, new_quantity, created_by
            ) VALUES (
                p_organization_id, p_to_location_id, v_dest_inv.id, 'transfer_in', v_qty, 'transfer', v_transfer_id::TEXT, v_dest_inv.current_quantity, v_dest_inv.current_quantity + v_qty, p_user_id
            );
        ELSE
            -- Create new inventory record in destination if it doesn't exist
            WITH new_inv AS (
                INSERT INTO public.inventory (
                    organization_id, location_id, product_id, product_name, current_quantity, current_unit, unit_cost, current_value, accounting_category, par_level, reorder_point, previous_quantity, previous_value
                ) VALUES (
                    p_organization_id, p_to_location_id, COALESCE(v_item->>'product_id', 'PRD-' || extract(epoch from now())::TEXT), v_item->>'product_name', v_qty, COALESCE(v_item->>'unit', 'ea'), v_unit_cost, v_qty * v_unit_cost, 'food', 0, 0, 0, 0
                ) RETURNING id, current_quantity
            )
            INSERT INTO public.inventory_movements (
                organization_id, location_id, inventory_id, movement_type, quantity, source_type, source_id, previous_quantity, new_quantity, created_by
            ) SELECT p_organization_id, p_to_location_id, id, 'transfer_in', v_qty, 'transfer', v_transfer_id::TEXT, 0, current_quantity, p_user_id FROM new_inv;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$$;
