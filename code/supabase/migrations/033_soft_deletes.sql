-- Migration 033: Soft Deletes System (Phase 1)
-- Replaces dangerous hard deletes with soft deletes for enterprise auditing and compliance.

-- 1. Add deleted_at and deleted_by columns to critical tables
ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.inventory 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.recipes 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 2. Update SELECT RLS Policies to exclude soft-deleted rows
-- INVOICES
DROP POLICY IF EXISTS "Users can view invoices" ON public.invoices;
CREATE POLICY "Users can view invoices" ON public.invoices 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- PAYMENTS
DROP POLICY IF EXISTS "Users can view payments" ON public.payments;
CREATE POLICY "Users can view payments" ON public.payments 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- INVENTORY
DROP POLICY IF EXISTS "Users can view inventory" ON public.inventory;
CREATE POLICY "Users can view inventory" ON public.inventory 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- PRODUCTS
DROP POLICY IF EXISTS "Users can view products" ON public.products;
CREATE POLICY "Users can view products" ON public.products 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- RECIPES
DROP POLICY IF EXISTS "Users can view recipes" ON public.recipes;
CREATE POLICY "Users can view recipes" ON public.recipes 
    FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

-- 3. Add index for fast exclusion of deleted rows
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at ON public.inventory(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_deleted_at ON public.recipes(deleted_at) WHERE deleted_at IS NOT NULL;
