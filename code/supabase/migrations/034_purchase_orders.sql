-- Migration 034: Purchase Order System (Phase 1)
-- Normalizes procurement workflows

-- 1. Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'cancelled')),
    total_amount NUMERIC(12,2) DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.purchase_orders;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.purchase_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.purchase_order_items;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.purchase_order_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Users can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Users can view purchase orders" ON public.purchase_orders 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage purchase orders" ON public.purchase_orders;
CREATE POLICY "Manager+ can manage purchase orders" ON public.purchase_orders 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;
CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
        )
    );

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;
CREATE POLICY "Manager+ can manage purchase order items" ON public.purchase_order_items 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
            AND is_manager_or_above()
        )
    );

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_po_org_id ON public.purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items(purchase_order_id);
