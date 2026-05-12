-- ============================================================
-- 017: Policy Consolidation & Form Hardening
-- ============================================================
-- Fixes:
--   [SECURITY] Multiple permissive policies from the initial schema
--   were overlapping with the strict Tenant_Isolation policies, 
--   effectively bypassing row-level security.
--   [SECURITY] Public insert policies on business tables are removed.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1: Drop Overlapping Permissive Policies
-- ────────────────────────────────────────────────────────────
-- These policies used `USING (true)` or `WITH CHECK (true)` and
-- broke the multi-tenant isolation model.

-- Profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner/Admin can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner/Admin can manage profiles" ON public.profiles;

-- Vendors
DROP POLICY IF EXISTS "All users can view vendors" ON public.vendors;
DROP POLICY IF EXISTS "Manager+ can manage vendors" ON public.vendors;
DROP POLICY IF EXISTS "Manager+ can update vendors" ON public.vendors;
DROP POLICY IF EXISTS "Admin can delete vendors" ON public.vendors;

-- Products
DROP POLICY IF EXISTS "All users can view products" ON public.products;
DROP POLICY IF EXISTS "All users can create products" ON public.products;
DROP POLICY IF EXISTS "Manager+ can update products" ON public.products;
DROP POLICY IF EXISTS "Admin can delete products" ON public.products;

-- Invoices
DROP POLICY IF EXISTS "All users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "All users can upload invoices" ON public.invoices;
DROP POLICY IF EXISTS "Manager+ can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admin can delete invoices" ON public.invoices;

-- Payments
DROP POLICY IF EXISTS "All users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Manager+ can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Manager+ can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin can delete payments" ON public.payments;

-- Inventory
DROP POLICY IF EXISTS "All users can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "All users can create inventory" ON public.inventory;
DROP POLICY IF EXISTS "Manager+ can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Admin can delete inventory" ON public.inventory;

-- Wastage Logs
DROP POLICY IF EXISTS "All users can view wastage logs" ON public.wastage_logs;
DROP POLICY IF EXISTS "All users can log waste" ON public.wastage_logs;
DROP POLICY IF EXISTS "Admin can delete wastage logs" ON public.wastage_logs;

-- Recipes
DROP POLICY IF EXISTS "All users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Manager+ can manage recipes" ON public.recipes;
DROP POLICY IF EXISTS "Manager+ can update recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admin can delete recipes" ON public.recipes;

-- Auto Orders
DROP POLICY IF EXISTS "All users can view auto orders" ON public.auto_orders;
DROP POLICY IF EXISTS "Manager+ can manage auto orders" ON public.auto_orders;
DROP POLICY IF EXISTS "Manager+ can update auto orders" ON public.auto_orders;
DROP POLICY IF EXISTS "Admin can delete auto orders" ON public.auto_orders;


-- ────────────────────────────────────────────────────────────
-- 2: Hardening the Access/Demo/Contact Requests
-- ────────────────────────────────────────────────────────────
-- If these tables exist in the marketing site schemas, we drop the
-- Anon_Insert policies to force the use of Edge Functions with
-- rate-limiting and CAPTCHA validation.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'access_requests') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Anon_Insert_Access_Requests" ON public.access_requests';
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contact_requests') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Anon_Insert_Contact_Requests" ON public.contact_requests';
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'demo_requests') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Anon_Insert_Demo_Requests" ON public.demo_requests';
    END IF;
END $$;

COMMIT;
