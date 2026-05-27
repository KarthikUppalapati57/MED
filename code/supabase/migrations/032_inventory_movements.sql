-- Migration 032: Inventory Movements (Phase 1)
-- Tracks the audit trail of all stock changes for enterprise reporting

-- 1. Create inventory_movements table
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('invoice_received', 'recipe_consumption', 'manual_adjustment', 'transfer', 'wastage', 'spoilage', 'purchase_order', 'stock_count')),
    quantity NUMERIC(10,2) NOT NULL,
    source_type TEXT, -- e.g. 'invoice', 'wastage_log'
    source_id UUID,   -- e.g. invoice_id
    previous_quantity NUMERIC(10,2),
    new_quantity NUMERIC(10,2),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Users can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Users can view inventory movements" ON public.inventory_movements 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Manager+ can manage inventory movements" ON public.inventory_movements 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_id ON public.inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_inventory_id ON public.inventory_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);
