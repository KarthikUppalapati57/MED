-- Migration: 135_price_variance_tracking.sql
-- Description: Add price variance tracking columns and RPCs to vendor_items

BEGIN;

-- 1. Add missing columns to vendor_items if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_items' AND column_name = 'previous_price') THEN
        ALTER TABLE public.vendor_items ADD COLUMN previous_price NUMERIC;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_items' AND column_name = 'last_invoice_id') THEN
        ALTER TABLE public.vendor_items ADD COLUMN last_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_items' AND column_name = 'last_price_change_percent') THEN
        ALTER TABLE public.vendor_items ADD COLUMN last_price_change_percent NUMERIC;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_items' AND column_name = 'price_variance_flag') THEN
        ALTER TABLE public.vendor_items ADD COLUMN price_variance_flag BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendor_items' AND column_name = 'price_variance_threshold_percent') THEN
        ALTER TABLE public.vendor_items ADD COLUMN price_variance_threshold_percent NUMERIC DEFAULT 10.0;
    END IF;
END $$;

-- 2. Create RPC to fetch flagged vendor items
CREATE OR REPLACE FUNCTION public.get_flagged_vendor_items(p_organization_id UUID)
RETURNS TABLE (
    id UUID,
    vendor_item_name TEXT,
    vendor_name TEXT,
    internal_product_id UUID,
    internal_product_name TEXT,
    previous_price NUMERIC,
    latest_price NUMERIC,
    variance_percent NUMERIC,
    invoice_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vi.id,
        vi.vendor_item_name,
        v.name AS vendor_name,
        vim.internal_product_id,
        p.name AS internal_product_name,
        vi.previous_price,
        vi.last_price AS latest_price,
        vi.last_price_change_percent AS variance_percent,
        i.invoice_date::timestamptz
    FROM public.vendor_items vi
    JOIN public.vendors v ON vi.vendor_id = v.id
    LEFT JOIN public.vendor_item_mappings vim ON vim.vendor_item_id = vi.id
    LEFT JOIN public.products p ON vim.internal_product_id = p.id
    LEFT JOIN public.invoices i ON vi.last_invoice_id = i.id
    WHERE vi.organization_id = p_organization_id
      AND vi.price_variance_flag = true
    ORDER BY vi.updated_at DESC;
END;
$$;

-- 3. Create RPC to resolve price variance
CREATE OR REPLACE FUNCTION public.resolve_price_variance(p_vendor_item_id UUID, p_update_product BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor_item RECORD;
    v_product_id UUID;
BEGIN
    -- Get the vendor item
    SELECT * INTO v_vendor_item FROM public.vendor_items WHERE id = p_vendor_item_id;
    
    IF v_vendor_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Vendor item not found');
    END IF;
    
    -- Clear the flag
    UPDATE public.vendor_items 
    SET price_variance_flag = false, updated_at = NOW() 
    WHERE id = p_vendor_item_id;
    
    -- Optionally update master product
    IF p_update_product THEN
        -- Find mapped internal product
        SELECT internal_product_id INTO v_product_id 
        FROM public.vendor_item_mappings 
        WHERE vendor_item_id = p_vendor_item_id 
        LIMIT 1;
        
        IF v_product_id IS NOT NULL THEN
            UPDATE public.products 
            SET latest_price = v_vendor_item.last_price, updated_at = NOW() 
            WHERE id = v_product_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'updated_product_id', v_product_id);
END;
$$;

COMMIT;
