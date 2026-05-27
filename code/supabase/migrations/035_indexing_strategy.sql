-- Migration 035: Indexing Strategy (Phase 1)
-- Adds performance indexing to prevent full table scans on large enterprise tenants.

-- 1. Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_org ON public.inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON public.inventory(location_id);

-- 2. Invoice indexes
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON public.invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at);

-- 3. Product indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(accounting_category);
