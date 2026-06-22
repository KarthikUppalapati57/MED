-- code/supabase/migrations/142_pos_sync_engine.sql

-- 1. POS Orders Ledger
CREATE TABLE IF NOT EXISTS public.pos_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    pos_provider TEXT NOT NULL,
    pos_order_id TEXT NOT NULL,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'logged', -- logged, synced, ignored
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, pos_provider, pos_order_id)
);

CREATE TABLE IF NOT EXISTS public.pos_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.pos_orders(id) ON DELETE CASCADE,
    pos_item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pos_orders in their org" ON public.pos_orders
    FOR SELECT USING (organization_id = public.get_auth_org());

CREATE POLICY "Users can view pos_order_items in their org" ON public.pos_order_items
    FOR SELECT USING (order_id IN (SELECT id FROM public.pos_orders WHERE organization_id = public.get_auth_org()));

-- 2. Generate Daily Theoretical Usage RPC
CREATE OR REPLACE FUNCTION generate_daily_theoretical_usage(
    p_org_id UUID,
    p_date DATE
)
RETURNS TABLE (
    ingredient_id UUID,
    ingredient_name TEXT,
    unit TEXT,
    theoretical_usage NUMERIC,
    cost_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH daily_sales AS (
        -- Sum up all items sold today
        SELECT 
            poi.pos_item_id,
            SUM(poi.quantity) as total_sold
        FROM pos_orders po
        JOIN pos_order_items poi ON po.id = poi.order_id
        WHERE po.organization_id = p_org_id
          AND DATE(po.order_date AT TIME ZONE 'UTC') = p_date
          AND po.status = 'logged'
        GROUP BY poi.pos_item_id
    ),
    mapped_recipes AS (
        -- Map POS items to Restops Recipes
        SELECT 
            ds.pos_item_id,
            ds.total_sold,
            pmm.recipe_id
        FROM daily_sales ds
        JOIN pos_menu_mappings pmm ON ds.pos_item_id = pmm.pos_item_id AND pmm.organization_id = p_org_id
    ),
    recipe_ingredients_exploded AS (
        -- Explode recipes into ingredients
        SELECT 
            ri.ingredient_id,
            (ri.quantity * mr.total_sold) AS ingredient_usage,
            p.name as ingredient_name,
            p.unit_of_measure as unit,
            p.cost_per_unit as cost_per_unit
        FROM mapped_recipes mr
        JOIN recipe_ingredients ri ON mr.recipe_id = ri.recipe_id
        JOIN products p ON ri.ingredient_id = p.id
    )
    SELECT 
        rie.ingredient_id,
        rie.ingredient_name,
        rie.unit,
        SUM(rie.ingredient_usage) AS theoretical_usage,
        SUM(rie.ingredient_usage * rie.cost_per_unit) AS cost_value
    FROM recipe_ingredients_exploded rie
    GROUP BY rie.ingredient_id, rie.ingredient_name, rie.unit
    ORDER BY theoretical_usage DESC;
END;
$$;

-- 3. Approve Daily POS Usage RPC
CREATE OR REPLACE FUNCTION approve_daily_pos_usage(
    p_org_id UUID,
    p_date DATE,
    p_location_id UUID,
    p_user_id UUID,
    p_adjustments JSONB DEFAULT '[]'::JSONB -- Allows managers to inject waste/spoilage adjustments before deduction
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_usage RECORD;
    v_adj RECORD;
    v_count INT := 0;
BEGIN
    -- 1. Deduct all theoretically calculated usage
    FOR v_usage IN (
        SELECT * FROM generate_daily_theoretical_usage(p_org_id, p_date)
    )
    LOOP
        -- Update inventory level
        UPDATE inventory_levels
        SET quantity = quantity - v_usage.theoretical_usage,
            updated_at = NOW()
        WHERE product_id = v_usage.ingredient_id AND location_id = p_location_id;

        -- Log movement
        INSERT INTO inventory_movement_log 
            (organization_id, location_id, product_id, change_amount, reason, notes, actor_id)
        VALUES 
            (p_org_id, p_location_id, v_usage.ingredient_id, -v_usage.theoretical_usage, 'sales_depletion', 'Daily POS Sync: ' || p_date::text, p_user_id);
            
        v_count := v_count + 1;
    END LOOP;

    -- 2. Mark the POS orders as synced
    UPDATE pos_orders
    SET status = 'synced',
        updated_at = NOW()
    WHERE organization_id = p_org_id
      AND location_id = p_location_id
      AND DATE(order_date AT TIME ZONE 'UTC') = p_date
      AND status = 'logged';

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully depleted ' || v_count || ' ingredients based on POS sales.',
        'items_depleted', v_count
    );
END;
$$;
