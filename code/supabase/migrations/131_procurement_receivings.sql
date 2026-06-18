-- Migration 131: Procurement Receivings

-- 1. Create receivings table
CREATE TABLE IF NOT EXISTS public.receivings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'disputed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fix if table already existed without columns
ALTER TABLE public.receivings ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.receivings ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.receivings ADD COLUMN IF NOT EXISTS received_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.receivings ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES auth.users(id);

-- 2. Create receiving_items table
CREATE TABLE IF NOT EXISTS public.receiving_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receiving_id UUID NOT NULL REFERENCES public.receivings(id) ON DELETE CASCADE,
    purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity_received NUMERIC(10,2) NOT NULL DEFAULT 0,
    condition TEXT DEFAULT 'good' CHECK (condition IN ('good', 'damaged', 'spoiled', 'missing')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fix if items table already existed
ALTER TABLE public.receiving_items ADD COLUMN IF NOT EXISTS purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;
ALTER TABLE public.receiving_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.receiving_items ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Link Invoices to Purchase Orders
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

-- 4. Triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.receivings;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.receivings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.receiving_items;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.receiving_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS
ALTER TABLE public.receivings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view receivings" ON public.receivings;
CREATE POLICY "Users can view receivings" ON public.receivings 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage receivings" ON public.receivings;
CREATE POLICY "Manager+ can manage receivings" ON public.receivings 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view receiving items" ON public.receiving_items;
CREATE POLICY "Users can view receiving items" ON public.receiving_items 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receivings r
            WHERE r.id = receiving_items.receiving_id 
            AND r.organization_id = public.get_my_org()
        )
    );

DROP POLICY IF EXISTS "Manager+ can manage receiving items" ON public.receiving_items;
CREATE POLICY "Manager+ can manage receiving items" ON public.receiving_items 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.receivings r 
            WHERE r.id = receiving_items.receiving_id 
            AND r.organization_id = public.get_my_org()
            AND is_manager_or_above()
        )
    );

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_receivings_org_id ON public.receivings(organization_id);
CREATE INDEX IF NOT EXISTS idx_receivings_po_id ON public.receivings(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_rec_id ON public.receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_invoices_po_id ON public.invoices(purchase_order_id);
