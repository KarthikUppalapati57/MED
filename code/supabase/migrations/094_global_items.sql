-- 094: Add Global Vendor Items (Crowdsourced Mapping)

BEGIN;

CREATE TABLE IF NOT EXISTS public.global_vendor_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_name TEXT NOT NULL,
    vendor_item_code TEXT,
    item_name TEXT NOT NULL,
    most_common_category TEXT NOT NULL,
    confidence_score INTEGER DEFAULT 0, -- 0-100 score based on how many restaurants mapped it the same way
    mapping_count INTEGER DEFAULT 1,    -- How many restaurants mapped this
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(vendor_name, vendor_item_code, item_name)
);

-- Note: This table has NO organization_id because it is a platform-wide data asset.
-- Only platform admins or automated edge functions can write to this, but all authenticated users can read.

-- RLS
ALTER TABLE public.global_vendor_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read global items"
    ON public.global_vendor_items FOR SELECT
    USING (auth.role() = 'authenticated');

-- Seed some example global knowledge
INSERT INTO public.global_vendor_items (vendor_name, vendor_item_code, item_name, most_common_category, confidence_score, mapping_count)
VALUES 
('Sysco', 'SYS-101', 'Ground Beef 80/20', 'food_cogs', 95, 412),
('US Foods', 'USF-88', 'Heinz Ketchup 1Gal', 'food_cogs', 98, 850),
('Ecolab', 'ECO-22', 'Sanitizer Solution', 'cleaning_supplies', 99, 1200),
('Local Farm', 'LOC-01', 'Heirloom Tomatoes', 'food_cogs', 85, 45)
ON CONFLICT DO NOTHING;

COMMIT;
