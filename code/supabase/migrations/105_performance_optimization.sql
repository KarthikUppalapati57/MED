-- ============================================================
-- Migration 105: Performance Optimization (RLS & Indexes)
-- ============================================================

-- This migration must NOT be run inside a transaction block because
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction.
-- Removing BEGIN/COMMIT wrappers for this migration.

-- 1. Redefine RLS Helper Functions for Maximum Performance
--    We pull directly from app_metadata instead of user_metadata
--    because migration 040 stores the current org context in app_metadata.
--    We ensure these functions are STABLE so PostgreSQL caches the result
--    per-query, preventing millions of redundant JWT parsing operations.

CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  ))::uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'ground_staff'
  );
$$;

-- 2. Add Missing B-Tree Indexes for Foreign Keys
--    Enterprise multi-tenant systems require the organization_id to be indexed
--    on every single table to prevent Sequential Scans when RLS evaluates.

-- Protect existing indexes from throwing errors using IF NOT EXISTS

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_vendor_id ON public.invoices(vendor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_organization_id ON public.inventory(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_organization_id ON public.payments(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_vendor_id ON public.payments(vendor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wastage_logs_organization_id ON public.wastage_logs(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_organization_id ON public.recipes(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auto_orders_organization_id ON public.auto_orders(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendors_organization_id ON public.vendors(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_organization_id ON public.brands(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_organization_id ON public.locations(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);

-- End of Migration
