-- Migration 026: Normalize Invoice Line Items
-- This migration removes existing invoice data and creates a normalized invoice_line_items table.

-- 1. Remove existing invoice data (and cascading dependencies like payments) to start fresh.
TRUNCATE TABLE public.invoices CASCADE;

-- 2. Create the invoice_line_items table
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id),
    inventory_item_id TEXT, -- References product_id
    item_name TEXT NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.invoice_line_items;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.invoice_line_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Compatibility helpers for fresh migration replay after 002 drops the initial helpers.
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS BOOLEAN AS $func$
  SELECT public.get_auth_role() IN ('manager', 'owner', 'admin', 'platform_admin');
$func$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $func$
  SELECT public.get_auth_role() IN ('admin', 'platform_admin');
$func$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS BOOLEAN AS $func$
  SELECT public.get_auth_role() IN ('owner', 'admin', 'platform_admin');
$func$ LANGUAGE sql SECURITY DEFINER STABLE;
-- 5. RLS Policies
DROP POLICY IF EXISTS "All users can view invoice line items" ON public.invoice_line_items;
CREATE POLICY "All users can view invoice line items" ON public.invoice_line_items 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can manage invoice line items" ON public.invoice_line_items;
CREATE POLICY "Manager+ can manage invoice line items" ON public.invoice_line_items 
    FOR INSERT WITH CHECK (public.is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can update invoice line items" ON public.invoice_line_items;
CREATE POLICY "Manager+ can update invoice line items" ON public.invoice_line_items 
    FOR UPDATE USING (public.is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can delete invoice line items" ON public.invoice_line_items;
CREATE POLICY "Admin can delete invoice line items" ON public.invoice_line_items 
    FOR DELETE USING (public.is_admin() AND organization_id = public.get_auth_org());

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_org_id ON public.invoice_line_items(organization_id);
