-- Migration 055: Dynamic Recipe Costing & Margin Alerts
-- Automatically cascades pricing updates from Vendor Invoices to Products and Inventory

BEGIN;

-- Create trigger function that updates product and inventory pricing when an invoice is validated
CREATE OR REPLACE FUNCTION public.cascade_invoice_prices()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    -- Only run when status changes to 'validated' or 'approved'
    IF NEW.status IN ('validated', 'approved') AND OLD.status NOT IN ('validated', 'approved') THEN
        -- Loop through all line items for this invoice
        FOR r IN 
            SELECT inventory_item_id, unit_price 
            FROM public.invoice_line_items 
            WHERE invoice_id = NEW.id AND inventory_item_id IS NOT NULL
        LOOP
            -- 1. Update products table
            -- This will automatically trigger `recalculate_recipe_costs_on_price_change` (Migration 044)
            UPDATE public.products
            SET 
                latest_price = r.unit_price,
                updated_at = now()
            WHERE product_id = r.inventory_item_id 
              AND organization_id = NEW.organization_id;

            -- 2. Update inventory table
            UPDATE public.inventory
            SET 
                unit_cost = r.unit_price,
                current_value = current_quantity * r.unit_price,
                updated_at = now()
            WHERE product_id = r.inventory_item_id
              AND organization_id = NEW.organization_id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to invoices
DROP TRIGGER IF EXISTS trigger_cascade_invoice_prices ON public.invoices;
CREATE TRIGGER trigger_cascade_invoice_prices
    AFTER UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.cascade_invoice_prices();

COMMIT;
