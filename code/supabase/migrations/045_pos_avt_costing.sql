-- Migration 045: POS AvT Costing Schema & Triggers
-- Links POS Sales with MEVS Recipes for Theoretical Inventory Depletion

-- 1. pos_items
CREATE TABLE IF NOT EXISTS public.pos_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    pos_provider TEXT NOT NULL CHECK (pos_provider IN ('toast', 'square', 'clover', 'mock')),
    pos_item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, pos_provider, pos_item_id)
);

-- 2. pos_menu_mapping
CREATE TABLE IF NOT EXISTS public.pos_menu_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    pos_item_id UUID NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, pos_item_id)
);

-- 3. pos_sales_data
CREATE TABLE IF NOT EXISTS public.pos_sales_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    pos_item_id UUID NOT NULL REFERENCES public.pos_items(id) ON DELETE CASCADE,
    quantity_sold NUMERIC(10,2) NOT NULL DEFAULT 0,
    revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at trigger for pos_items
DROP TRIGGER IF EXISTS set_updated_at ON public.pos_items;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.pos_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.pos_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_data ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
DROP POLICY IF EXISTS "Users can view pos items" ON public.pos_items;
CREATE POLICY "Users can view pos items" ON public.pos_items FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos items" ON public.pos_items;
CREATE POLICY "Manager+ can manage pos items" ON public.pos_items FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view pos menu mapping" ON public.pos_menu_mapping;
CREATE POLICY "Users can view pos menu mapping" ON public.pos_menu_mapping FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos menu mapping" ON public.pos_menu_mapping;
CREATE POLICY "Manager+ can manage pos menu mapping" ON public.pos_menu_mapping FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view pos sales data" ON public.pos_sales_data;
CREATE POLICY "Users can view pos sales data" ON public.pos_sales_data FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos sales data" ON public.pos_sales_data;
CREATE POLICY "Manager+ can manage pos sales data" ON public.pos_sales_data FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- 4. Trigger Function for Theoretical Inventory Depletion
CREATE OR REPLACE FUNCTION public.process_pos_sales_to_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_recipe_id UUID;
    r RECORD;
    v_inventory_id UUID;
    v_old_qty NUMERIC(10,2);
    v_new_qty NUMERIC(10,2);
    v_movement_qty NUMERIC(10,2);
BEGIN
    -- Find mapped recipe
    SELECT recipe_id INTO v_recipe_id 
    FROM public.pos_menu_mapping 
    WHERE pos_item_id = NEW.pos_item_id AND organization_id = NEW.organization_id
    LIMIT 1;

    -- If there's a mapping, deplete ingredients
    IF v_recipe_id IS NOT NULL THEN
        FOR r IN 
            SELECT p.product_id AS prod_text_id, ri.quantity AS recipe_qty
            FROM public.recipe_ingredients ri
            JOIN public.products p ON p.id = ri.product_id
            WHERE ri.recipe_id = v_recipe_id AND ri.organization_id = NEW.organization_id
        LOOP
            -- Find inventory record by product_id (text)
            SELECT id, current_quantity 
            INTO v_inventory_id, v_old_qty 
            FROM public.inventory 
            WHERE product_id = r.prod_text_id AND organization_id = NEW.organization_id
            LIMIT 1;

            IF v_inventory_id IS NOT NULL THEN
                -- Calculate movement quantity (theoretical consumption)
                v_movement_qty := r.recipe_qty * NEW.quantity_sold;
                v_new_qty := COALESCE(v_old_qty, 0) - v_movement_qty;

                -- Update inventory
                UPDATE public.inventory 
                SET current_quantity = v_new_qty, updated_at = now()
                WHERE id = v_inventory_id;

                -- Insert into inventory_movements
                INSERT INTO public.inventory_movements (
                    organization_id, location_id, inventory_id, movement_type, 
                    quantity, source_type, source_id, previous_quantity, new_quantity
                ) VALUES (
                    NEW.organization_id, NEW.location_id, v_inventory_id, 'recipe_consumption',
                    -v_movement_qty, 'pos_sale', NEW.id, COALESCE(v_old_qty, 0), v_new_qty
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_pos_sales_to_inventory ON public.pos_sales_data;
CREATE TRIGGER trigger_pos_sales_to_inventory
    AFTER INSERT ON public.pos_sales_data
    FOR EACH ROW EXECUTE FUNCTION public.process_pos_sales_to_inventory();
