-- Migration: 059_vendor_item_prices
-- Description: Add vendor_item_prices table for multi-vendor price comparison

CREATE TABLE IF NOT EXISTS public.vendor_item_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    unit TEXT NOT NULL,
    is_approved_supplier BOOLEAN DEFAULT true,
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, vendor_id, product_name)
);

ALTER TABLE public.vendor_item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view vendor item prices" ON public.vendor_item_prices;
CREATE POLICY "Users can view vendor item prices" ON public.vendor_item_prices 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Managers can manage vendor item prices" ON public.vendor_item_prices;
CREATE POLICY "Managers can manage vendor item prices" ON public.vendor_item_prices 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());
