-- Extracted RLS, RBAC, grants, and security mode statements
-- Generated: 2026-07-27

-- Source: 001_initial_schema.sql
-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

ALTER TABLE wastage_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

ALTER TABLE auto_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Owner/Admin can update any profile" ON profiles;

CREATE POLICY "Owner/Admin can update any profile" ON profiles FOR UPDATE USING (is_owner_or_admin());

DROP POLICY IF EXISTS "Owner/Admin can manage profiles" ON profiles;

CREATE POLICY "Owner/Admin can manage profiles" ON profiles FOR ALL USING (is_owner_or_admin());

-- ---- INVITATIONS ----
DROP POLICY IF EXISTS "Manager+ can view invitations" ON invitations;

CREATE POLICY "Manager+ can view invitations" ON invitations FOR SELECT USING (is_manager_or_above());

DROP POLICY IF EXISTS "Manager+ can create invitations" ON invitations;

CREATE POLICY "Manager+ can create invitations" ON invitations FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "Anyone can view their own invite by token" ON invitations;

CREATE POLICY "Anyone can view their own invite by token" ON invitations FOR SELECT USING (true);

-- ---- VENDORS ----
DROP POLICY IF EXISTS "All users can view vendors" ON vendors;

CREATE POLICY "All users can view vendors" ON vendors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manager+ can manage vendors" ON vendors;

CREATE POLICY "Manager+ can manage vendors" ON vendors FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "Manager+ can update vendors" ON vendors;

CREATE POLICY "Manager+ can update vendors" ON vendors FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete vendors" ON vendors;

CREATE POLICY "Admin can delete vendors" ON vendors FOR DELETE USING (is_admin());

-- ---- PRODUCTS ----
DROP POLICY IF EXISTS "All users can view products" ON products;

CREATE POLICY "All users can view products" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "All users can create products" ON products;

CREATE POLICY "All users can create products" ON products FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Manager+ can update products" ON products;

CREATE POLICY "Manager+ can update products" ON products FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete products" ON products;

CREATE POLICY "Admin can delete products" ON products FOR DELETE USING (is_admin());

-- ---- INVOICES ----
DROP POLICY IF EXISTS "All users can view invoices" ON invoices;

CREATE POLICY "All users can view invoices" ON invoices FOR SELECT USING (true);

DROP POLICY IF EXISTS "All users can upload invoices" ON invoices;

CREATE POLICY "All users can upload invoices" ON invoices FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Manager+ can update invoices" ON invoices;

CREATE POLICY "Manager+ can update invoices" ON invoices FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete invoices" ON invoices;

CREATE POLICY "Admin can delete invoices" ON invoices FOR DELETE USING (is_admin());

-- ---- PAYMENTS ----
DROP POLICY IF EXISTS "All users can view payments" ON payments;

CREATE POLICY "All users can view payments" ON payments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manager+ can manage payments" ON payments;

CREATE POLICY "Manager+ can manage payments" ON payments FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "Manager+ can update payments" ON payments;

CREATE POLICY "Manager+ can update payments" ON payments FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete payments" ON payments;

CREATE POLICY "Admin can delete payments" ON payments FOR DELETE USING (is_admin());

-- ---- INVENTORY ----
DROP POLICY IF EXISTS "All users can view inventory" ON inventory;

CREATE POLICY "All users can view inventory" ON inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS "All users can create inventory" ON inventory;

CREATE POLICY "All users can create inventory" ON inventory FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Manager+ can update inventory" ON inventory;

CREATE POLICY "Manager+ can update inventory" ON inventory FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete inventory" ON inventory;

CREATE POLICY "Admin can delete inventory" ON inventory FOR DELETE USING (is_admin());

-- ---- WASTAGE LOGS ----
DROP POLICY IF EXISTS "All users can view wastage logs" ON wastage_logs;

CREATE POLICY "All users can view wastage logs" ON wastage_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "All users can log waste" ON wastage_logs;

CREATE POLICY "All users can log waste" ON wastage_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can delete wastage logs" ON wastage_logs;

CREATE POLICY "Admin can delete wastage logs" ON wastage_logs FOR DELETE USING (is_admin());

-- ---- RECIPES ----
DROP POLICY IF EXISTS "All users can view recipes" ON recipes;

CREATE POLICY "All users can view recipes" ON recipes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manager+ can manage recipes" ON recipes;

CREATE POLICY "Manager+ can manage recipes" ON recipes FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "Manager+ can update recipes" ON recipes;

CREATE POLICY "Manager+ can update recipes" ON recipes FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete recipes" ON recipes;

CREATE POLICY "Admin can delete recipes" ON recipes FOR DELETE USING (is_admin());

-- ---- AUTO ORDERS ----
DROP POLICY IF EXISTS "All users can view auto orders" ON auto_orders;

CREATE POLICY "All users can view auto orders" ON auto_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manager+ can manage auto orders" ON auto_orders;

CREATE POLICY "Manager+ can manage auto orders" ON auto_orders FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "Manager+ can update auto orders" ON auto_orders;

CREATE POLICY "Manager+ can update auto orders" ON auto_orders FOR UPDATE USING (is_manager_or_above());

DROP POLICY IF EXISTS "Admin can delete auto orders" ON auto_orders;

CREATE POLICY "Admin can delete auto orders" ON auto_orders FOR DELETE USING (is_admin());

-- ---- NOTIFICATIONS ----
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;

CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;

CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;

CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- Source: 002_saas_hierarchy.sql
-- Special Rules for Profiles (Users see their own, Org Admins see their Org's users)
DROP POLICY IF EXISTS "RLS_SaaS_Profiles" ON public.profiles;

CREATE POLICY "RLS_SaaS_Profiles" ON public.profiles FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
    (auth.uid() = id) OR
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'owner'))
);

-- Enable RLS on new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform Admins see all Orgs" ON public.organizations;

CREATE POLICY "Platform Admins see all Orgs" ON public.organizations FOR ALL USING (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin');

DROP POLICY IF EXISTS "Users see their own Org" ON public.organizations;

CREATE POLICY "Users see their own Org" ON public.organizations FOR SELECT USING (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "Tenant Isolation Brands" ON public.brands;

CREATE POLICY "Tenant Isolation Brands" ON public.brands FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

DROP POLICY IF EXISTS "Tenant Isolation Locations" ON public.locations;

CREATE POLICY "Tenant Isolation Locations" ON public.locations FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

-- Source: 004_repair_schemas.sql
-- 3. Ensure profiles join works even if fields are null
-- (No SQL change needed for the join itself, but ensure RLS allows reading linked tables)
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_organizations" ON public.organizations;

CREATE POLICY "RLS_SaaS_Isolation_organizations" ON public.organizations FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_brands" ON public.brands;

CREATE POLICY "RLS_SaaS_Isolation_brands" ON public.brands FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_locations" ON public.locations;

CREATE POLICY "RLS_SaaS_Isolation_locations" ON public.locations FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

-- 4. Grant access to 'auth' schema for RLS helpers (if needed, but we used raw JWT)
-- This is just a safety measure for the dashboard queries
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;

-- Source: 005_emergency_fix_rls.sql
-- ============================================================
-- MEVS SAAS: EMERGENCY RLS REPAIR (FIX CAST ERRORS)
-- ============================================================

-- 1. Fix Organizations Policy (Handle missing JWT metadata safely)
DROP POLICY IF EXISTS "Platform Admins see all Orgs" ON public.organizations;

CREATE POLICY "Platform Admins see all Orgs" ON public.organizations FOR ALL USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'platform_admin'
);

DROP POLICY IF EXISTS "Users see their own Org" ON public.organizations;

CREATE POLICY "Users see their own Org" ON public.organizations FOR SELECT USING (
  id::text = COALESCE(auth.jwt() -> 'user_metadata' ->> 'organization_id', '')
);

-- 2. Fix Brands/Locations Policies
DROP POLICY IF EXISTS "Tenant Isolation Brands" ON public.brands;

CREATE POLICY "Tenant Isolation Brands" ON public.brands FOR ALL USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'platform_admin' OR 
  organization_id::text = COALESCE(auth.jwt() -> 'user_metadata' ->> 'organization_id', '')
);

DROP POLICY IF EXISTS "Tenant Isolation Locations" ON public.locations;

CREATE POLICY "Tenant Isolation Locations" ON public.locations FOR ALL USING (
  COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'platform_admin' OR 
  organization_id::text = COALESCE(auth.jwt() -> 'user_metadata' ->> 'organization_id', '')
);

-- 3. Fix Profiles Policy
DROP POLICY IF EXISTS "RLS_SaaS_Profiles" ON public.profiles;

CREATE POLICY "RLS_SaaS_Profiles" ON public.profiles FOR ALL USING (
  (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'platform_admin') OR
  (auth.uid() = id) OR
  (
    organization_id::text = COALESCE(auth.jwt() -> 'user_metadata' ->> 'organization_id', '') AND 
    COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'owner')
  )
);

-- Source: 006_saas_billing_and_audit.sql
-- RLS for Audit Logs - Only Org Admins can see their own logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS_Audit_Isolation" ON public.audit_logs;

CREATE POLICY "RLS_Audit_Isolation" ON public.audit_logs FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
    (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
);

-- RLS for Subscriptions (Internal use)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view plans" ON public.plans;

CREATE POLICY "Anyone can view plans" ON public.plans FOR SELECT USING (true);

-- Source: 007_public_invitations_fix.sql
-- Ensure RLS is enabled on invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Drop the restrictive policy if it exists on invitations
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_invitations" ON public.invitations;

-- Create a policy to allow anyone to read invitations.
-- Since tokens are required in the query and are unguessable, 
-- allowing SELECT is safe for the signup flow.
DROP POLICY IF EXISTS "Anyone can view their own invite by token" ON public.invitations;

CREATE POLICY "Anyone can view their own invite by token"
ON public.invitations
FOR SELECT
USING (true);

-- Ensure managers and above can still create and manage them
DROP POLICY IF EXISTS "Manager+ can manage invitations" ON public.invitations;

CREATE POLICY "Manager+ can manage invitations"
ON public.invitations
FOR ALL 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR 
  (auth.jwt() -> 'user_metadata' ->> 'role' IN ('manager', 'owner', 'admin'))
);

-- Source: 008_storage_policies.sql
-- ============================================================
-- 007: MEVS SAAS READINESS - STORAGE SECURITY
-- ============================================================

-- NOTE: This migration assumes you will create these buckets in the Supabase Dashboard
-- or via the CLI. These policies secure them at the SQL level.

-- buckets: 'invoices', 'avatars'

-- 1. INVOICES BUCKET POLICIES
-- Only users from the same organization can view invoices
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

-- 2. AVATARS BUCKET POLICIES
-- Avatars are public to view, but only the organization owners can manage their org's avatars
DROP POLICY IF EXISTS "Public Avatars View" ON storage.objects;

CREATE POLICY "Public Avatars View" ON storage.objects FOR SELECT USING (
    bucket_id = 'avatars'
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Manage" ON storage.objects FOR ALL USING (
    bucket_id = 'avatars' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

-- Source: 009_star_schema.sql
-- ============================================================
-- 13. ROW LEVEL SECURITY on Star Schema Tables
-- ============================================================
ALTER TABLE public.dim_date ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dim_vendor ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dim_product ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dim_user ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fact_invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fact_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fact_inventory ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fact_wastage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fact_orders ENABLE ROW LEVEL SECURITY;

-- dim_date is shared / public — everyone can read it
DROP POLICY IF EXISTS "dim_date_read_all" ON public.dim_date;

CREATE POLICY "dim_date_read_all" ON public.dim_date FOR SELECT USING (true);

-- Grant access to views
GRANT SELECT ON public.v_monthly_spend_by_vendor TO authenticated;

GRANT SELECT ON public.v_monthly_wastage TO authenticated;

GRANT SELECT ON public.v_payment_status_summary TO authenticated;

-- Source: 011_fix_onboarding_rls.sql
-- 011_fix_onboarding_rls.sql
-- This migration adds necessary INSERT policies for the onboarding process.
-- When a new user completes onboarding, they need to create an organization, 
-- a brand, and a location before their JWT metadata is updated.

-- 1. Allow authenticated users to create their own organization
DROP POLICY IF EXISTS "Users can create their own organization" ON public.organizations;

CREATE POLICY "Users can create their own organization"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- 2. Allow organization owners to create brands (even if organization_id is not in their JWT yet)
DROP POLICY IF EXISTS "Owners can create brands for their organizations" ON public.brands;

CREATE POLICY "Owners can create brands for their organizations"
ON public.brands
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organizations
        WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
);

-- 3. Allow organization owners to create locations (even if organization_id is not in their JWT yet)
DROP POLICY IF EXISTS "Owners can create locations for their organizations" ON public.locations;

CREATE POLICY "Owners can create locations for their organizations"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organizations
        WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
);

-- 4. Ensure organization owners can see their own organizations (even if organization_id is not in their JWT yet)
-- This supplements the existing JWT-based SELECT policies.
DROP POLICY IF EXISTS "Owners can view their own organizations" ON public.organizations;

CREATE POLICY "Owners can view their own organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Source: 012_fix_role_constraint_and_utility_functions.sql
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO anon, authenticated, service_role;

-- Source: 014_security_hardening_and_rls_optimization.sql
-- ╔══════════════════════════════════════════════════════════╗
-- ║  PHASE 1: Securing SECURITY DEFINER Functions           ║
-- ╚══════════════════════════════════════════════════════════╝

-- ────────────────────────────────────────────────────────────
-- 1A: Revoke public execution rights from sensitive functions
--
-- By default, Postgres grants EXECUTE to PUBLIC on new functions.
-- These SECURITY DEFINER functions run with the OWNER's elevated
-- privileges, so they must NOT be callable by anon or public.
-- ────────────────────────────────────────────────────────────

-- Core JWT helpers (used by RLS policies — must stay callable by authenticated)
REVOKE EXECUTE ON FUNCTION public.get_auth_role()              FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.get_auth_role()              TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_org()               FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.get_auth_org()               TO authenticated, service_role;

-- Invitation hierarchy check
REVOKE EXECUTE ON FUNCTION public.can_invite_role(TEXT)         FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.can_invite_role(TEXT)         TO authenticated, service_role;

-- Accessor functions (used in RLS policies)
REVOKE EXECUTE ON FUNCTION public.get_my_accessible_brand_ids()    FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.get_my_accessible_brand_ids()    TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_accessible_location_ids() FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated, service_role;

-- Onboarding RPC (only authenticated users should call this)
REVOKE EXECUTE ON FUNCTION public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Invitation acceptance (only authenticated users)
REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT)      FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.accept_invitation(TEXT)      TO authenticated, service_role;

-- Admin role update (only authenticated users — function internally enforces org_owner+)
REVOKE EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT) FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT) TO authenticated, service_role;

-- Only platform admins and authenticated users should see this
GRANT SELECT ON public.health_monitor TO authenticated;

REVOKE SELECT ON public.health_monitor FROM anon;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PHASE 2: Optimize RLS Policies (InitPlan Warnings)     ║
-- ╚══════════════════════════════════════════════════════════╝
--
-- Problem: Policies using auth.uid() directly force Postgres to
--          evaluate the function for EVERY ROW (InitPlan warning).
-- Fix:     Wrap in (SELECT auth.uid()) to cache the value once
--          per query execution.
-- ────────────────────────────────────────────────────────────

-- 2A: profiles_self_select — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;

CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

-- 2B: profiles_self_update — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- 2C: profiles_org_owner_delete — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_org_owner_delete" ON public.profiles;

CREATE POLICY "profiles_org_owner_delete"
  ON public.profiles FOR DELETE
  USING (
    (SELECT public.get_auth_role()) = 'org_owner'
    AND organization_id = (SELECT public.get_auth_org())
    AND id != (SELECT auth.uid())  -- cannot delete self
  );

-- 2D: invitations_cancel_own — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "invitations_cancel_own" ON public.invitations;

CREATE POLICY "invitations_cancel_own"
  ON public.invitations FOR DELETE
  USING (
    organization_id = (SELECT public.get_auth_org())
    AND (
      invited_by = (SELECT auth.uid())
      OR (SELECT public.get_auth_role()) = 'org_owner'
    )
  );

-- 2E: Also fix the legacy Profile_Self_Access if it still exists
DROP POLICY IF EXISTS "Profile_Self_Access" ON public.profiles;

DROP POLICY IF EXISTS "Profile_Org_Visibility" ON public.profiles;

-- Source: 015_create_error_logs_and_audit_hardening.sql
-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can INSERT error logs (the frontend logger)
CREATE POLICY "error_logs_authenticated_insert"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only platform admins can READ error logs
CREATE POLICY "error_logs_platform_admin_select"
  ON public.error_logs FOR SELECT
  USING ((SELECT public.get_auth_role()) = 'platform_admin');

-- Platform admins can manage (delete old logs, etc.)
CREATE POLICY "error_logs_platform_admin_manage"
  ON public.error_logs FOR DELETE
  USING ((SELECT public.get_auth_role()) = 'platform_admin');

-- Source: 017_policy_consolidation_and_public_forms.sql
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

-- Source: 018_fix_anon_invitation_read.sql
GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

-- Source: 021_add_phone_and_check_email_exists.sql
-- Revoke public execution to ensure explicit grants
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated, service_role;

-- Source: 026_normalize_invoice_line_items.sql
-- 4. Enable RLS
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

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

-- Source: 027_labor_management.sql
-- 4. Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (Employees)
DROP POLICY IF EXISTS "Users can view employees" ON public.employees;

CREATE POLICY "Users can view employees" ON public.employees 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can manage employees" ON public.employees;

CREATE POLICY "Manager+ can manage employees" ON public.employees 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can update employees" ON public.employees;

CREATE POLICY "Manager+ can update employees" ON public.employees 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can delete employees" ON public.employees;

CREATE POLICY "Admin can delete employees" ON public.employees 
    FOR DELETE USING (is_admin() AND organization_id = public.get_auth_org());

-- 6. RLS Policies (Employee Shifts)
DROP POLICY IF EXISTS "Users can view shifts" ON public.employee_shifts;

CREATE POLICY "Users can view shifts" ON public.employee_shifts 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can manage shifts" ON public.employee_shifts;

CREATE POLICY "Manager+ can manage shifts" ON public.employee_shifts 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Manager+ can update shifts" ON public.employee_shifts;

CREATE POLICY "Manager+ can update shifts" ON public.employee_shifts 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can delete shifts" ON public.employee_shifts;

CREATE POLICY "Admin can delete shifts" ON public.employee_shifts 
    FOR DELETE USING (is_admin() AND organization_id = public.get_auth_org());

-- Source: 028_accounting_and_onboarding.sql
-- 5. Enable RLS
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounting_sync_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Onboarding Progress
DROP POLICY IF EXISTS "Users can view onboarding" ON public.onboarding_progress;

CREATE POLICY "Users can view onboarding" ON public.onboarding_progress 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Users can manage onboarding" ON public.onboarding_progress;

CREATE POLICY "Users can manage onboarding" ON public.onboarding_progress 
    FOR ALL USING (organization_id = public.get_auth_org());

-- Integrations
DROP POLICY IF EXISTS "Users can view integrations" ON public.integrations;

CREATE POLICY "Users can view integrations" ON public.integrations 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can manage integrations" ON public.integrations;

CREATE POLICY "Admin can manage integrations" ON public.integrations 
    FOR ALL USING (is_owner_or_admin() AND organization_id = public.get_auth_org());

-- Accounting Sync Logs
DROP POLICY IF EXISTS "Users can view sync logs" ON public.accounting_sync_logs;

CREATE POLICY "Users can view sync logs" ON public.accounting_sync_logs 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "System can insert sync logs" ON public.accounting_sync_logs;

CREATE POLICY "System can insert sync logs" ON public.accounting_sync_logs 
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org());

-- Source: 031_recipe_normalization.sql
-- 3. Enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can view recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Manager+ can manage recipe ingredients" ON public.recipe_ingredients 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can update recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Manager+ can update recipe ingredients" ON public.recipe_ingredients 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Admin can delete recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Admin can delete recipe ingredients" ON public.recipe_ingredients 
    FOR DELETE USING (is_admin() AND organization_id = public.get_my_org());

-- Source: 032_inventory_movements.sql
-- 2. Enable RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "Users can view inventory movements" ON public.inventory_movements;

CREATE POLICY "Users can view inventory movements" ON public.inventory_movements 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage inventory movements" ON public.inventory_movements;

CREATE POLICY "Manager+ can manage inventory movements" ON public.inventory_movements 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

-- Source: 033_soft_deletes.sql
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

-- Source: 034_purchase_orders.sql
-- 4. Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Users can view purchase orders" ON public.purchase_orders;

CREATE POLICY "Users can view purchase orders" ON public.purchase_orders 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage purchase orders" ON public.purchase_orders;

CREATE POLICY "Manager+ can manage purchase orders" ON public.purchase_orders 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;

CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
        )
    );

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;

CREATE POLICY "Manager+ can manage purchase order items" ON public.purchase_order_items 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po 
            WHERE po.id = purchase_order_items.purchase_order_id 
            AND po.organization_id = public.get_my_org()
            AND is_manager_or_above()
        )
    );

-- Source: 036_financial_ledger.sql
-- 5. RLS Policies
ALTER TABLE public.ledger_bills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Ledger Bills
CREATE POLICY "Users can view ledger_bills" ON public.ledger_bills FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

CREATE POLICY "Manager+ can manage ledger_bills" ON public.ledger_bills FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Payments
CREATE POLICY "Users can view ledger_payments" ON public.ledger_payments FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

CREATE POLICY "Manager+ can manage ledger_payments" ON public.ledger_payments FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Entries (Immutable Audit)
CREATE POLICY "Users can view ledger_entries" ON public.ledger_entries FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "System can insert ledger_entries" ON public.ledger_entries FOR INSERT WITH CHECK (organization_id = public.get_my_org());

-- Source: 037_notification_system.sql
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications 
    FOR SELECT USING (user_id = auth.uid() AND organization_id = public.get_my_org());

-- System can create notifications for anyone in the org
CREATE POLICY "System can insert notifications" ON public.notifications 
    FOR INSERT WITH CHECK (organization_id = public.get_my_org());

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications" ON public.notifications 
    FOR UPDATE USING (user_id = auth.uid() AND organization_id = public.get_my_org());

-- Source: 038_ai_and_events.sql
-- 4. Enable RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Users can view ai_insights" ON public.ai_insights FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "System can insert ai_insights" ON public.ai_insights FOR INSERT WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "Manager+ can resolve ai_insights" ON public.ai_insights FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

CREATE POLICY "System can manage domain_events" ON public.domain_events FOR ALL USING (organization_id = public.get_my_org());

CREATE POLICY "System can manage processing_jobs" ON public.processing_jobs FOR ALL USING (organization_id = public.get_my_org());

-- Source: 039_granular_rbac.sql
-- 5. Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "Users can view roles" ON public.roles FOR SELECT USING (true);

CREATE POLICY "Users can view permissions" ON public.permissions FOR SELECT USING (true);

CREATE POLICY "Users can view role_permissions" ON public.role_permissions FOR SELECT USING (true);

CREATE POLICY "Users can view own user_roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_my_org());

CREATE POLICY "Admin can manage user_roles" ON public.user_roles FOR ALL USING (is_admin() AND organization_id = public.get_my_org());

-- Source: 040_multi_tenant_rbac.sql
-- Enable RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.location_members ENABLE ROW LEVEL SECURITY;

-- Basic RLS for viewing memberships
DROP POLICY IF EXISTS "Users can view own organization_members" ON public.organization_members;

CREATE POLICY "Users can view own organization_members" ON public.organization_members FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_auth_org() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "Users can view own brand_members" ON public.brand_members;

CREATE POLICY "Users can view own brand_members" ON public.brand_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.brands WHERE id = brand_id AND organization_id = public.get_auth_org()));

DROP POLICY IF EXISTS "Users can view own location_members" ON public.location_members;

CREATE POLICY "Users can view own location_members" ON public.location_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.locations WHERE id = location_id AND organization_id = public.get_auth_org()));

-- Source: 041_admin_delete_user.sql
-- Protect the archive table
ALTER TABLE public.archived_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view archived users" ON public.archived_users;

CREATE POLICY "Platform admins can view archived users" ON public.archived_users 
FOR SELECT USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'platform_admin');

-- Source: 045_pos_avt_costing.sql
-- Enable RLS
ALTER TABLE public.pos_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pos_menu_mapping ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pos_sales_data ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
DROP POLICY IF EXISTS "Users can view pos items" ON public.pos_items;

CREATE POLICY "Users can view pos items" ON public.pos_items FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos items" ON public.pos_items;

CREATE POLICY "Manager+ can manage pos items" ON public.pos_items FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view pos menu mapping" ON public.pos_menu_mapping;

CREATE POLICY "Users can view pos menu mapping" ON public.pos_menu_mapping FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos menu mapping" ON public.pos_menu_mapping;

CREATE POLICY "Manager+ can manage pos menu mapping" ON public.pos_menu_mapping FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can view pos sales data" ON public.pos_sales_data;

CREATE POLICY "Users can view pos sales data" ON public.pos_sales_data FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage pos sales data" ON public.pos_sales_data;

CREATE POLICY "Manager+ can manage pos sales data" ON public.pos_sales_data FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Source: 046_storage_security.sql
-- Add CHECK constraints directly to existing INSERT and UPDATE policies
-- For 'invoices' bucket
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);

-- For 'avatars' bucket
-- Note: 'avatars' manage policy is an ALL policy, we must split it or add a specific INSERT policy
-- Since 008 created an ALL policy, we can redefine it
DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;

-- Recreate SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Tenant Isolation Avatars Update" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Update" ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Recreate INSERT with security check
DROP POLICY IF EXISTS "Tenant Isolation Avatars Insert" ON storage.objects;

CREATE POLICY "Tenant Isolation Avatars Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);

-- Source: 047_fix_user_metadata_vulnerability.sql
-- 2. Drop and securely recreate the "Platform admins can view archived records" policy on all 5 archived tables
-- Archived Organizations
DROP POLICY IF EXISTS "Platform admins can view archived records" ON public.archived_organizations;

CREATE POLICY "Platform admins can view archived records" ON public.archived_organizations 
FOR SELECT USING (public.is_platform_admin());

-- Archived Brands
DROP POLICY IF EXISTS "Platform admins can view archived records" ON public.archived_brands;

CREATE POLICY "Platform admins can view archived records" ON public.archived_brands 
FOR SELECT USING (public.is_platform_admin());

-- Archived Locations
DROP POLICY IF EXISTS "Platform admins can view archived records" ON public.archived_locations;

CREATE POLICY "Platform admins can view archived records" ON public.archived_locations 
FOR SELECT USING (public.is_platform_admin());

-- Archived Profiles
DROP POLICY IF EXISTS "Platform admins can view archived records" ON public.archived_profiles;

CREATE POLICY "Platform admins can view archived records" ON public.archived_profiles 
FOR SELECT USING (public.is_platform_admin());

-- Archived Invitations
DROP POLICY IF EXISTS "Platform admins can view archived records" ON public.archived_invitations;

CREATE POLICY "Platform admins can view archived records" ON public.archived_invitations 
FOR SELECT USING (public.is_platform_admin());

-- 3. Fix older Storage policies from migration 008 that use user_metadata
-- Invoices View
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Invoices Delete
DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Source: 050_orders_lifecycle.sql
-- RLS
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

ALTER TABLE receivings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transfers org read access" ON transfers FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Transfers org write access" ON transfers FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Receivings org read access" ON receivings FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Receivings org write access" ON receivings FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

-- Source: 051_inventory_count_sheets.sql
-- RLS
ALTER TABLE count_sheets ENABLE ROW LEVEL SECURITY;

ALTER TABLE count_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Count_sheets org read access" ON count_sheets FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Count_sheets org write access" ON count_sheets FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Count_sessions org read access" ON count_sessions FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Count_sessions org write access" ON count_sessions FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

-- Source: 052_enterprise_readiness.sql
-- RLS for closed_periods
ALTER TABLE closed_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closed_periods org read access" ON closed_periods FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Closed_periods org write access" ON closed_periods FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

-- RLS for location_groups
ALTER TABLE location_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Location_groups org read access" ON location_groups FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Location_groups org write access" ON location_groups FOR ALL USING (
  organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

-- Source: 054_custom_rbac_roles.sql
-- 3. Update RLS policies for roles table
DROP POLICY IF EXISTS "Users can view roles" ON public.roles;

-- Anyone can read system roles, and users can read their own org's custom roles
CREATE POLICY "Users can view roles" ON public.roles 
FOR SELECT USING (
    is_system = true 
    OR organization_id = public.get_auth_org() 
    OR public.get_auth_role() = 'platform_admin'
);

-- Only org owners (or platform admins) can insert/update custom roles
CREATE POLICY "Org owners can manage custom roles" ON public.roles 
FOR ALL USING (
    is_system = false 
    AND (
        (public.get_auth_role() = 'org_owner' AND organization_id = public.get_auth_org())
        OR public.get_auth_role() = 'platform_admin'
    )
);

-- Source: 058_gl_mappings.sql
ALTER TABLE public.gl_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org gl mappings" ON public.gl_mappings;

CREATE POLICY "Users can view org gl mappings" ON public.gl_mappings 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage gl mappings" ON public.gl_mappings;

CREATE POLICY "Manager+ can manage gl mappings" ON public.gl_mappings 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Source: 059_vendor_item_prices.sql
ALTER TABLE public.vendor_item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view vendor item prices" ON public.vendor_item_prices;

CREATE POLICY "Users can view vendor item prices" ON public.vendor_item_prices 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Managers can manage vendor item prices" ON public.vendor_item_prices;

CREATE POLICY "Managers can manage vendor item prices" ON public.vendor_item_prices 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Source: 060_edi_routing.sql
ALTER TABLE public.edi_transmissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view EDI transmissions" ON public.edi_transmissions;

CREATE POLICY "Users can view EDI transmissions" ON public.edi_transmissions 
    FOR SELECT USING (organization_id = public.get_my_org());

-- Source: 065_webhook_infrastructure.sql
-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_events_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Policies for api_keys
CREATE POLICY "Users can view api keys" ON public.api_keys 
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Managers can manage api keys" ON public.api_keys 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_endpoints
CREATE POLICY "Users can view webhook endpoints" ON public.webhook_endpoints 
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Managers can manage webhook endpoints" ON public.webhook_endpoints 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_subscriptions
CREATE POLICY "Users can view webhook subscriptions" ON public.webhook_subscriptions 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));

CREATE POLICY "Managers can manage webhook subscriptions" ON public.webhook_subscriptions 
    FOR ALL USING (is_manager_or_above() AND EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));

-- Policies for webhook_events_queue
CREATE POLICY "Users can view webhook events" ON public.webhook_events_queue 
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Managers can manage webhook events" ON public.webhook_events_queue 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_delivery_logs
CREATE POLICY "Users can view webhook delivery logs" ON public.webhook_delivery_logs 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));

-- Source: 067_realtime_events.sql
-- Enable RLS
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- Read policies for UI real-time subscription
CREATE POLICY "Users can view their organization events" ON public.event_logs
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Platform admins can view all events" ON public.event_logs
    FOR SELECT USING (public.is_platform_admin());

-- Source: 069_production_workflow_completion.sql
ALTER TABLE public.operational_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operational settings org read access" ON public.operational_settings;

CREATE POLICY "Operational settings org read access"
  ON public.operational_settings
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Operational settings manager write access" ON public.operational_settings;

CREATE POLICY "Operational settings manager write access"
  ON public.operational_settings
  FOR ALL
  USING (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Source: 071_workflow_depth_completion.sql
ALTER TABLE public.budget_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Budget targets org read access" ON public.budget_targets;

CREATE POLICY "Budget targets org read access"
  ON public.budget_targets
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Budget targets manager write access" ON public.budget_targets;

CREATE POLICY "Budget targets manager write access"
  ON public.budget_targets
  FOR ALL
  USING (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Source: 072_missing_marginedge_workflows.sql
ALTER TABLE public.smart_prep_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ask_tom_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ask_tom_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SmartPrep org read access" ON public.smart_prep_plans;

CREATE POLICY "SmartPrep org read access" ON public.smart_prep_plans
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "SmartPrep manager write access" ON public.smart_prep_plans;

CREATE POLICY "SmartPrep manager write access" ON public.smart_prep_plans
  FOR ALL USING (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()))
  WITH CHECK (public.is_platform_admin() OR (public.is_manager_or_above() AND organization_id = public.get_my_org()));

DROP POLICY IF EXISTS "Ask Tom thread org read access" ON public.ask_tom_threads;

CREATE POLICY "Ask Tom thread org read access" ON public.ask_tom_threads
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom thread user write access" ON public.ask_tom_threads;

CREATE POLICY "Ask Tom thread user write access" ON public.ask_tom_threads
  FOR ALL USING (public.is_platform_admin() OR organization_id = public.get_my_org())
  WITH CHECK (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom message org read access" ON public.ask_tom_messages;

CREATE POLICY "Ask Tom message org read access" ON public.ask_tom_messages
  FOR SELECT USING (public.is_platform_admin() OR organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Ask Tom message user insert access" ON public.ask_tom_messages;

CREATE POLICY "Ask Tom message user insert access" ON public.ask_tom_messages
  FOR INSERT WITH CHECK (public.is_platform_admin() OR organization_id = public.get_my_org());

-- Source: 075_role_dashboard_summary_rpc.sql
GRANT EXECUTE ON FUNCTION public.get_role_dashboard_summary(TEXT, UUID, UUID, UUID, DATE, DATE) TO authenticated;

-- Source: 076_dashboard_persistence.sql
ALTER TABLE public.dashboard_action_status ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_handoff_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_review_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_escalation_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_report_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_action_status_select" ON public.dashboard_action_status;

CREATE POLICY "dashboard_action_status_select"
  ON public.dashboard_action_status FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_action_status_insert" ON public.dashboard_action_status;

CREATE POLICY "dashboard_action_status_insert"
  ON public.dashboard_action_status FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_action_status_update" ON public.dashboard_action_status;

CREATE POLICY "dashboard_action_status_update"
  ON public.dashboard_action_status FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_select" ON public.dashboard_handoff_notes;

CREATE POLICY "dashboard_handoff_notes_select"
  ON public.dashboard_handoff_notes FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_insert" ON public.dashboard_handoff_notes;

CREATE POLICY "dashboard_handoff_notes_insert"
  ON public.dashboard_handoff_notes FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_handoff_notes_update" ON public.dashboard_handoff_notes;

CREATE POLICY "dashboard_handoff_notes_update"
  ON public.dashboard_handoff_notes FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_select" ON public.dashboard_review_logs;

CREATE POLICY "dashboard_review_logs_select"
  ON public.dashboard_review_logs FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_insert" ON public.dashboard_review_logs;

CREATE POLICY "dashboard_review_logs_insert"
  ON public.dashboard_review_logs FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_update" ON public.dashboard_review_logs;

CREATE POLICY "dashboard_review_logs_update"
  ON public.dashboard_review_logs FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_review_logs_delete" ON public.dashboard_review_logs;

CREATE POLICY "dashboard_review_logs_delete"
  ON public.dashboard_review_logs FOR DELETE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_escalation_rules_select" ON public.dashboard_escalation_rules;

CREATE POLICY "dashboard_escalation_rules_select"
  ON public.dashboard_escalation_rules FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_escalation_rules_insert" ON public.dashboard_escalation_rules;

CREATE POLICY "dashboard_escalation_rules_insert"
  ON public.dashboard_escalation_rules FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_escalation_rules_update" ON public.dashboard_escalation_rules;

CREATE POLICY "dashboard_escalation_rules_update"
  ON public.dashboard_escalation_rules FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_preferences_select" ON public.dashboard_report_preferences;

CREATE POLICY "dashboard_report_preferences_select"
  ON public.dashboard_report_preferences FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_preferences_insert" ON public.dashboard_report_preferences;

CREATE POLICY "dashboard_report_preferences_insert"
  ON public.dashboard_report_preferences FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_preferences_update" ON public.dashboard_report_preferences;

CREATE POLICY "dashboard_report_preferences_update"
  ON public.dashboard_report_preferences FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

GRANT SELECT, INSERT, UPDATE ON public.dashboard_action_status TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.dashboard_handoff_notes TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_review_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.dashboard_escalation_rules TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.dashboard_report_preferences TO authenticated;

-- Source: 077_dashboard_report_scheduler.sql
ALTER TABLE public.dashboard_report_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_report_deliveries_select" ON public.dashboard_report_deliveries;

CREATE POLICY "dashboard_report_deliveries_select"
  ON public.dashboard_report_deliveries FOR SELECT
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_deliveries_insert" ON public.dashboard_report_deliveries;

CREATE POLICY "dashboard_report_deliveries_insert"
  ON public.dashboard_report_deliveries FOR INSERT
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

DROP POLICY IF EXISTS "dashboard_report_deliveries_update" ON public.dashboard_report_deliveries;

CREATE POLICY "dashboard_report_deliveries_update"
  ON public.dashboard_report_deliveries FOR UPDATE
  USING (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope))
  WITH CHECK (public.can_access_dashboard_scope(organization_id, brand_id, location_id, scope));

GRANT SELECT, INSERT, UPDATE ON public.dashboard_report_deliveries TO authenticated;

-- Source: 078_unified_invoice_ap_ledger.sql
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment accounts org read access" ON public.payment_accounts;

CREATE POLICY "Payment accounts org read access"
  ON public.payment_accounts FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Payment accounts manager write access" ON public.payment_accounts;

CREATE POLICY "Payment accounts manager write access"
  ON public.payment_accounts FOR ALL
  USING (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Source: 079_invoice_action_reasons.sql
ALTER TABLE public.invoice_action_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice action reasons read access" ON public.invoice_action_reasons;

CREATE POLICY "Invoice action reasons read access"
  ON public.invoice_action_reasons FOR SELECT
  USING (true);

-- Source: 080_invoice_document_intake.sql
ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice documents read access" ON public.invoice_documents;

CREATE POLICY "Invoice documents read access" ON public.invoice_documents FOR SELECT USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Invoice documents write access" ON public.invoice_documents;

CREATE POLICY "Invoice documents write access" ON public.invoice_documents FOR ALL USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
) WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

ALTER TABLE public.invoice_ingestion_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingestion jobs read access" ON public.invoice_ingestion_jobs;

CREATE POLICY "Ingestion jobs read access" ON public.invoice_ingestion_jobs FOR SELECT USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Ingestion jobs write access" ON public.invoice_ingestion_jobs;

CREATE POLICY "Ingestion jobs write access" ON public.invoice_ingestion_jobs FOR ALL USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
) WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
  OR organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- Source: 081_vendor_item_matching.sql
ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_item_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Vendor aliases read" ON public.vendor_aliases;

CREATE POLICY "Vendor aliases read" ON public.vendor_aliases FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor aliases write" ON public.vendor_aliases;

CREATE POLICY "Vendor aliases write" ON public.vendor_aliases FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor items read" ON public.vendor_items;

CREATE POLICY "Vendor items read" ON public.vendor_items FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor items write" ON public.vendor_items;

CREATE POLICY "Vendor items write" ON public.vendor_items FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor item mappings read" ON public.vendor_item_mappings;

CREATE POLICY "Vendor item mappings read" ON public.vendor_item_mappings FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor item mappings write" ON public.vendor_item_mappings;

CREATE POLICY "Vendor item mappings write" ON public.vendor_item_mappings FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- Source: 082_three_way_reconciliation.sql
ALTER TABLE public.tolerance_configurations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_line_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reconciliation_variances ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Tolerances read" ON public.tolerance_configurations FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Tolerances write" ON public.tolerance_configurations FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Line matches read" ON public.invoice_line_matches FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Line matches write" ON public.invoice_line_matches FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Variances read" ON public.reconciliation_variances FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Variances write" ON public.reconciliation_variances FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- Source: 083_invoice_allocations.sql
ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Invoice allocations read" ON public.invoice_allocations FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Invoice allocations write" ON public.invoice_allocations FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- Source: 084_approval_workflows.sql
ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "View policies" ON public.approval_policies FOR SELECT USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage policies" ON public.approval_policies FOR ALL USING (
  (public.is_manager_or_above() AND organization_id = public.get_my_org()) OR public.is_platform_admin()
);

CREATE POLICY "View instances" ON public.approval_instances FOR SELECT USING (
  invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org())
);

CREATE POLICY "Manage instances" ON public.approval_instances FOR ALL USING (
  invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org())
);

CREATE POLICY "View steps" ON public.approval_steps FOR SELECT USING (
  instance_id IN (SELECT id FROM public.approval_instances WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org()))
);

CREATE POLICY "Manage steps" ON public.approval_steps FOR ALL USING (
  instance_id IN (SELECT id FROM public.approval_instances WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = public.get_my_org()))
);

-- Source: 086_invoice_audit_events.sql
-- RLS
ALTER TABLE public.invoice_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View invoice audit events" ON public.invoice_audit_events FOR SELECT USING (
  organization_id = public.get_my_org() OR public.is_platform_admin()
);

CREATE POLICY "Insert invoice audit events" ON public.invoice_audit_events FOR INSERT WITH CHECK (
  organization_id = public.get_my_org() OR public.is_platform_admin()
);

-- Source: 087_general_ledger.sql
-- RLS
ALTER TABLE public.general_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

-- Source: 088_credit_requests.sql
-- RLS
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credit_requests for their organizations"
    ON public.credit_requests FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert credit_requests for their organizations"
    ON public.credit_requests FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update credit_requests for their organizations"
    ON public.credit_requests FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

-- Source: 091_period_budgets.sql
-- RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view budgets in their org"
    ON public.budgets FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Admins can manage budgets"
    ON public.budgets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE user_id = auth.uid() AND organization_id = budgets.organization_id AND role IN ('owner', 'admin', 'manager')
        )
    );

-- Source: 093_commissary.sql
-- RLS
ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers in their org"
    ON public.intercompany_transfers FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert transfers in their org"
    ON public.intercompany_transfers FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Admins and managers can update transfers"
    ON public.intercompany_transfers FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE user_id = auth.uid() AND organization_id = intercompany_transfers.organization_id AND role IN ('owner', 'admin', 'manager')
        )
    );

-- Source: 094_global_items.sql
-- Note: This table has NO organization_id because it is a platform-wide data asset.
-- Only platform admins or automated edge functions can write to this, but all authenticated users can read.

-- RLS
ALTER TABLE public.global_vendor_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read global items"
    ON public.global_vendor_items FOR SELECT
    USING (auth.role() = 'authenticated');

-- Source: 095_harden_payment_rbac.sql
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_payments" ON public.payments;

DROP POLICY IF EXISTS "All users can view payments" ON public.payments;

DROP POLICY IF EXISTS "Users can view payments" ON public.payments;

DROP POLICY IF EXISTS "Manager+ can manage payments" ON public.payments;

DROP POLICY IF EXISTS "Manager+ can update payments" ON public.payments;

DROP POLICY IF EXISTS "Admin can delete payments" ON public.payments;

DROP POLICY IF EXISTS "Payments role-scoped select" ON public.payments;

DROP POLICY IF EXISTS "Payments role-scoped insert" ON public.payments;

DROP POLICY IF EXISTS "Payments role-scoped update" ON public.payments;

DROP POLICY IF EXISTS "Payments owner delete" ON public.payments;

CREATE POLICY "Payments role-scoped select"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped update"
  ON public.payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments owner delete"
  ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('org_owner', 'owner', 'admin')
          )
        )
    )
  );

-- Source: 097_finalize_payment_rbac_and_labor_forecast.sql
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments role-scoped select"
  ON public.payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments role-scoped update"
  ON public.payments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('location_manager', 'manager', 'branch_manager', 'org_owner', 'owner', 'admin')
          )
        )
    )
  );

CREATE POLICY "Payments owner delete"
  ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'platform_admin'
          OR (
            p.organization_id = public.payments.organization_id
            AND p.role IN ('org_owner', 'owner', 'admin')
          )
        )
    )
  );

-- Source: 100_scheduled_payments.sql
-- RLS
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scheduled payments"
    ON public.scheduled_payments FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage scheduled payments"
    ON public.scheduled_payments FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- RLS for intersection
ALTER TABLE public.scheduled_payment_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scheduled payment invoices"
    ON public.scheduled_payment_invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.scheduled_payments sp
            WHERE sp.id = scheduled_payment_id
            AND (sp.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

CREATE POLICY "Manage scheduled payment invoices"
    ON public.scheduled_payment_invoices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.scheduled_payments sp
            WHERE sp.id = scheduled_payment_id
            AND (sp.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

-- Source: 101_vendor_statements.sql
-- RLS
ALTER TABLE public.vendor_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vendor statements"
    ON public.vendor_statements FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage vendor statements"
    ON public.vendor_statements FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- RLS
ALTER TABLE public.vendor_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vendor statement lines"
    ON public.vendor_statement_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.vendor_statements vs
            WHERE vs.id = statement_id
            AND (vs.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

CREATE POLICY "Manage vendor statement lines"
    ON public.vendor_statement_lines FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.vendor_statements vs
            WHERE vs.id = statement_id
            AND (vs.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

-- Source: 102_accounting_sync.sql
-- RLS
ALTER TABLE public.accounting_export_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View export queue"
    ON public.accounting_export_queue FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage export queue"
    ON public.accounting_export_queue FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- Source: 109_database_monitoring.sql
-- Grant select permission on the view to authenticated users (or restrict to admins)
GRANT SELECT ON public.vw_slow_queries TO authenticated;

-- Source: 115_resolve_advisor_lints.sql
-- 2. Security: Revoke API access to mv_daily_sales_summary
REVOKE ALL ON public.mv_daily_sales_summary FROM anon, authenticated;

-- Source: 116_table_partitioning.sql
-- Enable RLS and recreate policies for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "audit_logs_authenticated_insert" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can view all audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'platform_admin'::text )
    );

-- Enable RLS and recreate policies for error_logs
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_logs_authenticated_insert" ON public.error_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Source: 118_live_schema_repair_and_security.sql
-- Revoke direct access to query text/statistics from normal authenticated users.
REVOKE ALL ON public.vw_slow_queries FROM anon, authenticated, public;

-- Source: 122_harden_native_workflow_triggers.sql
ALTER TABLE private.workflow_runtime_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Source: 127_vendor_command_center.sql
ALTER TABLE public.vendor_issues ENABLE ROW LEVEL SECURITY;

-- 4. RLS for vendor_issues
DROP POLICY IF EXISTS "Vendor issues read" ON public.vendor_issues;

CREATE POLICY "Vendor issues read" ON public.vendor_issues FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor issues write" ON public.vendor_issues;

CREATE POLICY "Vendor issues write" ON public.vendor_issues FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- Source: 131_procurement_receivings.sql
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

-- Source: 20260520201733_add_stripe_billing_fields.sql
-- Audit logs should be append-only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view all audit logs" ON audit_logs;

CREATE POLICY "Platform admins can view all audit logs" ON audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'platform_admin'
        )
    );

DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;

CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- Source: 20260617001000_enable_rls_on_log_partitions.sql
ALTER TABLE public.audit_logs_default ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs_y2025 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs_y2026 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.error_logs_default ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.error_logs_y2025 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.error_logs_y2026 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_default;

DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_y2025;

DROP POLICY IF EXISTS "Platform admins can view audit log partition" ON public.audit_logs_y2026;

DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_default;

DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_y2025;

DROP POLICY IF EXISTS "Authenticated users can insert audit log partition" ON public.audit_logs_y2026;

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_default
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_y2025
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view audit log partition"
  ON public.audit_logs_y2026
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_default
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_y2025
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit log partition"
  ON public.audit_logs_y2026
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_default;

DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_y2025;

DROP POLICY IF EXISTS "Platform admins can view error log partition" ON public.error_logs_y2026;

DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_default;

DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_y2025;

DROP POLICY IF EXISTS "Authenticated users can insert error log partition" ON public.error_logs_y2026;

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_default
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_y2025
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Platform admins can view error log partition"
  ON public.error_logs_y2026
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_admin'
    )
  );

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_default
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_y2025
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert error log partition"
  ON public.error_logs_y2026
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Source: 20260617003000_secure_webhook_dispatcher_cron.sql
REVOKE ALL ON FUNCTION public.dispatch_webhook_queue() FROM PUBLIC, anon, authenticated;

-- Source: 20260618043000_grant_auth_helper_execute_to_api_roles.sql
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_role() TO anon, authenticated, service_role;

-- Source: 20260618044000_grant_access_helper_execute_to_api_roles.sql
GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO anon, authenticated, service_role;

-- Source: 20260618143000_remove_legacy_access_levels.sql
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;

-- Source: 20260618153000_create_tenant_registry.sql
ALTER TABLE public.tenant_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_registry_platform_admin_all" ON public.tenant_registry;

CREATE POLICY "tenant_registry_platform_admin_all"
ON public.tenant_registry
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_registry_org_read" ON public.tenant_registry;

CREATE POLICY "tenant_registry_org_read"
ON public.tenant_registry
FOR SELECT
USING (organization_id = public.get_my_org());

-- Source: 20260618154500_create_tenant_template_schema.sql
-- The template must not be queried directly by browser/API roles.
REVOKE ALL ON SCHEMA tenant_template FROM PUBLIC;

REVOKE ALL ON SCHEMA tenant_template FROM anon;

REVOKE ALL ON SCHEMA tenant_template FROM authenticated;

GRANT USAGE ON SCHEMA tenant_template TO service_role;

ALTER TABLE public.tenant_template_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_template_tables_platform_admin_all" ON public.tenant_template_tables;

CREATE POLICY "tenant_template_tables_platform_admin_all"
ON public.tenant_template_tables
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_template_tables_org_read" ON public.tenant_template_tables;

CREATE POLICY "tenant_template_tables_org_read"
ON public.tenant_template_tables
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Source: 20260618160000_provision_tenant_schema.sql
REVOKE ALL ON FUNCTION public.generate_tenant_schema_name(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_tenant_schema_name(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.provision_tenant_schema(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provision_tenant_schema(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_planned_tenant_schemas(INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provision_planned_tenant_schemas(INTEGER) TO authenticated, service_role;

-- Source: 20260618161500_tenant_access_routing.sql
REVOKE ALL ON FUNCTION public.get_tenant_runtime(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_runtime(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_tenant_schema(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_schema(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.assert_tenant_scope(UUID, UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_tenant_scope(UUID, UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_data_route(UUID, UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_data_route(UUID, UUID, UUID) TO authenticated, service_role;

-- Source: 20260618163000_dual_write_mirror_infrastructure.sql
ALTER TABLE public.tenant_mirror_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_mirror_tables_platform_admin_all" ON public.tenant_mirror_tables;

CREATE POLICY "tenant_mirror_tables_platform_admin_all"
ON public.tenant_mirror_tables
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_mirror_tables_authenticated_read" ON public.tenant_mirror_tables;

CREATE POLICY "tenant_mirror_tables_authenticated_read"
ON public.tenant_mirror_tables
FOR SELECT
USING (auth.uid() IS NOT NULL);

REVOKE ALL ON FUNCTION public.mirror_public_row_to_tenant_schema() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.install_tenant_mirror_triggers() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.install_tenant_mirror_triggers() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260618164500_tenant_backfill_validation.sql
ALTER TABLE public.tenant_backfill_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_backfill_table_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_backfill_runs_platform_admin_all" ON public.tenant_backfill_runs;

CREATE POLICY "tenant_backfill_runs_platform_admin_all"
ON public.tenant_backfill_runs
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_backfill_runs_org_read" ON public.tenant_backfill_runs;

CREATE POLICY "tenant_backfill_runs_org_read"
ON public.tenant_backfill_runs
FOR SELECT
USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "tenant_backfill_results_platform_admin_all" ON public.tenant_backfill_table_results;

CREATE POLICY "tenant_backfill_results_platform_admin_all"
ON public.tenant_backfill_table_results
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_backfill_results_org_read" ON public.tenant_backfill_table_results;

CREATE POLICY "tenant_backfill_results_org_read"
ON public.tenant_backfill_table_results
FOR SELECT
USING (organization_id = public.get_my_org());

REVOKE ALL ON FUNCTION public.backfill_tenant_schema(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.backfill_tenant_schema(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_tenant_backfill_counts(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.validate_tenant_backfill_counts(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.backfill_planned_tenant_schemas(INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.backfill_planned_tenant_schemas(INTEGER) TO authenticated, service_role;

-- Source: 20260618170000_tenant_read_cutover_controls.sql
ALTER TABLE public.tenant_cutover_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_cutover_events_platform_admin_all" ON public.tenant_cutover_events;

CREATE POLICY "tenant_cutover_events_platform_admin_all"
ON public.tenant_cutover_events
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_cutover_events_org_read" ON public.tenant_cutover_events;

CREATE POLICY "tenant_cutover_events_org_read"
ON public.tenant_cutover_events
FOR SELECT
USING (organization_id = public.get_my_org());

REVOKE ALL ON FUNCTION public.get_tenant_cutover_status(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_cutover_status(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_read_mode(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_read_mode(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- Source: 20260619101500_tenant_write_cutover_controls.sql
REVOKE ALL ON FUNCTION public.get_tenant_write_cutover_status(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_write_cutover_status(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- Source: 20260619103000_tenant_reporting_snapshots.sql
ALTER TABLE public.tenant_reporting_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_reporting_snapshots_platform_admin_all" ON public.tenant_reporting_snapshots;

CREATE POLICY "tenant_reporting_snapshots_platform_admin_all"
ON public.tenant_reporting_snapshots
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_reporting_snapshots_org_read" ON public.tenant_reporting_snapshots;

CREATE POLICY "tenant_reporting_snapshots_org_read"
ON public.tenant_reporting_snapshots
FOR SELECT
USING (organization_id = public.get_my_org());

REVOKE ALL ON TABLE public.tenant_reporting_snapshots FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.tenant_reporting_snapshots TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_reporting_snapshots TO service_role;

REVOKE ALL ON FUNCTION public.count_tenant_reporting_rows(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.count_tenant_reporting_rows(TEXT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_tenant_reporting_snapshot(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.refresh_tenant_reporting_snapshot(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.refresh_all_tenant_reporting_snapshots(INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.refresh_all_tenant_reporting_snapshots(INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_reporting_snapshots(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_snapshots(UUID) TO authenticated, service_role;

-- Source: 20260619110000_tenant_pilot_cutover_controls.sql
ALTER TABLE public.tenant_pilot_cutovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_pilot_cutovers_platform_admin_all" ON public.tenant_pilot_cutovers;

CREATE POLICY "tenant_pilot_cutovers_platform_admin_all"
ON public.tenant_pilot_cutovers
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_pilot_cutovers_org_read" ON public.tenant_pilot_cutovers;

CREATE POLICY "tenant_pilot_cutovers_org_read"
ON public.tenant_pilot_cutovers
FOR SELECT
USING (organization_id = public.get_my_org());

REVOKE ALL ON TABLE public.tenant_pilot_cutovers FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.tenant_pilot_cutovers TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_pilot_cutovers TO service_role;

REVOKE ALL ON FUNCTION public.select_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.select_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_tenant_pilot_cutover(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prepare_tenant_pilot_cutover(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_pilot_read_cutover(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.apply_tenant_pilot_read_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_pilot_write_cutover(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.apply_tenant_pilot_write_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.abort_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.abort_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_pilot_cutovers(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_tenant_pilot_cutovers(UUID) TO authenticated, service_role;

-- Source: 20260619113000_tenant_entity_read_rpc.sql
REVOKE ALL ON FUNCTION public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- Source: 20260619114500_tenant_entity_write_rpc.sql
REVOKE ALL ON FUNCTION public.tenant_insert_row(TEXT, JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.tenant_update_row(TEXT, TEXT, JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_insert_row(TEXT, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.tenant_update_row(TEXT, TEXT, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN) TO authenticated, service_role;

-- Source: 20260619121500_tenant_vendor_statement_lines_rpc.sql
REVOKE ALL ON FUNCTION public.tenant_insert_vendor_statement_lines(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_insert_vendor_statement_lines(UUID, JSONB) TO authenticated, service_role;

-- Source: 20260619122500_tenant_joined_read_rpcs.sql
REVOKE ALL ON FUNCTION public.tenant_select_vendor_statements(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_select_vendor_statements(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tenant_select_webhook_delivery_logs(UUID, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_select_webhook_delivery_logs(UUID, INTEGER) TO authenticated, service_role;

-- Source: 20260620010000_auto_provision_new_tenants_to_schema.sql
REVOKE ALL ON FUNCTION public.auto_provision_new_tenant_schema() FROM PUBLIC, anon, authenticated;

-- Source: 20260622210004_tighten_locations_rls.sql
-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Tenant_Isolation_locations" ON public.locations;

-- Read Access: All members of the organization can read locations
DROP POLICY IF EXISTS "Tenant_Isolation_locations_SELECT" ON public.locations;

CREATE POLICY "Tenant_Isolation_locations_SELECT"
  ON public.locations FOR SELECT
  USING (organization_id = public.get_auth_org());

-- Write Access: Only org_owner or platform_admin can insert
DROP POLICY IF EXISTS "Tenant_Isolation_locations_INSERT" ON public.locations;

CREATE POLICY "Tenant_Isolation_locations_INSERT"
  ON public.locations FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_org() 
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

-- Update Access: Org owners or specific location managers
DROP POLICY IF EXISTS "Tenant_Isolation_locations_UPDATE" ON public.locations;

CREATE POLICY "Tenant_Isolation_locations_UPDATE"
  ON public.locations FOR UPDATE
  USING (
    organization_id = public.get_auth_org()
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

-- Delete Access: Only org_owner or platform_admin
DROP POLICY IF EXISTS "Tenant_Isolation_locations_DELETE" ON public.locations;

CREATE POLICY "Tenant_Isolation_locations_DELETE"
  ON public.locations FOR DELETE
  USING (
    organization_id = public.get_auth_org() 
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

-- Source: 20260622210009_saas_subscriptions.sql
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage all subscriptions" ON public.subscriptions
    FOR ALL USING (public.is_platform_admin());

CREATE POLICY "Users can view their organization's subscription" ON public.subscriptions
    FOR SELECT USING (organization_id = public.get_auth_org());

-- Source: 20260622210010_pos_sync_engine.sql
-- RLS
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pos_orders in their org" ON public.pos_orders
    FOR SELECT USING (organization_id = public.get_auth_org());

CREATE POLICY "Users can view pos_order_items in their org" ON public.pos_order_items
    FOR SELECT USING (order_id IN (SELECT id FROM public.pos_orders WHERE organization_id = public.get_auth_org()));

-- Source: 20260622210011_custom_reports.sql
ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom reports for their org" ON public.custom_reports
    FOR ALL USING (organization_id = public.get_auth_org());

-- Source: 20260622210012_commissary_orders.sql
ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage intercompany transfers" ON public.intercompany_transfers
    FOR ALL USING (organization_id = public.get_auth_org());

-- Source: 20260622210013_iot_sensors.sql
ALTER TABLE public.iot_sensors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage IoT sensors" ON public.iot_sensors
    FOR ALL USING (organization_id = public.get_auth_org());

CREATE POLICY "Users can view temperature logs" ON public.temperature_logs
    FOR ALL USING (sensor_id IN (SELECT id FROM public.iot_sensors WHERE organization_id = public.get_auth_org()));

-- Source: 20260622210014_franchise_royalties.sql
ALTER TABLE public.franchise_agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.royalty_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage franchise agreements" ON public.franchise_agreements
    FOR ALL USING (parent_org_id = public.get_auth_org() OR child_org_id = public.get_auth_org());

CREATE POLICY "Users can view royalty invoices" ON public.royalty_invoices
    FOR ALL USING (agreement_id IN (SELECT id FROM public.franchise_agreements WHERE parent_org_id = public.get_auth_org() OR child_org_id = public.get_auth_org()));

-- Source: 20260622210015_delivery_aggregation.sql
ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage delivery channels" ON public.delivery_channels
    FOR ALL USING (organization_id = public.get_auth_org());

CREATE POLICY "Users can view menu sync logs" ON public.menu_sync_logs
    FOR ALL USING (channel_id IN (SELECT id FROM public.delivery_channels WHERE organization_id = public.get_auth_org()));

-- Source: 20260622210016_labor_shifts_time_clocks.sql
-- RLS Policies
ALTER TABLE public.time_clocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.labor_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read time clocks" ON public.time_clocks FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can insert time clocks" ON public.time_clocks FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can update time clocks" ON public.time_clocks FOR UPDATE USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read shift schedules" ON public.shift_schedules FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org managers can insert shift schedules" ON public.shift_schedules FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'location_manager'));

CREATE POLICY "Org managers can update shift schedules" ON public.shift_schedules FOR UPDATE USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'location_manager'));

CREATE POLICY "Org users can read labor forecasts" ON public.labor_forecasts FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify labor forecasts" ON public.labor_forecasts FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Source: 20260622210017_crm_loyalty_campaigns.sql
-- RLS Policies
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read customers" ON public.customers FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify customers" ON public.customers FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read loyalty" ON public.loyalty_memberships FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify loyalty" ON public.loyalty_memberships FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read campaigns" ON public.marketing_campaigns FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify campaigns" ON public.marketing_campaigns FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Source: 20260622210018_vendor_bidding_logistics.sql
-- RLS Policies
ALTER TABLE public.procurement_bids ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.commissary_routes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.commissary_route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read bids" ON public.procurement_bids FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify bids" ON public.procurement_bids FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read routes" ON public.commissary_routes FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can modify routes" ON public.commissary_routes FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read route stops" ON public.commissary_route_stops FOR SELECT USING (route_id IN (SELECT id FROM public.commissary_routes WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "Org users can modify route stops" ON public.commissary_route_stops FOR ALL USING (route_id IN (SELECT id FROM public.commissary_routes WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Source: 20260622210019_iot_hardware.sql
ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org users can read temp logs" ON public.temperature_logs;

CREATE POLICY "Org users can read temp logs" ON public.temperature_logs FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Org users can modify temp logs" ON public.temperature_logs;

CREATE POLICY "Org users can modify temp logs" ON public.temperature_logs FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Source: 20260622210020_api_keys.sql
ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage api keys" ON public.developer_api_keys FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'platform_admin'));

CREATE POLICY "Org admins can manage webhooks" ON public.webhook_endpoints FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'platform_admin'));

-- Source: 20260622210021_franchise_royalties.sql
ALTER TABLE public.franchise_agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.franchise_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can manage franchise agreements" ON public.franchise_agreements;

CREATE POLICY "Org admins can manage franchise agreements" ON public.franchise_agreements FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner'));

DROP POLICY IF EXISTS "Org admins can view franchise invoices" ON public.franchise_invoices;

CREATE POLICY "Org admins can view franchise invoices" ON public.franchise_invoices FOR SELECT USING (agreement_id IN (SELECT id FROM public.franchise_agreements WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

-- Source: 20260622210022_telemetry.sql
ALTER TABLE public.web_vitals_telemetry ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert telemetry (insert only, no read/update/delete)
CREATE POLICY "Users can insert telemetry" ON public.web_vitals_telemetry FOR INSERT WITH CHECK (true);

-- Platform admins can read all telemetry
CREATE POLICY "Platform admins can read telemetry" ON public.web_vitals_telemetry FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin');

-- Source: 20260622210023_pos_integration.sql
ALTER TABLE public.pos_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can manage pos_configurations" ON public.pos_configurations
    FOR ALL
    USING (organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role IN ('org_owner', 'admin', 'manager')
    ));

-- Source: 20260623000000_create_invoices_storage_bucket.sql
-- 2. (Skipped: RLS is enabled by default in Supabase storage)

-- 3. Policy: Public Access to View Invoices
-- (Since the bucket is public, we allow anyone to read the objects)
DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;

CREATE POLICY "Public Access to View Invoices"
ON storage.objects FOR SELECT
USING ( bucket_id = 'invoices' );

-- 4. Policy: Authenticated Users can Upload Invoices
DROP POLICY IF EXISTS "Authenticated Users can Upload Invoices" ON storage.objects;

CREATE POLICY "Authenticated Users can Upload Invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'invoices' );

-- 5. Policy: Authenticated Users can Delete Invoices
DROP POLICY IF EXISTS "Authenticated Users can Delete Invoices" ON storage.objects;

CREATE POLICY "Authenticated Users can Delete Invoices"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'invoices' );

-- Source: 20260624000000_invoice_schema_upgrade.sql
ALTER TABLE tenant_template.archived_invoices ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE tenant_template.archived_invoices TO service_role;

-- Source: 20260624000001_secure_invoices_bucket.sql
-- Enable RLS on storage.objects if not already enabled (skipped as it is owned by supabase_storage_admin)

-- Drop existing policies on invoices bucket if any
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;

-- Create secure policies
-- 1. Upload policy: Only authenticated users can upload
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoices');

-- 2. View policy: Only authenticated users can view/download
CREATE POLICY "Authenticated users can view invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'invoices');

-- 3. Delete policy: Only authenticated users can delete
CREATE POLICY "Authenticated users can delete invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoices');

-- Source: 20260624000003_strict_storage_rls.sql
-- Remove the old policy we created previously
DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;

-- Create strict policies

-- 1. Read Policy: Users can only read files within their organization's folder
CREATE POLICY "invoices_bucket_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 2. Insert Policy: Users can only upload files into their organization's folder
CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 3. Delete Policy: Users can only delete files within their organization's folder
CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 4. Edge Function Internal Access: Allow service role to do anything
CREATE POLICY "invoices_bucket_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

-- Source: 20260624000007_vendor_ap_routing.sql
REVOKE ALL ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

-- Source: 20260624000008_performance_indexes_rls.sql
-- 2. Optimize RLS Policies by replacing auth.uid() with (select auth.uid()) 
-- This prevents the 'auth_rls_initplan' subquery from executing multiple times per row.

-- Notifications table
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE
  USING (user_id = (select auth.uid()));

-- Vendors table
-- Typically, vendor access depends on organization_id tied to the user, but some basic policies use auth.uid()
-- To be safe, we'll replace typical user-bound RLS on vendors if applicable. Assuming there's a policy checking created_by or updated_by.
DROP POLICY IF EXISTS "Users can view vendors in their organization" ON vendors;

CREATE POLICY "Users can view vendors in their organization" ON vendors
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update vendors in their organization" ON vendors;

CREATE POLICY "Users can update vendors in their organization" ON vendors
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles WHERE user_id = (select auth.uid())
    )
  );

-- Source: 20260624000016_freeze_schema_per_tenant_default.sql
REVOKE ALL ON FUNCTION public.auto_register_new_tenant_shared_public() FROM PUBLIC, anon, authenticated;

-- Source: 20260624000017_shared_public_access_scope_hardening.sql
-- 5. RLS policies use explicit organization scope.
DROP POLICY IF EXISTS "Users can view own brand_members" ON public.brand_members;

DROP POLICY IF EXISTS "brand_members_org_read" ON public.brand_members;

CREATE POLICY "brand_members_org_read"
ON public.brand_members
FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "brand_members_org_manage" ON public.brand_members;

CREATE POLICY "brand_members_org_manage"
ON public.brand_members
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
);

DROP POLICY IF EXISTS "Users can view own location_members" ON public.location_members;

DROP POLICY IF EXISTS "location_members_org_read" ON public.location_members;

CREATE POLICY "location_members_org_read"
ON public.location_members
FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "location_members_org_manage" ON public.location_members;

CREATE POLICY "location_members_org_manage"
ON public.location_members
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
);

DROP POLICY IF EXISTS "View instances" ON public.approval_instances;

DROP POLICY IF EXISTS "Manage instances" ON public.approval_instances;

DROP POLICY IF EXISTS "approval_instances_org_read" ON public.approval_instances;

CREATE POLICY "approval_instances_org_read"
ON public.approval_instances
FOR SELECT
USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "approval_instances_org_manage" ON public.approval_instances;

CREATE POLICY "approval_instances_org_manage"
ON public.approval_instances
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.is_manager_or_above()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.is_manager_or_above()
  )
);

DROP POLICY IF EXISTS "View steps" ON public.approval_steps;

DROP POLICY IF EXISTS "Manage steps" ON public.approval_steps;

DROP POLICY IF EXISTS "approval_steps_org_read" ON public.approval_steps;

CREATE POLICY "approval_steps_org_read"
ON public.approval_steps
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.approval_instances ai
    WHERE ai.id = approval_steps.instance_id
      AND ai.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "approval_steps_org_manage" ON public.approval_steps;

CREATE POLICY "approval_steps_org_manage"
ON public.approval_steps
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
);

-- 6. Permissions are global reference data, not tenant-owned data.
DROP POLICY IF EXISTS "Users can view permissions" ON public.permissions;

DROP POLICY IF EXISTS "permissions_authenticated_read" ON public.permissions;

CREATE POLICY "permissions_authenticated_read"
ON public.permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "permissions_platform_admin_manage" ON public.permissions;

CREATE POLICY "permissions_platform_admin_manage"
ON public.permissions
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- Source: 20260625000001_tenant_backmigration_audit_rpc.sql
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM anon;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.audit_tenant_schema_backmigration() TO service_role;

-- Source: 20260625000002_backfill_tenant_schema_missing_rows.sql
REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM anon;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) TO service_role;

-- Source: 20260625000003_finalize_tenant_backmigration_reconciliation.sql
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM anon;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.audit_tenant_schema_backmigration() TO service_role;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM anon;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN) TO service_role;

-- Source: 20260625000004_retire_schema_tenant_rpc_surface.sql
REVOKE ALL ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

-- Source: 20260625000005_archive_and_drop_legacy_tenant_schemas.sql
ALTER TABLE public.tenant_schema_retirement_archive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_schema_retirement_archive FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.tenant_schema_retirement_archive TO service_role;

-- Source: 20260625000015_cleanup_legacy_schema_tenant_artifacts.sql
REVOKE ALL ON FUNCTION public.auto_register_new_tenant_shared_public() FROM PUBLIC, anon, authenticated;

-- Source: 20260625000017_architecture_inspection_rpc.sql
REVOKE ALL ON FUNCTION public.inspect_database_architecture() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.inspect_database_architecture() TO service_role;

-- Source: 20260625000018_shared_tenancy_rls_financial_hardening.sql
ALTER TABLE public.data_ownership_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_ownership_catalog_platform_admin_all ON public.data_ownership_catalog;

CREATE POLICY data_ownership_catalog_platform_admin_all
ON public.data_ownership_catalog
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

REVOKE ALL ON TABLE public.data_ownership_catalog FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.data_ownership_catalog TO authenticated;

GRANT ALL ON TABLE public.data_ownership_catalog TO service_role;

ALTER TABLE IF EXISTS public.invoice_event_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.invoice_processing_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.invoice_sync_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.debug_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_event_log_org_select ON public.invoice_event_log;

CREATE POLICY invoice_event_log_org_select
ON public.invoice_event_log
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_event_log.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS invoice_processing_jobs_org_select ON public.invoice_processing_jobs;

CREATE POLICY invoice_processing_jobs_org_select
ON public.invoice_processing_jobs
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_processing_jobs.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS invoice_sync_log_org_select ON public.invoice_sync_log;

CREATE POLICY invoice_sync_log_org_select
ON public.invoice_sync_log
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_sync_log.invoice_id
      AND i.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS audit_logs_authenticated_insert ON public.audit_logs;

CREATE POLICY audit_logs_same_org_insert
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS tenant_mirror_tables_authenticated_read ON public.tenant_mirror_tables;

REVOKE ALL ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) TO service_role;

-- Source: 20260625000021_financial_workflow_rpc_migration.sql
REVOKE ALL ON FUNCTION public.assert_org_actor(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_org_actor(UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.save_invoice_workflow(UUID, JSONB, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.soft_delete_invoice_workflow(UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_invoice_allocation_splits(UUID, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_payment_account_workflow(JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.deactivate_payment_account_workflow(UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.request_invoice_credit_workflow(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260625000022_ledger_bill_payment_rpc_cleanup.sql
GRANT EXECUTE ON FUNCTION public.ensure_ledger_bill_workflow(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.confirm_payment_workflow(UUID) TO authenticated, service_role;

-- Source: 20260625000023_scoped_audit_logging_rpc.sql
REVOKE ALL ON FUNCTION public.log_audit_event(JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.log_audit_events(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.log_audit_event(JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.log_audit_events(JSONB) TO authenticated, service_role;

-- Source: 20260625000025_fix_ad_hoc_vendor_payment_source_fk.sql
GRANT EXECUTE ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260625000026_fix_ad_hoc_vendor_payment_ledger_reference_type.sql
GRANT EXECUTE ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260625000028_global_vendor_item_trust_hardening.sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public.global_vendor_items FROM anon, authenticated;

GRANT SELECT ON TABLE public.global_vendor_items TO authenticated;

GRANT ALL ON TABLE public.global_vendor_items TO service_role;

DROP POLICY IF EXISTS global_vendor_items_authenticated_write ON public.global_vendor_items;

DROP POLICY IF EXISTS "Authenticated users can write global items" ON public.global_vendor_items;

DROP POLICY IF EXISTS "Platform admins can manage global items" ON public.global_vendor_items;

REVOKE ALL ON FUNCTION public.normalize_global_vendor_category(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_global_vendor_category(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_trusted_global_vendor_item_suggestions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_trusted_global_vendor_item_suggestions() TO authenticated, service_role;

-- Source: 20260626000001_onboarding_hierarchy_rpc.sql
REVOKE EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) TO authenticated, service_role;

-- Source: 20260626000002_business_verification_onboarding.sql
ALTER TABLE public.business_verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_verifications_self_select" ON public.business_verifications;

CREATE POLICY "business_verifications_self_select"
  ON public.business_verifications FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "business_verifications_self_insert" ON public.business_verifications;

CREATE POLICY "business_verifications_self_insert"
  ON public.business_verifications FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "business_verifications_admin_update" ON public.business_verifications;

CREATE POLICY "business_verifications_admin_update"
  ON public.business_verifications FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "organization_addresses_self_select" ON public.organization_addresses;

CREATE POLICY "organization_addresses_self_select"
  ON public.organization_addresses FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() IN ('platform_admin', 'org_owner'));

DROP POLICY IF EXISTS "organization_addresses_self_insert" ON public.organization_addresses;

CREATE POLICY "organization_addresses_self_insert"
  ON public.organization_addresses FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "organization_addresses_owner_update" ON public.organization_addresses;

CREATE POLICY "organization_addresses_owner_update"
  ON public.organization_addresses FOR UPDATE
  USING (user_id = auth.uid() OR public.get_auth_role() IN ('platform_admin', 'org_owner'));

-- Source: 20260626000003_production_onboarding_workflow.sql
ALTER TABLE public.onboarding_workflow_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_step_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_payment_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_coupons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_select" ON public.onboarding_workflow_runs;

CREATE POLICY "onboarding_workflow_runs_self_select"
  ON public.onboarding_workflow_runs FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_insert" ON public.onboarding_workflow_runs;

CREATE POLICY "onboarding_workflow_runs_self_insert"
  ON public.onboarding_workflow_runs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_update" ON public.onboarding_workflow_runs;

CREATE POLICY "onboarding_workflow_runs_self_update"
  ON public.onboarding_workflow_runs FOR UPDATE
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin')
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_step_events_self_select" ON public.onboarding_step_events;

CREATE POLICY "onboarding_step_events_self_select"
  ON public.onboarding_step_events FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_payment_methods_self_select" ON public.onboarding_payment_methods;

CREATE POLICY "onboarding_payment_methods_self_select"
  ON public.onboarding_payment_methods FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_payment_methods_self_insert" ON public.onboarding_payment_methods;

CREATE POLICY "onboarding_payment_methods_self_insert"
  ON public.onboarding_payment_methods FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupons_public_read_active" ON public.onboarding_coupons;

CREATE POLICY "onboarding_coupons_public_read_active"
  ON public.onboarding_coupons FOR SELECT
  USING (active = true OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupons_admin_all" ON public.onboarding_coupons;

CREATE POLICY "onboarding_coupons_admin_all"
  ON public.onboarding_coupons FOR ALL
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupon_redemptions_self_select" ON public.onboarding_coupon_redemptions;

CREATE POLICY "onboarding_coupon_redemptions_self_select"
  ON public.onboarding_coupon_redemptions FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

REVOKE EXECUTE ON FUNCTION public.get_or_create_onboarding_run(UUID) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.record_onboarding_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.submit_business_verification(JSONB) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_state() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_run(UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state() TO authenticated, service_role;

-- Source: 20260626000004_harden_onboarding_hierarchy_completion.sql
REVOKE EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(UUID, JSONB) TO authenticated, service_role;

-- Source: 20260626000005_onboarding_contact_otp.sql
ALTER TABLE public.onboarding_contact_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_contact_otps_self_select" ON public.onboarding_contact_otps;

CREATE POLICY "onboarding_contact_otps_self_select"
  ON public.onboarding_contact_otps FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_contact_otps_self_insert" ON public.onboarding_contact_otps;

CREATE POLICY "onboarding_contact_otps_self_insert"
  ON public.onboarding_contact_otps FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_contact_otps_admin_update" ON public.onboarding_contact_otps;

CREATE POLICY "onboarding_contact_otps_admin_update"
  ON public.onboarding_contact_otps FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin');

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.ensure_onboarding_contact_verified(TEXT, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_onboarding_contact_verified(TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260626000006_enforce_tax_identifier_by_tenant_type.sql
REVOKE EXECUTE ON FUNCTION public.required_tax_identifier_type_for_business_type(TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.required_tax_identifier_type_for_business_type(TEXT) TO authenticated, service_role;

-- Source: 20260626000007_start_invoice_extraction_workflow.sql
GRANT EXECUTE ON FUNCTION public.start_invoice_extraction_workflow(UUID) TO authenticated, service_role;

-- Source: 20260627000001_parent_scoped_child_rls_hardening.sql
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scheduled_payment_invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_statement_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Approval workflow child rows inherit organization scope from approval_instances.
DROP POLICY IF EXISTS "View steps" ON public.approval_steps;

DROP POLICY IF EXISTS "Manage steps" ON public.approval_steps;

DROP POLICY IF EXISTS "approval_steps_org_read" ON public.approval_steps;

CREATE POLICY "approval_steps_org_read"
ON public.approval_steps
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.approval_instances ai
    WHERE ai.id = approval_steps.instance_id
      AND ai.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "approval_steps_org_manage" ON public.approval_steps;

CREATE POLICY "approval_steps_org_manage"
ON public.approval_steps
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
);

-- Purchase order items inherit organization scope from purchase_orders.
-- Optional product_id must also belong to the same organization as the parent PO.
DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;

CREATE POLICY "Users can view purchase order items"
ON public.purchase_order_items
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND po.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;

CREATE POLICY "Manager+ can manage purchase order items"
ON public.purchase_order_items
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND po.organization_id = public.get_my_org()
        AND (
          purchase_order_items.product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.id = purchase_order_items.product_id
              AND p.organization_id = po.organization_id
          )
        )
    )
  )
);

-- Receiving items inherit organization scope from receivings.
-- Optional product and purchase-order-item references must remain in the parent org.
DROP POLICY IF EXISTS "Users can view receiving items" ON public.receiving_items;

CREATE POLICY "Users can view receiving items"
ON public.receiving_items
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.receivings r
    WHERE r.id = receiving_items.receiving_id
      AND r.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manager+ can manage receiving items" ON public.receiving_items;

CREATE POLICY "Manager+ can manage receiving items"
ON public.receiving_items
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND r.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND r.organization_id = public.get_my_org()
        AND (
          receiving_items.product_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.products p
            WHERE p.id = receiving_items.product_id
              AND p.organization_id = r.organization_id
          )
        )
        AND (
          receiving_items.purchase_order_item_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE poi.id = receiving_items.purchase_order_item_id
              AND po.organization_id = r.organization_id
          )
        )
    )
  )
);

-- Scheduled payment invoice links must keep scheduled payment and invoice in one org.
DROP POLICY IF EXISTS "View scheduled payment invoices" ON public.scheduled_payment_invoices;

CREATE POLICY "View scheduled payment invoices"
ON public.scheduled_payment_invoices
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manage scheduled payment invoices" ON public.scheduled_payment_invoices;

CREATE POLICY "Manage scheduled payment invoices"
ON public.scheduled_payment_invoices
FOR ALL
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.scheduled_payments sp
    JOIN public.invoices i ON i.id = scheduled_payment_invoices.invoice_id
    WHERE sp.id = scheduled_payment_invoices.scheduled_payment_id
      AND sp.organization_id = public.get_my_org()
      AND i.organization_id = sp.organization_id
  )
);

-- Vendor statement lines inherit organization scope from vendor_statements.
-- Matched invoice, when present, must belong to the same organization.
DROP POLICY IF EXISTS "View vendor statement lines" ON public.vendor_statement_lines;

CREATE POLICY "View vendor statement lines"
ON public.vendor_statement_lines
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manage vendor statement lines" ON public.vendor_statement_lines;

CREATE POLICY "Manage vendor statement lines"
ON public.vendor_statement_lines
FOR ALL
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.vendor_statements vs
    WHERE vs.id = vendor_statement_lines.statement_id
      AND vs.organization_id = public.get_my_org()
      AND (
        vendor_statement_lines.matched_invoice_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.invoices i
          WHERE i.id = vendor_statement_lines.matched_invoice_id
            AND i.organization_id = vs.organization_id
        )
      )
  )
);

-- Webhook delivery logs inherit tenant scope from webhook_endpoints.
-- Writes remain server/service-role only; authenticated users get read access only.
DROP POLICY IF EXISTS "Users can view webhook delivery logs" ON public.webhook_delivery_logs;

CREATE POLICY "Users can view webhook delivery logs"
ON public.webhook_delivery_logs
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.webhook_endpoints we
    WHERE we.id = webhook_delivery_logs.endpoint_id
      AND we.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "Manage webhook delivery logs" ON public.webhook_delivery_logs;

-- Source: 20260628000001_consolidate_org_resolver_and_force_rls.sql
-- Existing and new RLS policies call the canonical resolver directly.
GRANT EXECUTE ON FUNCTION public.get_my_org() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO anon, authenticated, service_role;

-- Step 2: replace literal-true insert policies with tenant-scoped checks.
-- Service-role Edge Function clients use BYPASSRLS, so no explicit service-role policy branch is needed.
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Users can insert telemetry" ON public.web_vitals_telemetry;

CREATE POLICY "Users can insert telemetry"
ON public.web_vitals_telemetry
FOR INSERT
WITH CHECK (organization_id = public.get_my_org());

-- Step 3: force RLS on every public shared-tenant table with an organization_id column.
ALTER TABLE public.accounting_export_queue FORCE ROW LEVEL SECURITY;

ALTER TABLE public.accounting_sync_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ai_insights FORCE ROW LEVEL SECURITY;

ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.approval_instances FORCE ROW LEVEL SECURITY;

ALTER TABLE public.approval_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.archived_brands FORCE ROW LEVEL SECURITY;

ALTER TABLE public.archived_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.archived_locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.archived_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs_default FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs_y2025 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs_y2026 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.auto_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.brand_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.brands FORCE ROW LEVEL SECURITY;

ALTER TABLE public.budget_targets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.budgets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.business_verifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.closed_periods FORCE ROW LEVEL SECURITY;

ALTER TABLE public.commissary_routes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.count_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.count_sheets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.credit_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE public.custom_reports FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_action_status FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_escalation_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_handoff_notes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_report_deliveries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_report_preferences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dashboard_review_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_channels FORCE ROW LEVEL SECURITY;

ALTER TABLE public.developer_api_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dim_product FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dim_user FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dim_vendor FORCE ROW LEVEL SECURITY;

ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.edi_transmissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.employee_shifts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;

ALTER TABLE public.event_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fact_inventory FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fact_invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fact_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fact_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fact_wastage FORCE ROW LEVEL SECURITY;

ALTER TABLE public.franchise_agreements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.general_ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gl_mappings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.integrations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.intercompany_transfers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_audit_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_ingestion_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_line_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_line_matches FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.iot_sensors FORCE ROW LEVEL SECURITY;

ALTER TABLE public.labor_forecasts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_bills FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.location_groups FORCE ROW LEVEL SECURITY;

ALTER TABLE public.location_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_campaigns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_coupon_redemptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_payment_methods FORCE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_progress FORCE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_step_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_workflow_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.operational_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organization_addresses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pos_configurations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pos_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pos_menu_mapping FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pos_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pos_sales_data FORCE ROW LEVEL SECURITY;

ALTER TABLE public.processing_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.procurement_bids FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.receivings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_ingredients FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.reconciliation_variances FORCE ROW LEVEL SECURITY;

ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.scheduled_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.shift_schedules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.smart_prep_plans FORCE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.temperature_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_registry FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_schema_retirement_archive FORCE ROW LEVEL SECURITY;

ALTER TABLE public.time_clocks FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tolerance_configurations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transfers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_aliases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_issues FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_item_mappings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_item_prices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_statements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendors FORCE ROW LEVEL SECURITY;

ALTER TABLE public.wastage_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.web_vitals_telemetry FORCE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_endpoints FORCE ROW LEVEL SECURITY;

ALTER TABLE public.webhook_events_queue FORCE ROW LEVEL SECURITY;

-- Source: 20260628000003_harden_context_plumbing.sql
-- Step 2: Replace current org-wide brands/locations policies with hierarchical
-- policies based on the canonical accessible brand/location helpers.
DROP POLICY IF EXISTS "Owners can create brands for their organizations" ON public.brands;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_brands" ON public.brands;

DROP POLICY IF EXISTS "Tenant Isolation Brands" ON public.brands;

DROP POLICY IF EXISTS "Owners can create locations for their organizations" ON public.locations;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_locations" ON public.locations;

DROP POLICY IF EXISTS "Tenant Isolation Locations" ON public.locations;

DROP POLICY IF EXISTS "Tenant_Isolation_locations_DELETE" ON public.locations;

DROP POLICY IF EXISTS "Tenant_Isolation_locations_INSERT" ON public.locations;

DROP POLICY IF EXISTS "Tenant_Isolation_locations_SELECT" ON public.locations;

DROP POLICY IF EXISTS "Tenant_Isolation_locations_UPDATE" ON public.locations;

DROP POLICY IF EXISTS "brands_hierarchical_select" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_insert" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_update" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_delete" ON public.brands;

DROP POLICY IF EXISTS "locations_hierarchical_select" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_insert" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_update" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_delete" ON public.locations;

CREATE POLICY "brands_hierarchical_select"
ON public.brands
FOR SELECT
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND (
            public.get_auth_role() = 'org_owner'
            OR brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
        )
    )
);

CREATE POLICY "brands_hierarchical_insert"
ON public.brands
FOR INSERT
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() = 'org_owner'
    )
);

CREATE POLICY "brands_hierarchical_update"
ON public.brands
FOR UPDATE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
)
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "brands_hierarchical_delete"
ON public.brands
FOR DELETE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_select"
ON public.locations
FOR SELECT
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND (
            public.get_auth_role() = 'org_owner'
            OR id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
    )
);

CREATE POLICY "locations_hierarchical_insert"
ON public.locations
FOR INSERT
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_update"
ON public.locations
FOR UPDATE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
    )
)
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_delete"
ON public.locations
FOR DELETE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
    )
);

-- Step 3: Normalize grants so authenticated can read context sources and call
-- the hardened switch RPC, while anon/authenticated cannot use unsafe table privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.brands, public.locations FROM anon, authenticated;

GRANT SELECT ON public.brands, public.locations TO authenticated;

REVOKE ALL ON FUNCTION public.switch_user_context(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.switch_user_context(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated;

-- Source: 20260628000005_secure_approval_primitives.sql
REVOKE EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) FROM anon;

REVOKE EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) FROM anon;

REVOKE EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) TO authenticated, service_role;

-- Source: 20260628000006_hierarchical_rls_batch1_financial.sql
REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.invoices,
  public.payments,
  public.invoice_allocations,
  public.credit_requests,
  public.invoice_line_items,
  public.invoice_documents,
  public.reconciliation_variances,
  public.invoice_audit_events,
  public.ledger_bills,
  public.invoice_line_matches,
  public.ledger_payments,
  public.ledger_entries
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON
  public.invoices,
  public.payments,
  public.invoice_allocations,
  public.credit_requests,
  public.invoice_line_items,
  public.invoice_documents,
  public.reconciliation_variances,
  public.ledger_bills,
  public.invoice_line_matches,
  public.ledger_payments
TO authenticated;

GRANT SELECT, INSERT ON
  public.invoice_audit_events,
  public.ledger_entries
TO authenticated;

CREATE POLICY "financial_invoices_select"
ON public.invoices
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, deleted_at)
);

CREATE POLICY "financial_invoices_insert"
ON public.invoices
FOR INSERT
WITH CHECK (
  organization_id = public.get_auth_org()
  AND created_by = auth.uid()
  AND public.financial_scope_writable(organization_id, brand_id, location_id, NULL, true)
);

CREATE POLICY "financial_invoices_update"
ON public.invoices
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_payments_select"
ON public.payments
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, deleted_at)
);

CREATE POLICY "financial_payments_insert"
ON public.payments
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_payments_update"
ON public.payments
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
);

CREATE POLICY "financial_invoice_allocations_select"
ON public.invoice_allocations
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, location_id, NULL)
);

CREATE POLICY "financial_invoice_allocations_insert"
ON public.invoice_allocations
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_invoice_allocations_update"
ON public.invoice_allocations
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_credit_requests_select"
ON public.credit_requests
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, location_id, NULL)
);

CREATE POLICY "financial_credit_requests_insert"
ON public.credit_requests
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, true)
);

CREATE POLICY "financial_credit_requests_update"
ON public.credit_requests
FOR UPDATE
USING (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
)
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, location_id, NULL, false)
);

CREATE POLICY "financial_invoice_line_items_select"
ON public.invoice_line_items
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_items_insert"
ON public.invoice_line_items
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_items_update"
ON public.invoice_line_items
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_select"
ON public.invoice_documents
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_insert"
ON public.invoice_documents
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_documents_update"
ON public.invoice_documents
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_select"
ON public.reconciliation_variances
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_insert"
ON public.reconciliation_variances
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_reconciliation_variances_update"
ON public.reconciliation_variances
FOR UPDATE
USING (
  public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_audit_events_select"
ON public.invoice_audit_events
FOR SELECT
USING (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_audit_events_insert"
ON public.invoice_audit_events
FOR INSERT
WITH CHECK (
  public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_select"
ON public.ledger_bills
FOR SELECT
USING (
  deleted_at IS NULL
  AND public.invoice_child_visible(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_insert"
ON public.ledger_bills
FOR INSERT
WITH CHECK (
  public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_ledger_bills_update"
ON public.ledger_bills
FOR UPDATE
USING (
  deleted_at IS NULL
  AND public.invoice_child_writable(organization_id, invoice_id)
)
WITH CHECK (
  deleted_at IS NULL
  AND public.invoice_child_writable(organization_id, invoice_id)
);

CREATE POLICY "financial_invoice_line_matches_select"
ON public.invoice_line_matches
FOR SELECT
USING (
  public.invoice_line_match_visible(invoice_line_id)
);

CREATE POLICY "financial_invoice_line_matches_insert"
ON public.invoice_line_matches
FOR INSERT
WITH CHECK (
  public.invoice_line_match_writable(invoice_line_id)
);

CREATE POLICY "financial_invoice_line_matches_update"
ON public.invoice_line_matches
FOR UPDATE
USING (
  public.invoice_line_match_writable(invoice_line_id)
)
WITH CHECK (
  public.invoice_line_match_writable(invoice_line_id)
);

CREATE POLICY "financial_ledger_payments_select"
ON public.ledger_payments
FOR SELECT
USING (
  deleted_at IS NULL
  AND public.ledger_payment_visible(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_payments_insert"
ON public.ledger_payments
FOR INSERT
WITH CHECK (
  public.ledger_payment_writable(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_payments_update"
ON public.ledger_payments
FOR UPDATE
USING (
  deleted_at IS NULL
  AND public.ledger_payment_writable(organization_id, bill_id)
)
WITH CHECK (
  deleted_at IS NULL
  AND public.ledger_payment_writable(organization_id, bill_id)
);

CREATE POLICY "financial_ledger_entries_select"
ON public.ledger_entries
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, NULL, NULL, NULL)
);

CREATE POLICY "financial_ledger_entries_insert"
ON public.ledger_entries
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, NULL, NULL, NULL, false)
);

-- Source: 20260628000007_hierarchical_rls_batch2_operational.sql
-- Step A continued: update Batch 1 policies to tenant_scope_* names.
DROP POLICY IF EXISTS financial_invoices_select ON public.invoices;

DROP POLICY IF EXISTS financial_invoices_insert ON public.invoices;

DROP POLICY IF EXISTS financial_invoices_update ON public.invoices;

DROP POLICY IF EXISTS financial_payments_select ON public.payments;

DROP POLICY IF EXISTS financial_payments_insert ON public.payments;

DROP POLICY IF EXISTS financial_payments_update ON public.payments;

DROP POLICY IF EXISTS financial_invoice_allocations_select ON public.invoice_allocations;

DROP POLICY IF EXISTS financial_invoice_allocations_insert ON public.invoice_allocations;

DROP POLICY IF EXISTS financial_invoice_allocations_update ON public.invoice_allocations;

DROP POLICY IF EXISTS financial_credit_requests_select ON public.credit_requests;

DROP POLICY IF EXISTS financial_credit_requests_insert ON public.credit_requests;

DROP POLICY IF EXISTS financial_credit_requests_update ON public.credit_requests;

DROP POLICY IF EXISTS financial_ledger_entries_select ON public.ledger_entries;

DROP POLICY IF EXISTS financial_ledger_entries_insert ON public.ledger_entries;

CREATE POLICY financial_invoices_select ON public.invoices
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY financial_invoices_insert ON public.invoices
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_org()
    AND created_by = auth.uid()
    AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true)
  );

CREATE POLICY financial_invoices_update ON public.invoices
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_payments_select ON public.payments
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY financial_payments_insert ON public.payments
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_payments_update ON public.payments
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false));

CREATE POLICY financial_invoice_allocations_select ON public.invoice_allocations
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY financial_invoice_allocations_insert ON public.invoice_allocations
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_invoice_allocations_update ON public.invoice_allocations
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_credit_requests_select ON public.credit_requests
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY financial_credit_requests_insert ON public.credit_requests
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY financial_credit_requests_update ON public.credit_requests
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY financial_ledger_entries_select ON public.ledger_entries
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, NULL, NULL));

CREATE POLICY financial_ledger_entries_insert ON public.ledger_entries
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, NULL, NULL, false));

-- Step C: replace stale operational policies.
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_auto_orders" ON public.auto_orders;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_auto_orders ON public.auto_orders;

DROP POLICY IF EXISTS operational_auto_orders_select ON public.auto_orders;

DROP POLICY IF EXISTS operational_auto_orders_insert ON public.auto_orders;

DROP POLICY IF EXISTS operational_auto_orders_update ON public.auto_orders;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_inventory" ON public.inventory;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_inventory ON public.inventory;

DROP POLICY IF EXISTS "Users can view inventory" ON public.inventory;

DROP POLICY IF EXISTS operational_inventory_select ON public.inventory;

DROP POLICY IF EXISTS operational_inventory_insert ON public.inventory;

DROP POLICY IF EXISTS operational_inventory_update ON public.inventory;

DROP POLICY IF EXISTS "Manager+ can manage inventory movements" ON public.inventory_movements;

DROP POLICY IF EXISTS "Users can view inventory movements" ON public.inventory_movements;

DROP POLICY IF EXISTS operational_inventory_movements_select ON public.inventory_movements;

DROP POLICY IF EXISTS operational_inventory_movements_insert ON public.inventory_movements;

DROP POLICY IF EXISTS operational_inventory_movements_update ON public.inventory_movements;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_products" ON public.products;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_products ON public.products;

DROP POLICY IF EXISTS "Users can view products" ON public.products;

DROP POLICY IF EXISTS operational_products_select ON public.products;

DROP POLICY IF EXISTS operational_products_insert ON public.products;

DROP POLICY IF EXISTS operational_products_update ON public.products;

DROP POLICY IF EXISTS "Manager+ can manage purchase orders" ON public.purchase_orders;

DROP POLICY IF EXISTS "Users can view purchase orders" ON public.purchase_orders;

DROP POLICY IF EXISTS operational_purchase_orders_select ON public.purchase_orders;

DROP POLICY IF EXISTS operational_purchase_orders_insert ON public.purchase_orders;

DROP POLICY IF EXISTS operational_purchase_orders_update ON public.purchase_orders;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_recipes" ON public.recipes;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_recipes ON public.recipes;

DROP POLICY IF EXISTS "Users can view recipes" ON public.recipes;

DROP POLICY IF EXISTS operational_recipes_select ON public.recipes;

DROP POLICY IF EXISTS operational_recipes_insert ON public.recipes;

DROP POLICY IF EXISTS operational_recipes_update ON public.recipes;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_vendors" ON public.vendors;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_vendors ON public.vendors;

DROP POLICY IF EXISTS "Users can view vendors in their organization" ON public.vendors;

DROP POLICY IF EXISTS "Users can update vendors in their organization" ON public.vendors;

DROP POLICY IF EXISTS operational_vendors_select ON public.vendors;

DROP POLICY IF EXISTS operational_vendors_insert ON public.vendors;

DROP POLICY IF EXISTS operational_vendors_update ON public.vendors;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_wastage_logs" ON public.wastage_logs;

DROP POLICY IF EXISTS RLS_SaaS_Isolation_wastage_logs ON public.wastage_logs;

DROP POLICY IF EXISTS operational_wastage_logs_select ON public.wastage_logs;

DROP POLICY IF EXISTS operational_wastage_logs_insert ON public.wastage_logs;

DROP POLICY IF EXISTS operational_wastage_logs_update ON public.wastage_logs;

CREATE POLICY operational_vendors_select ON public.vendors
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_vendors_insert ON public.vendors
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_vendors_update ON public.vendors
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_products_select ON public.products
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_products_insert ON public.products
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_products_update ON public.products
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_recipes_select ON public.recipes
  FOR SELECT
  USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_recipes_insert ON public.recipes
  FOR INSERT
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY operational_recipes_update ON public.recipes
  FOR UPDATE
  USING (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_inventory_select ON public.inventory
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_inventory_insert ON public.inventory
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_inventory_update ON public.inventory
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true));

CREATE POLICY operational_wastage_logs_select ON public.wastage_logs
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_wastage_logs_insert ON public.wastage_logs
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_wastage_logs_update ON public.wastage_logs
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY operational_auto_orders_select ON public.auto_orders
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY operational_auto_orders_insert ON public.auto_orders
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false));

CREATE POLICY operational_auto_orders_update ON public.auto_orders
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false));

CREATE POLICY operational_purchase_orders_select ON public.purchase_orders
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY operational_purchase_orders_insert ON public.purchase_orders
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_purchase_orders_update ON public.purchase_orders
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_inventory_movements_select ON public.inventory_movements
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY operational_inventory_movements_insert ON public.inventory_movements
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY operational_inventory_movements_update ON public.inventory_movements
  FOR UPDATE
  USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

REVOKE ALL PRIVILEGES ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.vendors,
  public.products,
  public.recipes,
  public.inventory,
  public.wastage_logs,
  public.auto_orders,
  public.purchase_orders,
  public.inventory_movements
TO service_role;

-- Source: 20260628000008_hierarchical_rls_batch3a_safe_tables.sql
-- Location-scoped direct tables.
CREATE POLICY batch3a_time_clocks_select ON public.time_clocks
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_time_clocks_insert ON public.time_clocks
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_time_clocks_update ON public.time_clocks
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_shift_schedules_select ON public.shift_schedules
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_shift_schedules_insert ON public.shift_schedules
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_shift_schedules_update ON public.shift_schedules
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_employee_shifts_select ON public.employee_shifts
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_employee_shifts_insert ON public.employee_shifts
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_employee_shifts_update ON public.employee_shifts
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_count_sheets_select ON public.count_sheets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_count_sheets_insert ON public.count_sheets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_count_sheets_update ON public.count_sheets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_pos_orders_select ON public.pos_orders
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_pos_orders_insert ON public.pos_orders
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_pos_orders_update ON public.pos_orders
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_pos_sales_data_select ON public.pos_sales_data
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_pos_sales_data_insert ON public.pos_sales_data
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_pos_sales_data_update ON public.pos_sales_data
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, true));

CREATE POLICY batch3a_delivery_channels_select ON public.delivery_channels
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_delivery_channels_insert ON public.delivery_channels
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_delivery_channels_update ON public.delivery_channels
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_labor_forecasts_select ON public.labor_forecasts
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_labor_forecasts_insert ON public.labor_forecasts
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_labor_forecasts_update ON public.labor_forecasts
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_iot_sensors_select ON public.iot_sensors
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_iot_sensors_insert ON public.iot_sensors
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_iot_sensors_update ON public.iot_sensors
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_budgets_select ON public.budgets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_budgets_insert ON public.budgets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

CREATE POLICY batch3a_budgets_update ON public.budgets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false))
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

-- Reference direct / parent-derived tables.
CREATE POLICY batch3a_budget_targets_select ON public.budget_targets
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY batch3a_budget_targets_insert ON public.budget_targets
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_budget_targets_update ON public.budget_targets
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_smart_prep_plans_select ON public.smart_prep_plans
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY batch3a_smart_prep_plans_insert ON public.smart_prep_plans
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_smart_prep_plans_update ON public.smart_prep_plans
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_pos_items_select ON public.pos_items
  FOR SELECT USING (public.reference_scope_visible(organization_id, NULL, location_id, NULL));

CREATE POLICY batch3a_pos_items_insert ON public.pos_items
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_pos_items_update ON public.pos_items
  FOR UPDATE USING (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, NULL, location_id, NULL, 'location_manager'));

CREATE POLICY batch3a_vendor_items_select ON public.vendor_items
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_items_insert ON public.vendor_items
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_items_update ON public.vendor_items
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_prices_select ON public.vendor_item_prices
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_prices_insert ON public.vendor_item_prices
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_prices_update ON public.vendor_item_prices
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_item_mappings_select ON public.vendor_item_mappings
  FOR SELECT USING (public.batch3a_vendor_item_scope_visible(organization_id, vendor_item_id));

CREATE POLICY batch3a_vendor_item_mappings_insert ON public.vendor_item_mappings
  FOR INSERT WITH CHECK (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id));

CREATE POLICY batch3a_vendor_item_mappings_update ON public.vendor_item_mappings
  FOR UPDATE USING (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id))
  WITH CHECK (public.batch3a_vendor_item_scope_writable(organization_id, vendor_item_id));

CREATE POLICY batch3a_vendor_aliases_select ON public.vendor_aliases
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, canonical_vendor_id));

CREATE POLICY batch3a_vendor_aliases_insert ON public.vendor_aliases
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id));

CREATE POLICY batch3a_vendor_aliases_update ON public.vendor_aliases
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, canonical_vendor_id));

CREATE POLICY batch3a_pos_menu_mapping_select ON public.pos_menu_mapping
  FOR SELECT USING (public.batch3a_pos_menu_mapping_visible(organization_id, pos_item_id, recipe_id));

CREATE POLICY batch3a_pos_menu_mapping_insert ON public.pos_menu_mapping
  FOR INSERT WITH CHECK (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id));

CREATE POLICY batch3a_pos_menu_mapping_update ON public.pos_menu_mapping
  FOR UPDATE USING (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id))
  WITH CHECK (public.batch3a_pos_menu_mapping_writable(organization_id, pos_item_id, recipe_id));

-- Parent-inherited tables.
CREATE POLICY batch3a_count_sessions_select ON public.count_sessions
  FOR SELECT USING (public.batch3a_count_sheet_visible(organization_id, count_sheet_id));

CREATE POLICY batch3a_count_sessions_insert ON public.count_sessions
  FOR INSERT WITH CHECK (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true));

CREATE POLICY batch3a_count_sessions_update ON public.count_sessions
  FOR UPDATE USING (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
  WITH CHECK (public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true));

CREATE POLICY batch3a_recipe_ingredients_select ON public.recipe_ingredients
  FOR SELECT USING (public.batch3a_recipe_scope_visible(organization_id, recipe_id));

CREATE POLICY batch3a_recipe_ingredients_insert ON public.recipe_ingredients
  FOR INSERT WITH CHECK (public.batch3a_recipe_scope_writable(organization_id, recipe_id));

CREATE POLICY batch3a_recipe_ingredients_update ON public.recipe_ingredients
  FOR UPDATE USING (public.batch3a_recipe_scope_writable(organization_id, recipe_id))
  WITH CHECK (public.batch3a_recipe_scope_writable(organization_id, recipe_id));

CREATE POLICY batch3a_receivings_select ON public.receivings
  FOR SELECT USING (public.batch3a_order_scope_visible(organization_id, order_id, purchase_order_id));

CREATE POLICY batch3a_receivings_insert ON public.receivings
  FOR INSERT WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id));

CREATE POLICY batch3a_receivings_update ON public.receivings
  FOR UPDATE USING (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id))
  WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, purchase_order_id));

CREATE POLICY batch3a_temperature_logs_select ON public.temperature_logs
  FOR SELECT USING (public.batch3a_iot_sensor_visible(organization_id, sensor_id));

CREATE POLICY batch3a_temperature_logs_insert ON public.temperature_logs
  FOR INSERT WITH CHECK (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true));

CREATE POLICY batch3a_temperature_logs_update ON public.temperature_logs
  FOR UPDATE USING (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true))
  WITH CHECK (public.batch3a_iot_sensor_writable(organization_id, sensor_id, true));

CREATE POLICY batch3a_vendor_issues_select ON public.vendor_issues
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_issues_insert ON public.vendor_issues
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_issues_update ON public.vendor_issues
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_statements_select ON public.vendor_statements
  FOR SELECT USING (public.batch3a_vendor_scope_visible(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_statements_insert ON public.vendor_statements
  FOR INSERT WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_vendor_statements_update ON public.vendor_statements
  FOR UPDATE USING (public.batch3a_vendor_scope_writable(organization_id, vendor_id))
  WITH CHECK (public.batch3a_vendor_scope_writable(organization_id, vendor_id));

CREATE POLICY batch3a_edi_transmissions_select ON public.edi_transmissions
  FOR SELECT USING (public.batch3a_order_scope_visible(organization_id, order_id, NULL));

CREATE POLICY batch3a_edi_transmissions_insert ON public.edi_transmissions
  FOR INSERT WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, NULL));

CREATE POLICY batch3a_edi_transmissions_update ON public.edi_transmissions
  FOR UPDATE USING (public.batch3a_order_scope_writable(organization_id, order_id, NULL))
  WITH CHECK (public.batch3a_order_scope_writable(organization_id, order_id, NULL));

CREATE POLICY batch3a_webhook_events_queue_select ON public.webhook_events_queue
  FOR SELECT USING (public.batch3a_webhook_endpoint_visible(organization_id, endpoint_id));

CREATE POLICY batch3a_webhook_events_queue_insert ON public.webhook_events_queue
  FOR INSERT WITH CHECK (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id));

CREATE POLICY batch3a_webhook_events_queue_update ON public.webhook_events_queue
  FOR UPDATE USING (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id))
  WITH CHECK (public.batch3a_webhook_endpoint_writable(organization_id, endpoint_id));

REVOKE ALL PRIVILEGES ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.time_clocks, public.shift_schedules, public.employee_shifts, public.count_sheets,
  public.pos_orders, public.pos_sales_data, public.delivery_channels, public.labor_forecasts,
  public.iot_sensors, public.budgets, public.vendor_items, public.vendor_item_prices,
  public.vendor_item_mappings, public.vendor_aliases, public.pos_items, public.pos_menu_mapping,
  public.smart_prep_plans, public.budget_targets, public.count_sessions, public.recipe_ingredients,
  public.receivings, public.temperature_logs, public.vendor_issues, public.vendor_statements,
  public.edi_transmissions, public.webhook_events_queue
TO service_role;

-- Source: 20260628000009_hierarchical_rls_batch3b_org_config.sql
-- Reference-hybrid setting.
CREATE POLICY batch3b_operational_settings_select ON public.operational_settings
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY batch3b_operational_settings_insert ON public.operational_settings
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY batch3b_operational_settings_update ON public.operational_settings
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

-- Org-level admin-only write tables.
CREATE POLICY batch3b_accounting_export_queue_select ON public.accounting_export_queue
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_accounting_export_queue_insert ON public.accounting_export_queue
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_accounting_export_queue_update ON public.accounting_export_queue
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_accounting_sync_logs_select ON public.accounting_sync_logs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_accounting_sync_logs_insert ON public.accounting_sync_logs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_accounting_sync_logs_update ON public.accounting_sync_logs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_roles_select ON public.roles
  FOR SELECT USING (is_system IS TRUE OR public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_roles_insert ON public.roles
  FOR INSERT WITH CHECK (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_roles_update ON public.roles
  FOR UPDATE USING (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true))
  WITH CHECK (COALESCE(is_system, false) = false AND public.batch3b_org_writable(organization_id, true));

-- Org-level manager+ write tables.
CREATE POLICY batch3b_custom_reports_select ON public.custom_reports
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_custom_reports_insert ON public.custom_reports
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_custom_reports_update ON public.custom_reports
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_domain_events_select ON public.domain_events
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_domain_events_insert ON public.domain_events
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_domain_events_update ON public.domain_events
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_invoice_ingestion_jobs_select ON public.invoice_ingestion_jobs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_invoice_ingestion_jobs_insert ON public.invoice_ingestion_jobs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_invoice_ingestion_jobs_update ON public.invoice_ingestion_jobs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_location_groups_select ON public.location_groups
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_location_groups_insert ON public.location_groups
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_location_groups_update ON public.location_groups
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_progress_select ON public.onboarding_progress
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_onboarding_progress_insert ON public.onboarding_progress
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_progress_update ON public.onboarding_progress
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_step_events_select ON public.onboarding_step_events
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_onboarding_step_events_insert ON public.onboarding_step_events
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_step_events_update ON public.onboarding_step_events
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_workflow_runs_select ON public.onboarding_workflow_runs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_onboarding_workflow_runs_insert ON public.onboarding_workflow_runs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_workflow_runs_update ON public.onboarding_workflow_runs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_coupon_redemptions_select ON public.onboarding_coupon_redemptions
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_onboarding_coupon_redemptions_insert ON public.onboarding_coupon_redemptions
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_coupon_redemptions_update ON public.onboarding_coupon_redemptions
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_payment_methods_select ON public.onboarding_payment_methods
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_onboarding_payment_methods_insert ON public.onboarding_payment_methods
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_onboarding_payment_methods_update ON public.onboarding_payment_methods
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_processing_jobs_select ON public.processing_jobs
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_processing_jobs_insert ON public.processing_jobs
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_processing_jobs_update ON public.processing_jobs
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_procurement_bids_select ON public.procurement_bids
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_procurement_bids_insert ON public.procurement_bids
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_procurement_bids_update ON public.procurement_bids
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_web_vitals_telemetry_select ON public.web_vitals_telemetry
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_web_vitals_telemetry_insert ON public.web_vitals_telemetry
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_web_vitals_telemetry_update ON public.web_vitals_telemetry
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

-- User-scoped notifications. Recipient column verified as notifications.user_id.
CREATE POLICY batch3b_notifications_select ON public.notifications
  FOR SELECT USING (public.batch3b_notification_recipient(user_id));

CREATE POLICY batch3b_notifications_update ON public.notifications
  FOR UPDATE USING (public.batch3b_notification_recipient(user_id))
  WITH CHECK (public.batch3b_notification_recipient(user_id));

REVOKE ALL PRIVILEGES ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry,
  public.notifications
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry
TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.operational_settings,
  public.accounting_export_queue, public.accounting_sync_logs, public.custom_reports,
  public.domain_events, public.invoice_ingestion_jobs, public.location_groups,
  public.onboarding_progress, public.onboarding_step_events, public.onboarding_workflow_runs,
  public.onboarding_coupon_redemptions, public.onboarding_payment_methods,
  public.processing_jobs, public.procurement_bids, public.roles, public.web_vitals_telemetry,
  public.notifications
TO service_role;

-- Source: 20260628000010_hierarchical_rls_batch3b_cont_org_level.sql
-- Org-level, manager+ write.
CREATE POLICY batch3b_cont_customers_select ON public.customers
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_customers_insert ON public.customers
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_customers_update ON public.customers
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_marketing_campaigns_select ON public.marketing_campaigns
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_marketing_campaigns_insert ON public.marketing_campaigns
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_marketing_campaigns_update ON public.marketing_campaigns
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_loyalty_memberships_select ON public.loyalty_memberships
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_loyalty_memberships_insert ON public.loyalty_memberships
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, false));

CREATE POLICY batch3b_cont_loyalty_memberships_update ON public.loyalty_memberships
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, false))
  WITH CHECK (public.batch3b_org_writable(organization_id, false));

-- Org-level, admin-only write.
CREATE POLICY batch3b_cont_gl_mappings_select ON public.gl_mappings
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_gl_mappings_insert ON public.gl_mappings
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_gl_mappings_update ON public.gl_mappings
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_tolerance_configurations_select ON public.tolerance_configurations
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_tolerance_configurations_insert ON public.tolerance_configurations
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_tolerance_configurations_update ON public.tolerance_configurations
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_closed_periods_select ON public.closed_periods
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_closed_periods_insert ON public.closed_periods
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_closed_periods_update ON public.closed_periods
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_pos_configurations_select ON public.pos_configurations
  FOR SELECT USING (public.batch3b_org_visible(organization_id));

CREATE POLICY batch3b_cont_pos_configurations_insert ON public.pos_configurations
  FOR INSERT WITH CHECK (public.batch3b_org_writable(organization_id, true));

CREATE POLICY batch3b_cont_pos_configurations_update ON public.pos_configurations
  FOR UPDATE USING (public.batch3b_org_writable(organization_id, true))
  WITH CHECK (public.batch3b_org_writable(organization_id, true));

REVOKE ALL PRIVILEGES ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.customers,
  public.marketing_campaigns,
  public.loyalty_memberships,
  public.gl_mappings,
  public.tolerance_configurations,
  public.closed_periods,
  public.pos_configurations
TO service_role;

-- Source: 20260628000011_phase2c_access_tables_non_recursive_rls.sql
REVOKE EXECUTE ON FUNCTION public.my_profile_org() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.my_profile_role() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.my_profile_brand() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.my_profile_location() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.access_role_rank(text) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.access_membership_readable(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.access_membership_writable(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.access_user_role_name(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_profile_org() TO authenticated;

GRANT EXECUTE ON FUNCTION public.my_profile_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.my_profile_brand() TO authenticated;

GRANT EXECUTE ON FUNCTION public.my_profile_location() TO authenticated;

GRANT EXECUTE ON FUNCTION public.access_role_rank(text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.access_membership_readable(uuid, uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.access_membership_writable(uuid, uuid, uuid, uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.access_user_role_name(uuid) TO authenticated;

REVOKE ALL PRIVILEGES ON public.profiles, public.organization_members, public.brand_members, public.location_members, public.user_roles FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.organization_members, public.brand_members, public.location_members, public.user_roles FROM anon, authenticated;

GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members, public.brand_members, public.location_members, public.user_roles TO authenticated;

CREATE POLICY profiles_nonrecursive_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.my_profile_role() = 'platform_admin'
    OR (
      organization_id = public.my_profile_org()
      AND public.my_profile_role() IN ('location_manager', 'branch_manager', 'org_owner')
    )
  );

CREATE POLICY profiles_self_update_nonsecurity ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_owner_delete_nonrecursive ON public.profiles
  FOR DELETE
  USING (
    id <> auth.uid()
    AND (
      public.my_profile_role() = 'platform_admin'
      OR (
        public.my_profile_role() = 'org_owner'
        AND organization_id = public.my_profile_org()
      )
    )
  );

CREATE POLICY organization_members_select_scope ON public.organization_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, NULL));

CREATE POLICY organization_members_insert_cascade_down ON public.organization_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY organization_members_update_cascade_down ON public.organization_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, NULL, NULL, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY organization_members_delete_cascade_down ON public.organization_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY brand_members_select_scope ON public.brand_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, brand_id, NULL));

CREATE POLICY brand_members_insert_cascade_down ON public.brand_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY brand_members_update_cascade_down ON public.brand_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY brand_members_delete_cascade_down ON public.brand_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY location_members_select_scope ON public.location_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, location_id));

CREATE POLICY location_members_insert_cascade_down ON public.location_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY location_members_update_cascade_down ON public.location_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, NULL, location_id, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY location_members_delete_cascade_down ON public.location_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY user_roles_select_scope ON public.user_roles
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, location_id));

CREATE POLICY user_roles_insert_cascade_down ON public.user_roles
  FOR INSERT
  WITH CHECK (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

CREATE POLICY user_roles_update_cascade_down ON public.user_roles
  FOR UPDATE
  USING (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  )
  WITH CHECK (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

CREATE POLICY user_roles_delete_cascade_down ON public.user_roles
  FOR DELETE
  USING (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

-- Source: 20260628000012_secure_integration_secrets.sql
REVOKE ALL PRIVILEGES ON public.integrations, public.webhook_endpoints FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.integrations, public.webhook_endpoints FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

-- Service role keeps full access for edge functions and webhook dispatch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations, public.webhook_endpoints TO service_role;

-- Authenticated admins can read/write only non-secret columns directly.
GRANT SELECT (id, organization_id, provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;

GRANT INSERT (id, organization_id, provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;

GRANT UPDATE (provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;

GRANT DELETE ON public.integrations TO authenticated;

GRANT SELECT (id, organization_id, url, status, created_at, secret_prefix)
  ON public.webhook_endpoints TO authenticated;

GRANT INSERT (id, organization_id, url, status, created_at, secret_prefix)
  ON public.webhook_endpoints TO authenticated;

GRANT UPDATE (url, status, secret_prefix)
  ON public.webhook_endpoints TO authenticated;

GRANT DELETE ON public.webhook_endpoints TO authenticated;

CREATE POLICY integrations_admin_select
  ON public.integrations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_insert
  ON public.integrations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_update
  ON public.integrations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_delete
  ON public.integrations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_select
  ON public.webhook_endpoints
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_insert
  ON public.webhook_endpoints
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_update
  ON public.webhook_endpoints
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_delete
  ON public.webhook_endpoints
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

-- Source: 20260628000013_append_only_ledger_audit.sql
REVOKE ALL PRIVILEGES ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 FROM anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 FROM anon, authenticated;

GRANT SELECT ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 TO authenticated;

GRANT SELECT, INSERT ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

CREATE POLICY general_ledger_entries_admin_select
  ON public.general_ledger_entries
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_admin_select
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_default_admin_select
  ON public.audit_logs_default
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_y2025_admin_select
  ON public.audit_logs_y2025
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_y2026_admin_select
  ON public.audit_logs_y2026
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

-- Source: 20260628000014_admin_only_api_payout_config.sql
REVOKE ALL PRIVILEGES ON public.payment_accounts, public.api_keys, public.developer_api_keys FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.payment_accounts, public.api_keys, public.developer_api_keys FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_accounts, public.api_keys, public.developer_api_keys TO authenticated;

GRANT ALL PRIVILEGES ON public.payment_accounts, public.api_keys, public.developer_api_keys TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

CREATE POLICY payment_accounts_admin_select
  ON public.payment_accounts
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_insert
  ON public.payment_accounts
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_update
  ON public.payment_accounts
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_delete
  ON public.payment_accounts
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_select
  ON public.api_keys
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_insert
  ON public.api_keys
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_update
  ON public.api_keys
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_delete
  ON public.api_keys
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_select
  ON public.developer_api_keys
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_insert
  ON public.developer_api_keys
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_update
  ON public.developer_api_keys
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_delete
  ON public.developer_api_keys
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

-- Source: 20260628000015_admin_only_sensitive_config.sql
REVOKE ALL PRIVILEGES ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.archived_invitations TO authenticated;

GRANT ALL PRIVILEGES ON
  public.archived_brands,
  public.archived_locations,
  public.archived_profiles,
  public.archived_invitations,
  public.business_verifications,
  public.franchise_agreements,
  public.subscriptions,
  public.ai_insights
TO service_role;

REVOKE SELECT ON public.archived_invitations FROM anon, authenticated;

REVOKE SELECT (token) ON public.archived_invitations FROM anon, authenticated;

GRANT SELECT (
  id,
  email,
  role,
  invited_by,
  accepted_at,
  expires_at,
  created_at,
  organization_id,
  location_id,
  brand_id,
  access_level,
  archived_at,
  archived_by
) ON public.archived_invitations TO authenticated;

CREATE POLICY archived_brands_admin_select
  ON public.archived_brands
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_insert
  ON public.archived_brands
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_update
  ON public.archived_brands
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_brands_admin_delete
  ON public.archived_brands
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_select
  ON public.archived_locations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_insert
  ON public.archived_locations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_update
  ON public.archived_locations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_locations_admin_delete
  ON public.archived_locations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_select
  ON public.archived_profiles
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_insert
  ON public.archived_profiles
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_update
  ON public.archived_profiles
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_profiles_admin_delete
  ON public.archived_profiles
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_select
  ON public.archived_invitations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_insert
  ON public.archived_invitations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_update
  ON public.archived_invitations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY archived_invitations_admin_delete
  ON public.archived_invitations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY business_verifications_admin_or_self_select
  ON public.business_verifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (public.is_admin() AND organization_id = public.get_auth_org())
  );

CREATE POLICY business_verifications_admin_or_self_insert
  ON public.business_verifications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (public.is_admin() AND organization_id = public.get_auth_org())
  );

CREATE POLICY business_verifications_admin_update
  ON public.business_verifications
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY business_verifications_admin_delete
  ON public.business_verifications
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY franchise_agreements_party_admin_select
  ON public.franchise_agreements
  FOR SELECT
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_insert
  ON public.franchise_agreements
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_update
  ON public.franchise_agreements
  FOR UPDATE
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY franchise_agreements_party_admin_delete
  ON public.franchise_agreements
  FOR DELETE
  USING (
    public.is_admin()
    AND public.get_auth_org() IN (organization_id, parent_org_id, child_org_id)
  );

CREATE POLICY subscriptions_admin_select
  ON public.subscriptions
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_insert
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_update
  ON public.subscriptions
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY subscriptions_admin_delete
  ON public.subscriptions
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_select
  ON public.ai_insights
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_insert
  ON public.ai_insights
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_update
  ON public.ai_insights
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY ai_insights_admin_delete
  ON public.ai_insights
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

-- Source: 20260628000016_transfer_endpoint_rls.sql
REVOKE ALL PRIVILEGES ON public.transfers, public.intercompany_transfers, public.commissary_routes FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transfers, public.intercompany_transfers, public.commissary_routes FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.transfers, public.intercompany_transfers, public.commissary_routes TO authenticated;

GRANT ALL PRIVILEGES ON public.transfers, public.intercompany_transfers, public.commissary_routes TO service_role;

GRANT EXECUTE ON FUNCTION public.transfer_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.transfer_from_scope_writable(uuid, uuid, timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.intercompany_from_scope_writable(uuid, uuid, timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.commissary_route_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.commissary_route_scope_writable(uuid, uuid, timestamptz) TO authenticated;

CREATE POLICY transfers_endpoint_select
  ON public.transfers
  FOR SELECT
  USING (public.transfer_scope_visible(organization_id, from_location_id, to_location_id, NULL));

CREATE POLICY transfers_from_scope_insert
  ON public.transfers
  FOR INSERT
  WITH CHECK (public.transfer_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY transfers_from_scope_update
  ON public.transfers
  FOR UPDATE
  USING (public.transfer_from_scope_writable(organization_id, from_location_id, NULL))
  WITH CHECK (public.transfer_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY intercompany_transfers_endpoint_select
  ON public.intercompany_transfers
  FOR SELECT
  USING (public.transfer_scope_visible(organization_id, from_location_id, to_location_id, NULL));

CREATE POLICY intercompany_transfers_branch_from_scope_insert
  ON public.intercompany_transfers
  FOR INSERT
  WITH CHECK (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY intercompany_transfers_branch_from_scope_update
  ON public.intercompany_transfers
  FOR UPDATE
  USING (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL))
  WITH CHECK (public.intercompany_from_scope_writable(organization_id, from_location_id, NULL));

CREATE POLICY commissary_routes_endpoint_select
  ON public.commissary_routes
  FOR SELECT
  USING (public.commissary_route_scope_visible(organization_id, id, origin_location_id, NULL));

CREATE POLICY commissary_routes_origin_scope_insert
  ON public.commissary_routes
  FOR INSERT
  WITH CHECK (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL));

CREATE POLICY commissary_routes_origin_scope_update
  ON public.commissary_routes
  FOR UPDATE
  USING (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL))
  WITH CHECK (public.commissary_route_scope_writable(organization_id, origin_location_id, NULL));

-- Source: 20260628000017_location_email_addresses.sql
ALTER TABLE public.location_email_addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.location_email_addresses FORCE ROW LEVEL SECURITY;

CREATE POLICY location_email_addresses_select
  ON public.location_email_addresses
  FOR SELECT
  USING (
    public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

CREATE POLICY location_email_addresses_insert
  ON public.location_email_addresses
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false)
  );

CREATE POLICY location_email_addresses_update
  ON public.location_email_addresses
  FOR UPDATE
  USING (
    public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
  )
  WITH CHECK (
    public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false)
  );

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.location_email_addresses FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.location_email_addresses TO authenticated;

GRANT ALL ON public.location_email_addresses TO service_role;

GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.tenant_scope_writable(uuid, uuid, uuid, timestamptz, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated, service_role;

-- Source: 20260628000018_ingest_email_invoice_rpc.sql
REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

-- Source: 20260628000020_vendor_data_model_v1a.sql
ALTER TABLE public.vendor_tax_information ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_tax_information FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_banking_details ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_banking_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_payment_provider_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_payment_provider_links FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_tax_information_admin_select
  ON public.vendor_tax_information
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_tax_information_admin_insert
  ON public.vendor_tax_information
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_tax_information_admin_update
  ON public.vendor_tax_information
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  )
  WITH CHECK (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_banking_details_branch_select
  ON public.vendor_banking_details
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_banking_details_branch_insert
  ON public.vendor_banking_details
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_banking_details_branch_update
  ON public.vendor_banking_details
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_select
  ON public.vendor_payment_provider_links
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_insert
  ON public.vendor_payment_provider_links
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_update
  ON public.vendor_payment_provider_links
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

REVOKE ALL ON public.vendor_tax_information FROM anon, authenticated;

REVOKE ALL ON public.vendor_banking_details FROM anon, authenticated;

REVOKE ALL ON public.vendor_payment_provider_links FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_tax_information FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_banking_details FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_payment_provider_links FROM anon, authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  w9_status,
  tax_classification,
  legal_name,
  tax_id_last4,
  is_1099,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_tax_information TO authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  account_last4,
  verification_state,
  verified_at,
  is_active,
  version,
  effective_from,
  effective_to,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_banking_details TO authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  provider,
  provider_status,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_payment_provider_links TO authenticated;

GRANT INSERT, UPDATE ON public.vendor_tax_information TO authenticated;

GRANT INSERT, UPDATE ON public.vendor_banking_details TO authenticated;

GRANT INSERT, UPDATE ON public.vendor_payment_provider_links TO authenticated;

GRANT ALL ON public.vendor_tax_information TO service_role;

GRANT ALL ON public.vendor_banking_details TO service_role;

GRANT ALL ON public.vendor_payment_provider_links TO service_role;

REVOKE SELECT (tax_id_full) ON public.vendor_tax_information FROM anon, authenticated;

REVOKE SELECT (account_number, routing_number) ON public.vendor_banking_details FROM anon, authenticated;

REVOKE SELECT (provider_customer_ref, provider_funding_ref) ON public.vendor_payment_provider_links FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO authenticated, service_role;

-- Source: 20260628000021_vendor_secret_vault.sql
REVOKE ALL ON FUNCTION public.store_vendor_banking_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.store_vendor_tax_secret(uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_vendor_banking_for_audit(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_vendor_tax_for_audit(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_vendor_banking_secret(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.store_vendor_tax_secret(uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_vendor_banking_for_audit(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_vendor_tax_for_audit(uuid) TO service_role;

GRANT SELECT (banking_secret_id) ON public.vendor_banking_details TO authenticated;

GRANT SELECT (tax_secret_id) ON public.vendor_tax_information TO authenticated;

-- Source: 20260628000022_vendor_banking_default.sql
REVOKE ALL ON FUNCTION public.get_vendor_payment_account(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_vendor_payment_account(uuid) TO service_role;

GRANT SELECT (is_default) ON public.vendor_banking_details TO authenticated;

-- Source: 20260628000023_vendor_banking_link.sql
ALTER TABLE public.vendor_banking_link_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_banking_link_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_banking_link_tokens_manager_select
  ON public.vendor_banking_link_tokens
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_manager_or_above()
    AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

REVOKE ALL ON public.vendor_banking_link_tokens FROM anon, authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_banking_link_tokens FROM anon, authenticated;

GRANT ALL ON public.vendor_banking_link_tokens TO service_role;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  status,
  expires_at,
  submitted_at,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_banking_link_tokens TO authenticated;

REVOKE SELECT (token) ON public.vendor_banking_link_tokens FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

-- Source: 20260628000024_vendor_banking_change_intent.sql
REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

GRANT SELECT (intent) ON public.vendor_banking_link_tokens TO authenticated;

-- Source: 20260628000025_provider_links_consolidation.sql
REVOKE ALL ON FUNCTION public.get_vendor_provider_link(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_vendor_provider_link(uuid, text) TO service_role;

-- Source: 20260628000028_vendor_approval_containment.sql
REVOKE EXECUTE ON FUNCTION public.assert_can_approve_vendor_scope(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_can_approve_vendor_scope(uuid, uuid, uuid) TO authenticated, service_role;

-- Source: 20260628000030_vendor_approval_transition_rpc.sql
REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) TO authenticated, service_role;

-- Source: 20260628000031_find_duplicate_vendors.sql
REVOKE EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.find_duplicate_vendors(uuid, text, text, text) TO authenticated, service_role;

-- Source: 20260628000032_validate_invoice_reconciliation.sql
REVOKE EXECUTE ON FUNCTION public.validate_invoice(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.validate_invoice(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.validate_invoice(uuid) TO authenticated, service_role;

-- Source: 20260706000001_tenant_onboarding_banking_signature_review.sql
ALTER TABLE public.onboarding_bank_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_payment_authorizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_bank_accounts_owner_select ON public.onboarding_bank_accounts;

CREATE POLICY onboarding_bank_accounts_owner_select
  ON public.onboarding_bank_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS tenant_payment_authorizations_owner_select ON public.tenant_payment_authorizations;

CREATE POLICY tenant_payment_authorizations_owner_select
  ON public.tenant_payment_authorizations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS onboarding_admin_actions_platform_select ON public.onboarding_admin_actions;

CREATE POLICY onboarding_admin_actions_platform_select
  ON public.onboarding_admin_actions FOR SELECT
  TO authenticated
  USING (public.get_auth_role() = 'platform_admin');

REVOKE EXECUTE ON FUNCTION public.store_onboarding_bank_secret(UUID, TEXT, TEXT) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_onboarding_bank_secret(UUID, TEXT, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.submit_onboarding_bank_account(JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_default_onboarding_bank_account(UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.capture_tenant_payment_signature(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_business_verification(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reject_business_verification(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.request_onboarding_more_info(UUID, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reissue_owner_invitation(UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.notify_expired_owner_invitations() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.notify_business_verification_review_state() TO service_role;

GRANT EXECUTE ON FUNCTION public.link_onboarding_bank_to_payment_account() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_invite_details(TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated, service_role;

-- Source: 20260707000002_onboarding_draft_and_verification_settings.sql
ALTER TABLE public.platform_onboarding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_onboarding_settings_read ON public.platform_onboarding_settings;

CREATE POLICY platform_onboarding_settings_read
  ON public.platform_onboarding_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS platform_onboarding_settings_admin_update ON public.platform_onboarding_settings;

CREATE POLICY platform_onboarding_settings_admin_update
  ON public.platform_onboarding_settings FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

GRANT EXECUTE ON FUNCTION public.get_onboarding_verification_settings() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_onboarding_verification_settings(BOOLEAN, BOOLEAN) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_business_verification_draft() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_business_verification_draft(JSONB, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

-- Source: 20260707000003_onboarding_audit_log_coverage.sql
REVOKE ALL ON FUNCTION public.redact_onboarding_audit_payload(TEXT, JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.resolve_onboarding_audit_org_id(JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.process_onboarding_audit_log() FROM PUBLIC, anon;

-- Source: 20260708000001_invitation_signup_validation_status.sql
GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

-- Source: 20260708000002_tenant_super_admin_org_manager_role_model.sql
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_scope ON public.tenants;

CREATE POLICY tenants_select_scope ON public.tenants
FOR SELECT USING (
  public.is_platform_admin()
  OR id = public.get_auth_tenant()
);

DROP POLICY IF EXISTS tenants_write_scope ON public.tenants;

CREATE POLICY tenants_write_scope ON public.tenants
FOR ALL USING (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND id = public.get_auth_tenant())
)
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND id = public.get_auth_tenant())
);

DROP POLICY IF EXISTS tenant_members_select_scope ON public.tenant_members;

CREATE POLICY tenant_members_select_scope ON public.tenant_members
FOR SELECT USING (
  public.is_platform_admin()
  OR tenant_id = public.get_auth_tenant()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS tenant_members_write_scope ON public.tenant_members;

CREATE POLICY tenant_members_write_scope ON public.tenant_members
FOR ALL USING (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND tenant_id = public.get_auth_tenant() AND user_id <> auth.uid())
)
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND tenant_id = public.get_auth_tenant() AND user_id <> auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.tenant_members TO authenticated;

GRANT ALL ON public.tenants, public.tenant_members TO service_role;

GRANT EXECUTE ON FUNCTION public.normalize_app_role(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_auth_tenant() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_tenant_super_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.access_role_rank(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.can_invite_role(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.setup_organization_full(uuid, text, text, text, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.switch_user_context(uuid, uuid, uuid) TO authenticated, service_role;

-- Source: 20260709000003_invite_business_verification_toggle.sql
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- Source: 20260709000004_persist_onboarding_hierarchy_addresses.sql
GRANT EXECUTE ON FUNCTION public.insert_onboarding_address(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260709000008_invite_coupon_email_lock.sql
GRANT EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- Source: 20260710000002_fix_onboarding_contact_otp_hashing.sql
REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) TO authenticated, service_role;

-- Source: 20260710000003_remove_onboarding_otp_dev_echo.sql
REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260710000004_supabase_auth_onboarding_contact_verification.sql
REVOKE EXECUTE ON FUNCTION public.mark_onboarding_contact_verified(TEXT, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.mark_onboarding_contact_verified(TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260710000005_temporary_dev_onboarding_contact_otp.sql
REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(TEXT, TEXT) FROM public, anon;

REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(TEXT, TEXT, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(TEXT, TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Source: 20260710000006_business_verification_tenant_addresses_only.sql
GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

-- Source: 20260710000007_hierarchy_required_org_location_addresses.sql
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260710000008_business_verification_without_addresses.sql
GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

-- Source: 20260710000013_platform_business_review_queue_rpc.sql
GRANT EXECUTE ON FUNCTION public.platform_business_verification_reviews() TO authenticated, service_role;

-- Source: 20260710000015_idempotent_submit_business_verification_rpc.sql
GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

-- Source: 20260710000016_fix_approve_business_verification_columns.sql
GRANT EXECUTE ON FUNCTION public.approve_business_verification(UUID, TEXT) TO authenticated, service_role;

-- Source: 20260710000017_vendor_onboarding_schema.sql
-- Ensure RLS is enabled for the new table
ALTER TABLE public.vendor_tax_details ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy for vendor_tax_details
CREATE POLICY "Tenant isolation for vendor_tax_details"
    ON public.vendor_tax_details
    FOR ALL
    USING (
        vendor_id IN (
            SELECT id FROM public.vendors 
            WHERE organization_id = (current_setting('app.current_tenant_id', true))::uuid
        )
    );

-- Also allow service role full access
CREATE POLICY "Service role full access for vendor_tax_details"
    ON public.vendor_tax_details
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Source: 20260710000018_optional_org_address_required_location_address.sql
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260711000001_allow_trial_coupon_before_hierarchy_creation.sql
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260711000002_treat_optional_hierarchy_address_json_null_as_absent.sql
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260711000004_vendor_onboarding_flow.sql
ALTER TABLE public.vendor_otp_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_otp_challenges FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_link_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_link_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_banking_change_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_banking_change_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_onboarding_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_onboarding_preferences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_onboarding_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_onboarding_events FORCE ROW LEVEL SECURITY;

CREATE POLICY vendor_otp_challenges_manager_select ON public.vendor_otp_challenges
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY vendor_link_tokens_manager_select ON public.vendor_link_tokens
  FOR SELECT USING (deleted_at IS NULL AND public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY vendor_documents_manager_select ON public.vendor_documents
  FOR SELECT USING (deleted_at IS NULL AND public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY vendor_documents_manager_insert ON public.vendor_documents
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY vendor_documents_manager_update ON public.vendor_documents
  FOR UPDATE USING (deleted_at IS NULL AND public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY vendor_banking_change_requests_manager_select ON public.vendor_banking_change_requests
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY vendor_banking_change_requests_manager_update ON public.vendor_banking_change_requests
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'branch_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'branch_manager'));

CREATE POLICY vendor_onboarding_preferences_manager_select ON public.vendor_onboarding_preferences
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY vendor_onboarding_preferences_manager_upsert ON public.vendor_onboarding_preferences
  FOR ALL USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

CREATE POLICY vendor_onboarding_events_manager_select ON public.vendor_onboarding_events
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

CREATE POLICY vendor_onboarding_events_manager_insert ON public.vendor_onboarding_events
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

REVOKE ALL ON public.vendor_otp_challenges FROM anon, authenticated;

REVOKE ALL ON public.vendor_link_tokens FROM anon, authenticated;

REVOKE ALL ON public.vendor_documents FROM anon, authenticated;

REVOKE ALL ON public.vendor_banking_change_requests FROM anon, authenticated;

REVOKE ALL ON public.vendor_onboarding_preferences FROM anon, authenticated;

REVOKE ALL ON public.vendor_onboarding_events FROM anon, authenticated;

GRANT ALL ON public.vendor_otp_challenges TO service_role;

GRANT ALL ON public.vendor_link_tokens TO service_role;

GRANT ALL ON public.vendor_documents TO service_role;

GRANT ALL ON public.vendor_banking_change_requests TO service_role;

GRANT ALL ON public.vendor_onboarding_preferences TO service_role;

GRANT ALL ON public.vendor_onboarding_events TO service_role;

GRANT SELECT ON public.vendor_otp_challenges TO authenticated;

GRANT SELECT ON public.vendor_link_tokens TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.vendor_documents TO authenticated;

GRANT SELECT, UPDATE ON public.vendor_banking_change_requests TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_onboarding_preferences TO authenticated;

GRANT SELECT, INSERT ON public.vendor_onboarding_events TO authenticated;

REVOKE SELECT (otp_hash) ON public.vendor_otp_challenges FROM anon, authenticated;

REVOKE SELECT (token) ON public.vendor_link_tokens FROM anon, authenticated;

DROP POLICY IF EXISTS vendor_documents_magic_link_upload ON storage.objects;

CREATE POLICY vendor_documents_magic_link_upload
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name LIKE 'w9_documents/%'
  AND public.is_valid_vendor_document_upload_token(name)
);

DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;

CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;

CREATE POLICY vendor_documents_manager_write
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above())
WITH CHECK (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

REVOKE ALL ON FUNCTION public.vendor_has_required_onboarding_documents(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.vendor_has_required_onboarding_documents(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_valid_vendor_document_upload_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_valid_vendor_document_upload_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_vendor_link_token(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_vendor_link_token(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_vendor_banking_callback(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_vendor_banking_callback(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.override_vendor_banking_callback(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.override_vendor_banking_callback(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_vendor_tax_information(uuid, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.review_vendor_tax_information(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_vendor_payment_account(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_vendor_payment_account(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) TO authenticated, service_role;

-- Source: 20260713000001_require_stripe_payment_method_for_trial_coupons.sql
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated;

-- Source: 20260714000001_vendor_module_gap_fixes.sql
ALTER TABLE public.organization_vendor_defaults ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_vendor_defaults FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_vendor_defaults_admin_select
  ON public.organization_vendor_defaults
  FOR SELECT
  USING (
    organization_id = public.get_auth_org()
  );

CREATE POLICY organization_vendor_defaults_admin_insert
  ON public.organization_vendor_defaults
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY organization_vendor_defaults_admin_update
  ON public.organization_vendor_defaults
  FOR UPDATE
  USING (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  )
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  );

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.organization_vendor_defaults FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.organization_vendor_defaults TO authenticated;

GRANT ALL ON public.organization_vendor_defaults TO service_role;

-- Source: 20260714000002_recipe_library_release_1.sql
ALTER TABLE public.recipe_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_yields ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_unit_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_types_select ON public.recipe_types;

CREATE POLICY recipe_types_select ON public.recipe_types FOR SELECT
  USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS recipe_types_manage ON public.recipe_types;

CREATE POLICY recipe_types_manage ON public.recipe_types FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

DROP POLICY IF EXISTS recipe_yields_select ON public.recipe_yields;

CREATE POLICY recipe_yields_select ON public.recipe_yields FOR SELECT
  USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS recipe_yields_manage ON public.recipe_yields;

CREATE POLICY recipe_yields_manage ON public.recipe_yields FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

DROP POLICY IF EXISTS recipe_unit_conversions_select ON public.recipe_unit_conversions;

CREATE POLICY recipe_unit_conversions_select ON public.recipe_unit_conversions FOR SELECT
  USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS recipe_unit_conversions_manage ON public.recipe_unit_conversions;

CREATE POLICY recipe_unit_conversions_manage ON public.recipe_unit_conversions FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

-- Source: 20260715010002_recipe_location_visibility.sql
alter table public.recipe_location_visibility enable row level security;

drop policy if exists recipe_location_visibility_select on public.recipe_location_visibility;

create policy recipe_location_visibility_select on public.recipe_location_visibility for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_location_visibility_manage on public.recipe_location_visibility;

create policy recipe_location_visibility_manage on public.recipe_location_visibility for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

-- Source: 20260715010003_recipe_margin_alert_events.sql
alter table public.recipe_margin_alert_events enable row level security;

drop policy if exists recipe_margin_alert_events_select on public.recipe_margin_alert_events;

create policy recipe_margin_alert_events_select on public.recipe_margin_alert_events for select
  using (organization_id = public.get_my_org());

-- Source: 20260715010004_menu_item_authoring_phase1.sql
alter table public.recipe_equipment_catalog enable row level security;

alter table public.recipe_equipment_assignments enable row level security;

alter table public.recipe_preparation_steps enable row level security;

alter table public.recipe_location_prices enable row level security;

drop policy if exists recipe_equipment_catalog_select on public.recipe_equipment_catalog;

create policy recipe_equipment_catalog_select on public.recipe_equipment_catalog for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_equipment_catalog_manage on public.recipe_equipment_catalog;

create policy recipe_equipment_catalog_manage on public.recipe_equipment_catalog for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_equipment_assignments_select on public.recipe_equipment_assignments;

create policy recipe_equipment_assignments_select on public.recipe_equipment_assignments for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_equipment_assignments_manage on public.recipe_equipment_assignments;

create policy recipe_equipment_assignments_manage on public.recipe_equipment_assignments for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_preparation_steps_select on public.recipe_preparation_steps;

create policy recipe_preparation_steps_select on public.recipe_preparation_steps for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_preparation_steps_manage on public.recipe_preparation_steps;

create policy recipe_preparation_steps_manage on public.recipe_preparation_steps for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

drop policy if exists recipe_location_prices_select on public.recipe_location_prices;

create policy recipe_location_prices_select on public.recipe_location_prices for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_location_prices_manage on public.recipe_location_prices;

create policy recipe_location_prices_manage on public.recipe_location_prices for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

revoke all on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Source: 20260715010005_prepared_items_release1.sql
alter table public.recipe_cost_snapshots enable row level security;

drop policy if exists recipe_cost_snapshots_select on public.recipe_cost_snapshots;

create policy recipe_cost_snapshots_select on public.recipe_cost_snapshots for select
  using (organization_id = public.get_my_org());

drop policy if exists recipe_cost_snapshots_manage on public.recipe_cost_snapshots;

create policy recipe_cost_snapshots_manage on public.recipe_cost_snapshots for all
  using (organization_id = public.get_my_org() and public.is_manager_or_above())
  with check (organization_id = public.get_my_org() and public.is_manager_or_above());

revoke all on function public.save_prepared_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;

revoke all on function public.deactivate_prepared_item(uuid) from public,anon;

revoke all on function public.delete_prepared_item(uuid) from public,anon;

grant execute on function public.save_prepared_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated,service_role;

grant execute on function public.deactivate_prepared_item(uuid) to authenticated,service_role;

grant execute on function public.delete_prepared_item(uuid) to authenticated,service_role;

grant execute on function public.get_prepared_item_dependencies(uuid) to authenticated,service_role;

grant execute on function public.recipe_dependency_would_cycle(uuid,uuid) to authenticated,service_role;

-- Source: 20260716000001_payment_workflow_hardening.sql
REVOKE ALL ON FUNCTION public.store_payment_account_banking_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_payment_account_banking_for_audit(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_payment_account_banking_secret(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_payment_account_banking_for_audit(uuid) TO service_role;

-- Source: 20260716010001_bar_items_release1.sql
revoke all on function public.save_bar_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon;

revoke all on function public.set_bar_item_status(uuid,text) from public,anon;

revoke all on function public.delete_bar_item(uuid) from public,anon;

grant execute on function public.save_bar_item_release1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated,service_role;

grant execute on function public.set_bar_item_status(uuid,text) to authenticated,service_role;

grant execute on function public.delete_bar_item(uuid) to authenticated,service_role;

-- Source: 20260716015500_add_get_product_catalog_rpc.sql
GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

-- Source: 20260716020000_add_product_page_workflow_rpcs.sql
GRANT EXECUTE ON FUNCTION public.get_product_dashboard_summary(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reject_product_category_suggestion(uuid) TO authenticated, service_role;

-- Source: 20260717000001_inventory_count_session_persistence.sql
GRANT EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) TO authenticated;

-- Source: 20260717000003_payment_reminders_and_failure_notify.sql
ALTER TABLE public.invoice_reminder_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_reminder_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_reminder_settings_self" ON public.invoice_reminder_settings;

CREATE POLICY "invoice_reminder_settings_self"
  ON public.invoice_reminder_settings
  FOR ALL
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminder_settings TO authenticated;

GRANT ALL ON public.invoice_reminder_settings TO service_role;

ALTER TABLE public.invoice_reminder_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_reminder_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_reminder_log_self_read" ON public.invoice_reminder_log;

CREATE POLICY "invoice_reminder_log_self_read"
  ON public.invoice_reminder_log
  FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

REVOKE ALL ON public.invoice_reminder_log FROM authenticated, anon;

GRANT SELECT ON public.invoice_reminder_log TO authenticated;

GRANT ALL ON public.invoice_reminder_log TO service_role;

REVOKE ALL ON FUNCTION public.send_due_date_reminders() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.send_due_date_reminders() TO service_role;

-- Source: 20260718000001_profiles_rls_tenant_super_admin_fix.sql
DROP POLICY IF EXISTS profiles_nonrecursive_select ON public.profiles;

DROP POLICY IF EXISTS profiles_owner_delete_nonrecursive ON public.profiles;

CREATE POLICY profiles_nonrecursive_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.access_membership_readable(id, organization_id, brand_id, location_id)
  );

CREATE POLICY profiles_owner_delete_nonrecursive ON public.profiles
  FOR DELETE
  USING (
    id <> auth.uid()
    AND public.access_membership_writable(id, organization_id, brand_id, location_id)
  );

-- Source: 20260718000002_organizations_rls_hierarchy_rebuild.sql
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_organizations" ON public.organizations;

DROP POLICY IF EXISTS "Platform Admins see all Orgs" ON public.organizations;

DROP POLICY IF EXISTS "Users see their own Org" ON public.organizations;

DROP POLICY IF EXISTS "Users can create their own organization" ON public.organizations;

DROP POLICY IF EXISTS "Owners can view their own organizations" ON public.organizations;

CREATE POLICY organizations_select_scope ON public.organizations
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR id = public.get_auth_org()
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  );

CREATE POLICY organizations_write_scope ON public.organizations
  FOR UPDATE
  USING (
    public.is_platform_admin()
    OR (public.get_auth_role() = 'org_manager' AND id = public.get_auth_org())
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (public.get_auth_role() = 'org_manager' AND id = public.get_auth_org())
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  );

-- Source: 20260718000003_brands_locations_rls_tenant_super_admin_fix.sql
DROP POLICY IF EXISTS "brands_hierarchical_select" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_insert" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_update" ON public.brands;

DROP POLICY IF EXISTS "brands_hierarchical_delete" ON public.brands;

DROP POLICY IF EXISTS "locations_hierarchical_select" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_insert" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_update" ON public.locations;

DROP POLICY IF EXISTS "locations_hierarchical_delete" ON public.locations;

-- ===== brands =====

CREATE POLICY "brands_hierarchical_select"
ON public.brands
FOR SELECT
USING (
  public.is_platform_admin()
  OR brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
);

CREATE POLICY "brands_hierarchical_insert"
ON public.brands
FOR INSERT
WITH CHECK (
  public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('org_manager')
  AND (
    public.is_platform_admin()
    OR (
      public.get_auth_role() = 'tenant_super_admin'
      AND organization_id IN (
        SELECT id FROM public.organizations WHERE tenant_id = public.get_auth_tenant()
      )
    )
    OR (
      public.get_auth_role() = 'org_manager'
      AND organization_id = public.get_auth_org()
    )
  )
);

CREATE POLICY "brands_hierarchical_update"
ON public.brands
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    AND (
      (public.get_auth_role() = 'tenant_super_admin'
        AND organization_id IN (SELECT id FROM public.organizations WHERE tenant_id = public.get_auth_tenant()))
      OR (public.get_auth_role() IN ('org_manager', 'branch_manager')
        AND organization_id = public.get_auth_org())
    )
  )
);

CREATE POLICY "brands_hierarchical_delete"
ON public.brands
FOR DELETE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  )
);

-- ===== locations =====

CREATE POLICY "locations_hierarchical_select"
ON public.locations
FOR SELECT
USING (
  public.is_platform_admin()
  OR id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
);

CREATE POLICY "locations_hierarchical_insert"
ON public.locations
FOR INSERT
WITH CHECK (
  public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
  AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  AND organization_id IN (
    SELECT b.organization_id FROM public.brands b WHERE b.brand_id = locations.brand_id
  )
);

CREATE POLICY "locations_hierarchical_update"
ON public.locations
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    AND organization_id IN (
      SELECT b.organization_id FROM public.brands b WHERE b.brand_id = locations.brand_id
    )
  )
);

CREATE POLICY "locations_hierarchical_delete"
ON public.locations
FOR DELETE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
  )
);

-- Source: 20260719000004_register_invoice_document.sql
REVOKE ALL ON FUNCTION public.register_invoice_document(text, text, text, bigint, text, text, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_invoice_document(text, text, text, bigint, text, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.attach_invoice_document(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.attach_invoice_document(uuid, uuid) TO authenticated, service_role;

-- Source: 20260719000005_find_duplicate_invoice_documents.sql
REVOKE ALL ON FUNCTION public.find_duplicate_invoice_documents(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.find_duplicate_invoice_documents(uuid, text) TO authenticated, service_role;

-- Source: 20260719000006_unlimited_approval_flag.sql
REVOKE ALL ON FUNCTION public.update_user_approval_limit(uuid, numeric, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric, boolean) TO authenticated, service_role;

-- Source: 20260719000009_org_remove_member_audit_log.sql
-- Found while testing this change: org_remove_member had NO execute grant for any
-- non-superuser role at all (not authenticated, not service_role) -- Postgres silently drops
-- the implicit PUBLIC default the moment any explicit GRANT/REVOKE ever touches a function,
-- and nothing in this function's migration history (042_org_member_management_rpcs.sql,
-- 128_fix_lint_errors.sql, 20260709000002_fix_legacy_roles_in_access_functions.sql) ever
-- re-granted it. This was a pre-existing bug -- nobody could actually call this RPC before
-- now. Matches CLAUDE.md's own "Prod != local on grants" warning.
REVOKE ALL ON FUNCTION public.org_remove_member(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.org_remove_member(uuid, uuid) TO authenticated;

-- Source: 20260719000011_missing_product_crud_rpcs.sql
REVOKE ALL ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_product_safe(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;

-- Source: 20260719000014_product_approval_workflow.sql
REVOKE ALL ON FUNCTION public.get_product_approval_setting(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_product_approval_setting(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_product_approval_setting(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_product_approval_setting(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_product_change(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_product_change(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_product_change(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reject_product_change(uuid, text) TO authenticated;

-- Source: 20260719000016_org_document_storage_stats.sql
REVOKE ALL ON FUNCTION public.get_org_document_stats() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_org_document_stats() TO authenticated;

-- Source: 20260719000017_organization_profile_details.sql
-- 13.5: org profile details (name/address/tax ID/contact) for a dedicated tab on
-- OrgManagement.jsx. Flat columns on organizations, matching the existing vendors table's
-- address/contact convention rather than the separate organization_addresses table (that
-- table is a per-user onboarding/USPS-validation artifact with its own stale-role-vocabulary
-- RLS bug -- out of scope here; these are plain informational profile fields, not verified
-- addresses). tax_id is informational only, distinct from business_verifications' EIN/SSN
-- identity-verification record.
--
-- Also fixes a live bug this surfaced: OrgManagement.jsx's org list query already selects
-- `admin_email:primary_contact_email`, a column that has never existed -- every load of that
-- query has been failing with PostgREST's "column does not exist", silently emptying the
-- Hierarchy tab for every user. primary_contact_email now exists.
--
-- No RLS changes needed: organizations_write_scope already correctly gates UPDATE to
-- org_manager (own org) / tenant_super_admin (own tenant) / platform_admin.
--
-- Also surfaced: `authenticated` has NO table-level grant on organizations at all locally
-- (not even SELECT) -- confirmed via information_schema.role_table_grants and a direct
-- `SET ROLE authenticated; SELECT ...` probe, both "permission denied for table
-- organizations". This makes organizations_select_scope/organizations_write_scope
-- (20260718000002_organizations_rls_hierarchy_rebuild.sql) entirely dead on local Docker --
-- no authenticated user can read or write this table regardless of RLS, which also means
-- OrgManagement.jsx's existing "my-organizations" query has never worked locally. This is
-- the "prod != local on grants" gap CLAUDE.md already flags (prod likely has the grant from
-- outside the migration history); adding it here is required for both this feature and the
-- pre-existing Hierarchy tab to function against local Docker at all. INSERT/DELETE
-- deliberately excluded, matching that migration's own documented reasoning (SECURITY
-- DEFINER onboarding functions own INSERT; no DELETE policy exists on this table).
-- Also strips the fossil TRUNCATE/REFERENCES/TRIGGER grants (the same pattern already
-- cleaned up on brands/locations/profiles in the Context plumbing step) rather than layering
-- SELECT/UPDATE on top of them.
REVOKE ALL ON public.organizations FROM anon, authenticated;

GRANT SELECT, UPDATE ON public.organizations TO authenticated;

-- Source: 20260719000018_vendor_custom_fields.sql
-- Remove legacy overly-permissive policy that bypasses reference_scope_writable
DROP POLICY IF EXISTS "Tenant_Isolation_vendors" ON public.vendors;

-- Source: 20260720000001_product_module_phase1_safe_rpcs.sql
GRANT EXECUTE ON FUNCTION public.get_product_dashboard_summary(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

-- Source: 20260720000003_product_ai_category_suggestions.sql
GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reject_product_category_suggestion(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;

-- Source: 20260720000004_fix_product_verification_queue_ambiguity.sql
GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;

-- Source: 20260720000005_product_catalog_counts_and_inventory_toggle.sql
GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

-- Source: 20260720000007_fix_inventory_toggle_tenant_roles.sql
GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated;

-- Source: 20260720000008_product_edit_rpc.sql
GRANT EXECUTE ON FUNCTION public.product_write_allowed(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

-- Source: 20260720000009_product_create_rpc_and_uppercase_names.sql
GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

-- Source: 20260720000010_fix_product_delete_tenant_roles.sql
GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;

-- Source: 20260720000011_backfill_approved_invoice_purchase_lines.sql
GRANT EXECUTE ON FUNCTION public.ensure_invoice_line_items_from_json(uuid) TO authenticated, service_role;

-- Source: 20260720000012_fix_purchase_report_scope_and_json_fallback.sql
GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;

-- Source: 20260720000013_fix_tenant_super_admin_visibility.sql
GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

-- Source: 20260720000015_username_login.sql
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_username_email(text) TO anon, authenticated;

-- Source: 20260720000016_check_payment_method.sql
GRANT EXECUTE ON FUNCTION public.confirm_check_payment_received(uuid, text) TO authenticated;

-- Source: 20260720000017_tax_identifier_vault_reveal.sql
GRANT EXECUTE ON FUNCTION public.reveal_my_tax_identifier() TO authenticated;

-- Source: 20260720000018_business_name_availability_check.sql
GRANT EXECUTE ON FUNCTION public.is_business_name_available(text) TO authenticated;

-- Source: 20260720000020_hierarchy_review_gate.sql
GRANT EXECUTE ON FUNCTION public.submit_onboarding_hierarchy_for_review(uuid, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.approve_onboarding_hierarchy(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reject_onboarding_hierarchy(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.request_onboarding_hierarchy_resubmit(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.platform_hierarchy_review_queue() TO authenticated;

-- Source: 20260720000023_fix_wastage_soft_delete_and_product_vendor_name.sql
GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer) TO authenticated, service_role;

-- Source: 20260720000025_usps_onboarding_address_validation_toggle.sql
GRANT EXECUTE ON FUNCTION public.update_onboarding_verification_settings(boolean, boolean, boolean) TO authenticated, service_role;

-- Source: 20260721000001_recipe_categories_phase1.sql
ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_categories_select ON public.recipe_categories;

CREATE POLICY recipe_categories_select ON public.recipe_categories
  FOR SELECT
  USING (organization_id = public.get_my_org() AND deleted_at IS NULL);

DROP POLICY IF EXISTS recipe_categories_manage ON public.recipe_categories;

CREATE POLICY recipe_categories_manage ON public.recipe_categories
  FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

GRANT SELECT, INSERT, UPDATE ON public.recipe_categories TO authenticated;

GRANT ALL ON public.recipe_categories TO service_role;

REVOKE ALL ON FUNCTION public.normalize_recipe_category_slug(text) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.ensure_default_recipe_categories(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.list_recipe_categories(uuid, boolean) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.create_recipe_category(text, text, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_recipe_category_counts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.normalize_recipe_category_slug(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_default_recipe_categories(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_recipe_categories(uuid, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_recipe_category(text, text, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_recipe_category_counts(uuid) TO authenticated, service_role;

-- Source: 20260721000002_recipe_categories_edit_delete.sql
REVOKE ALL ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.delete_recipe_category(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_recipe_category(uuid, uuid) TO authenticated, service_role;

-- Source: 20260721000003_recipe_categories_allow_default_edit_delete.sql
REVOKE ALL ON FUNCTION public.ensure_default_recipe_categories(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.delete_recipe_category(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_default_recipe_categories(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_recipe_category(uuid, text, text, boolean, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_recipe_category(uuid, uuid) TO authenticated, service_role;

-- Source: 20260721000005_fix_product_category_type_and_accounting_sync.sql
GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.derive_product_category_type(text, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.product_accounting_category_for_type(text, text) TO authenticated, service_role;

-- Source: 20260721000006_manual_category_edit_approves_ai_review.sql
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean) TO authenticated;

-- Source: 20260721000007_fix_product_report_units_from_extracted_pack_size.sql
GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_invoice_line_items(uuid, jsonb) TO authenticated, service_role;

-- Source: 20260721000009_product_unit_conversion_pricing.sql
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric) TO authenticated;

-- Source: 20260721000010_category_performance_report.sql
GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_purchasing_spend_invoice(text, text, timestamptz)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

-- Source: 20260721000011_capture_tenant_super_admin_tenant_wide_scope.sql
GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

-- Source: 20260721000013_skip_banking_onboarding.sql
REVOKE ALL ON FUNCTION public.skip_banking_onboarding() FROM public;

GRANT EXECUTE ON FUNCTION public.skip_banking_onboarding() TO authenticated, service_role;

-- Source: 20260721000014_harden_skip_banking_onboarding.sql
REVOKE ALL ON FUNCTION public.skip_banking_onboarding() FROM public;

GRANT EXECUTE ON FUNCTION public.skip_banking_onboarding() TO authenticated, service_role;

-- Source: 20260721000017_mandatory_invoice_payment_scope_ids.sql
REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

-- Source: 20260721000018_production_onboarding_security_hardening.sql
ALTER TABLE public.onboarding_hierarchy_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboarding_hierarchy_submissions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.onboarding_hierarchy_submissions FROM public, anon, authenticated;

GRANT ALL ON TABLE public.onboarding_hierarchy_submissions TO service_role;

DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_select ON public.onboarding_hierarchy_submissions;

DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_insert ON public.onboarding_hierarchy_submissions;

DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_update ON public.onboarding_hierarchy_submissions;

DROP POLICY IF EXISTS onboarding_hierarchy_submissions_no_direct_delete ON public.onboarding_hierarchy_submissions;

CREATE POLICY onboarding_hierarchy_submissions_no_direct_select
  ON public.onboarding_hierarchy_submissions
  FOR SELECT
  TO authenticated
  USING (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_insert
  ON public.onboarding_hierarchy_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_update
  ON public.onboarding_hierarchy_submissions
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY onboarding_hierarchy_submissions_no_direct_delete
  ON public.onboarding_hierarchy_submissions
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(text, text) FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(text, text, text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- Source: 20260721000019_production_reporting_and_backup_hardening.sql
DROP POLICY IF EXISTS "Service role can manage db backups" ON storage.objects;

CREATE POLICY "Service role can manage db backups" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'db-backups')
  WITH CHECK (bucket_id = 'db-backups');

DROP POLICY IF EXISTS "Authenticated users cannot read db backups" ON storage.objects;

CREATE POLICY "Authenticated users cannot read db backups" ON storage.objects
  FOR SELECT TO authenticated
  USING (false);

REVOKE ALL ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE) TO authenticated;

-- Source: 20260721000020_invoice_module_production_hardening.sql
DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_read" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_insert" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_org_delete" ON storage.objects;

DROP POLICY IF EXISTS "invoices_bucket_service_role" ON storage.objects;

CREATE POLICY "invoices_bucket_org_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_auth_org()::text
);

CREATE POLICY "invoices_bucket_service_role"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

REVOKE ALL ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_financial_actor(UUID, TEXT[]) TO service_role;

REVOKE ALL ON public.invoice_production_anomalies FROM PUBLIC, anon;

GRANT SELECT ON public.invoice_production_anomalies TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- Source: 20260721000021_invoice_anomaly_review_workflow.sql
ALTER TABLE public.invoice_anomaly_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_anomaly_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_anomaly_reviews_select ON public.invoice_anomaly_reviews;

CREATE POLICY invoice_anomaly_reviews_select
ON public.invoice_anomaly_reviews
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, NULL)
);

DROP POLICY IF EXISTS invoice_anomaly_reviews_insert ON public.invoice_anomaly_reviews;

CREATE POLICY invoice_anomaly_reviews_insert
ON public.invoice_anomaly_reviews
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, NULL, false)
);

REVOKE ALL ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON public.invoice_production_anomalies FROM PUBLIC, anon;

GRANT SELECT ON public.invoice_production_anomalies TO authenticated, service_role;

-- Source: 20260721000023_db_lint_warning_cleanup.sql
REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

-- Source: 20260721000040_price_movers_report.sql
GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

-- Source: 20260721000050_inventory_usage_report.sql
GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO authenticated, service_role;

-- Source: 20260721190000_require_exact_location_match_for_org_wide_roles.sql
GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

-- Source: 20260721191500_require_active_location_for_reference_data.sql
GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

-- Source: 20260721200000_fix_integration_cron_and_manual_payment_payout.sql
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- Source: 20260721202000_dashboard_role_and_pos_webhook_hardening.sql
REVOKE ALL ON FUNCTION public.can_access_dashboard_scope(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_access_dashboard_scope(uuid, uuid, uuid, text) TO authenticated, service_role;

-- Source: 20260722000001_accept_invitation_upserts_profile.sql
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- Source: 20260722000002_notification_delivery_preferences.sql
ALTER TABLE public.notification_delivery_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_delivery_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_preferences_select_own ON public.notification_delivery_preferences;

CREATE POLICY notification_delivery_preferences_select_own
ON public.notification_delivery_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_insert_own ON public.notification_delivery_preferences;

CREATE POLICY notification_delivery_preferences_insert_own
ON public.notification_delivery_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_update_own ON public.notification_delivery_preferences;

CREATE POLICY notification_delivery_preferences_update_own
ON public.notification_delivery_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_delivery_preferences_delete_own ON public.notification_delivery_preferences;

CREATE POLICY notification_delivery_preferences_delete_own
ON public.notification_delivery_preferences
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_delivery_preferences TO authenticated;

GRANT ALL ON public.notification_delivery_preferences TO service_role;

-- Source: 20260722000004_restore_dim_date_for_invoice_fact_sync.sql
GRANT EXECUTE ON FUNCTION public.ensure_dim_date(date) TO authenticated, service_role;

-- Source: 20260722000010_configurable_payment_approval_controls.sql
GRANT EXECUTE ON FUNCTION public.get_payment_approval_settings(uuid, uuid, uuid) TO authenticated, service_role;

-- Source: 20260722000012_sync_approved_invoice_products_to_inventory.sql
GRANT EXECUTE ON FUNCTION public.ensure_inventory_for_invoiced_products(uuid) TO authenticated, service_role;

-- Source: 20260722000013_allow_tenant_super_admin_invoice_org_guard.sql
REVOKE ALL ON FUNCTION public.assert_org_actor(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_org_actor(UUID) TO service_role;

-- Source: 20260722000014_org_level_reference_scope_visible.sql
GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_product_catalog(uuid, uuid, uuid, text, text, integer, integer)
  TO authenticated, service_role;

-- Source: 20260722000015_audit_logs_hierarchy_visibility.sql
GRANT EXECUTE ON FUNCTION public.audit_log_scope_visible(uuid, uuid, uuid) TO authenticated;

-- 3. Drop all 4 existing policies (parent + 3 partitions -- this table does NOT rely on
--    policy inheritance, all 4 currently carry an identical explicit predicate), replace
--    with the hierarchy version.
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;

DROP POLICY IF EXISTS audit_logs_default_admin_select ON public.audit_logs_default;

DROP POLICY IF EXISTS audit_logs_y2025_admin_select ON public.audit_logs_y2025;

DROP POLICY IF EXISTS audit_logs_y2026_admin_select ON public.audit_logs_y2026;

CREATE POLICY audit_logs_hierarchy_select ON public.audit_logs
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));

CREATE POLICY audit_logs_default_hierarchy_select ON public.audit_logs_default
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));

CREATE POLICY audit_logs_y2025_hierarchy_select ON public.audit_logs_y2025
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));

CREATE POLICY audit_logs_y2026_hierarchy_select ON public.audit_logs_y2026
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));

-- Source: 20260722000016_product_count_units.sql
ALTER TABLE public.product_count_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_count_units_select ON public.product_count_units;

CREATE POLICY product_count_units_select ON public.product_count_units
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

DROP POLICY IF EXISTS product_count_units_insert ON public.product_count_units;

CREATE POLICY product_count_units_insert ON public.product_count_units
  FOR INSERT
  WITH CHECK (
    public.product_write_allowed(organization_id, brand_id, location_id)
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_count_units.product_id
        AND p.organization_id = product_count_units.organization_id
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS product_count_units_update ON public.product_count_units;

CREATE POLICY product_count_units_update ON public.product_count_units
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND public.product_write_allowed(organization_id, brand_id, location_id)
  )
  WITH CHECK (
    public.product_write_allowed(organization_id, brand_id, location_id)
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_count_units.product_id
        AND p.organization_id = product_count_units.organization_id
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS product_count_units_delete ON public.product_count_units;

CREATE POLICY product_count_units_delete ON public.product_count_units
  FOR DELETE
  USING (
    public.product_write_allowed(organization_id, brand_id, location_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_count_units TO authenticated;

-- Source: 20260722000017_product_count_unit_rpcs.sql
GRANT EXECUTE ON FUNCTION public.upsert_product_count_unit(uuid, text, numeric, text, numeric, numeric, text, numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.remove_product_count_unit(uuid) TO authenticated;

-- Source: 20260722000018_apply_invite_modules_to_onboarded_orgs.sql
REVOKE ALL ON FUNCTION public.get_invited_enabled_modules(uuid) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_tenant_enabled_modules(uuid) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_invited_enabled_modules(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_tenant_enabled_modules(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) TO service_role;

-- Source: 20260723000001_provider_neutral_ach_foundation.sql
CREATE POLICY bank_accounts_scope_select ON public.bank_accounts
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      public.get_auth_role() = 'platform_admin'
      OR organization_id = public.get_auth_org()
      OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant())
    )
  );

CREATE POLICY bank_accounts_scope_insert ON public.bank_accounts
  FOR INSERT WITH CHECK (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  );

CREATE POLICY bank_accounts_scope_update ON public.bank_accounts
  FOR UPDATE USING (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  )
  WITH CHECK (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  );

CREATE POLICY payment_provider_compliance_profiles_read ON public.payment_provider_compliance_profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY provider_country_rules_read ON public.provider_country_rules
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

REVOKE ALL ON public.bank_accounts FROM anon, authenticated;

REVOKE ALL ON public.bank_account_provider_links FROM anon, authenticated;

REVOKE ALL ON public.payment_provider_configs FROM anon, authenticated;

REVOKE ALL ON public.payment_terms_acceptances FROM anon, authenticated;

REVOKE ALL ON public.provider_requirement_snapshots FROM anon, authenticated;

REVOKE ALL ON public.provider_risk_reviews FROM anon, authenticated;

REVOKE ALL ON public.provider_active_account_fees FROM anon, authenticated;

REVOKE ALL ON public.payment_fee_policies FROM anon, authenticated;

REVOKE ALL ON public.payment_fee_events FROM anon, authenticated;

REVOKE ALL ON public.payment_provider_events FROM anon, authenticated;

GRANT SELECT (
  id, tenant_id, organization_id, brand_id, location_id, owner_type, owner_id,
  payment_account_id, account_holder_name, bank_name, account_type,
  routing_last4, account_last4, verification_status, default_for_owner,
  is_active, created_by_user_id, created_by_role, approved_by_user_id,
  approved_by_role, approved_at, metadata, created_at, updated_at, deleted_at
) ON public.bank_accounts TO authenticated;

GRANT SELECT ON public.bank_account_provider_links TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.payment_provider_configs TO authenticated;

GRANT SELECT ON public.payment_provider_compliance_profiles TO authenticated;

GRANT SELECT, INSERT ON public.payment_terms_acceptances TO authenticated;

GRANT SELECT ON public.provider_country_rules TO authenticated;

GRANT SELECT ON public.provider_requirement_snapshots TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.provider_risk_reviews TO authenticated;

GRANT SELECT ON public.provider_active_account_fees TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.payment_fee_policies TO authenticated;

GRANT SELECT, INSERT ON public.payment_fee_events TO authenticated;

GRANT SELECT ON public.payment_provider_events TO authenticated;

GRANT ALL ON public.bank_accounts TO service_role;

GRANT ALL ON public.bank_account_provider_links TO service_role;

GRANT ALL ON public.payment_provider_configs TO service_role;

GRANT ALL ON public.payment_provider_compliance_profiles TO service_role;

GRANT ALL ON public.payment_terms_acceptances TO service_role;

GRANT ALL ON public.provider_country_rules TO service_role;

GRANT ALL ON public.provider_requirement_snapshots TO service_role;

GRANT ALL ON public.provider_risk_reviews TO service_role;

GRANT ALL ON public.provider_active_account_fees TO service_role;

GRANT ALL ON public.payment_fee_policies TO service_role;

GRANT ALL ON public.payment_fee_events TO service_role;

GRANT ALL ON public.payment_provider_events TO service_role;

REVOKE ALL ON FUNCTION public.store_bank_account_secret(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_bank_account_secret_for_provider(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_payment_provider_config(uuid, uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_payment_provider_event(jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.store_bank_account_secret(uuid, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_bank_account_secret_for_provider(uuid) TO service_role;

-- Source: 20260723000002_repair_invoice_anomaly_review_contract.sql
ALTER TABLE public.invoice_anomaly_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_anomaly_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_anomaly_reviews_select ON public.invoice_anomaly_reviews;

CREATE POLICY invoice_anomaly_reviews_select
ON public.invoice_anomaly_reviews
FOR SELECT
USING (
  public.financial_scope_visible(organization_id, brand_id, location_id, NULL)
);

DROP POLICY IF EXISTS invoice_anomaly_reviews_insert ON public.invoice_anomaly_reviews;

CREATE POLICY invoice_anomaly_reviews_insert
ON public.invoice_anomaly_reviews
FOR INSERT
WITH CHECK (
  public.financial_scope_writable(organization_id, brand_id, location_id, NULL, false)
);

REVOKE ALL ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_anomaly_review(uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON public.invoice_production_anomalies FROM PUBLIC, anon;

GRANT SELECT ON public.invoice_production_anomalies TO authenticated, service_role;

-- Source: 20260723000004_repair_configurable_self_approval_setting.sql
REVOKE ALL ON FUNCTION public.get_payment_approval_settings(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_payment_approval_settings(uuid, uuid, uuid) TO authenticated, service_role;

-- Source: 20260723000005_sync_report_unit_source_price.sql
GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

-- Source: 20260723000007_restore_ui_driven_invoice_payment_workflow.sql
REVOKE ALL ON FUNCTION public.is_invoice_payment_ready(text, text, text, numeric, numeric) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_invoice_payment_ready(text, text, text, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- Source: 20260723000008_inventory_module_production_hardening.sql
ALTER TABLE public.inventory_pos_usage_approvals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_pos_usage_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_pos_usage_approvals_select ON public.inventory_pos_usage_approvals;

CREATE POLICY inventory_pos_usage_approvals_select
  ON public.inventory_pos_usage_approvals
  FOR SELECT
  USING (public.tenant_scope_visible(organization_id, NULL, location_id, NULL));

DROP POLICY IF EXISTS inventory_pos_usage_approvals_insert ON public.inventory_pos_usage_approvals;

CREATE POLICY inventory_pos_usage_approvals_insert
  ON public.inventory_pos_usage_approvals
  FOR INSERT
  WITH CHECK (public.tenant_scope_writable(organization_id, NULL, location_id, NULL, false));

-- RLS cleanup: remove known legacy org-wide policies and enforce exact-location helpers.
DROP POLICY IF EXISTS inventory_select_org ON public.inventory;

DROP POLICY IF EXISTS inventory_insert_org ON public.inventory;

DROP POLICY IF EXISTS inventory_update_org ON public.inventory;

DROP POLICY IF EXISTS "Tenant_Isolation_wastage_logs" ON public.wastage_logs;

DROP POLICY IF EXISTS "Tenant_Isolation_auto_orders" ON public.auto_orders;

DROP POLICY IF EXISTS "Count_sessions org read access" ON public.count_sessions;

DROP POLICY IF EXISTS "Count_sessions org write access" ON public.count_sessions;

DROP POLICY IF EXISTS "Count_sheets org read access" ON public.count_sheets;

DROP POLICY IF EXISTS "Count_sheets org write access" ON public.count_sheets;

DROP POLICY IF EXISTS batch3a_count_sheets_select ON public.count_sheets;

DROP POLICY IF EXISTS batch3a_count_sheets_insert ON public.count_sheets;

DROP POLICY IF EXISTS batch3a_count_sheets_update ON public.count_sheets;

CREATE POLICY batch3a_count_sheets_select ON public.count_sheets
  FOR SELECT USING (public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY batch3a_count_sheets_insert ON public.count_sheets
  FOR INSERT WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true));

CREATE POLICY batch3a_count_sheets_update ON public.count_sheets
  FOR UPDATE USING (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  WITH CHECK (public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true));

DROP POLICY IF EXISTS batch3a_count_sessions_select ON public.count_sessions;

DROP POLICY IF EXISTS batch3a_count_sessions_insert ON public.count_sessions;

DROP POLICY IF EXISTS batch3a_count_sessions_update ON public.count_sessions;

CREATE POLICY batch3a_count_sessions_select ON public.count_sessions
  FOR SELECT USING (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_visible(organization_id, count_sheet_id))
    OR (count_sheet_id IS NULL AND public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at))
  );

CREATE POLICY batch3a_count_sessions_insert ON public.count_sessions
  FOR INSERT WITH CHECK (
    (count_sheet_id IS NOT NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true))
  );

CREATE POLICY batch3a_count_sessions_update ON public.count_sessions
  FOR UPDATE USING (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  )
  WITH CHECK (
    (count_sheet_id IS NOT NULL AND deleted_at IS NULL AND public.batch3a_count_sheet_writable(organization_id, count_sheet_id, true))
    OR (count_sheet_id IS NULL AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true))
  );

ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.receiving_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view purchase order items" ON public.purchase_order_items;

DROP POLICY IF EXISTS "Manager+ can manage purchase order items" ON public.purchase_order_items;

CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_visible(po.organization_id, NULL, po.location_id, NULL)
    )
  );

CREATE POLICY "Manager+ can manage purchase order items" ON public.purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_writable(po.organization_id, NULL, po.location_id, NULL, false)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.tenant_scope_writable(po.organization_id, NULL, po.location_id, NULL, false)
    )
  );

DROP POLICY IF EXISTS "Users can view receiving items" ON public.receiving_items;

DROP POLICY IF EXISTS "Manager+ can manage receiving items" ON public.receiving_items;

CREATE POLICY "Users can view receiving items" ON public.receiving_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_visible(r.organization_id, NULL, r.location_id, NULL)
    )
  );

CREATE POLICY "Manager+ can manage receiving items" ON public.receiving_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_writable(r.organization_id, NULL, r.location_id, NULL, false)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receivings r
      WHERE r.id = receiving_items.receiving_id
        AND public.tenant_scope_writable(r.organization_id, NULL, r.location_id, NULL, false)
    )
  );

REVOKE EXECUTE ON FUNCTION public.complete_count_session(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.complete_inventory_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.approve_daily_pos_usage(uuid, date, uuid, uuid, jsonb) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.execute_inventory_depletion(uuid, jsonb) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.log_inventory_waste(uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.delete_inventory_waste(uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, uuid, numeric, text, numeric, text, uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.fulfill_intercompany_transfer(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_inventory_rpc_access(uuid, uuid, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_count_session(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_inventory_transfer(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, uuid, jsonb, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_daily_pos_usage(uuid, date, uuid, uuid, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.execute_inventory_depletion(uuid, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_inventory_count_session(uuid, uuid, uuid, uuid, text, text, date, jsonb, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.close_inventory_count_session(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_inventory_count_session(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.log_inventory_waste(uuid, uuid, uuid, uuid, text, text, numeric, text, text, text, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_inventory_waste(uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, uuid, uuid, numeric, text, numeric, text, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fulfill_intercompany_transfer(uuid, uuid, uuid) TO authenticated, service_role;

-- Source: 20260723000008_notification_preferences_delivery_lookup.sql
-- Allow same-organization notification delivery code to honor recipient preferences.
-- Exposes only the existing preference rows to authenticated users in the same org;
-- writes remain restricted to the preference owner by the original policies.

DROP POLICY IF EXISTS notification_delivery_preferences_select_same_org ON public.notification_delivery_preferences;

CREATE POLICY notification_delivery_preferences_select_same_org
ON public.notification_delivery_preferences
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = notification_delivery_preferences.organization_id
  )
);

-- Source: 20260723000009_provider_neutral_ach_operations.sql
GRANT SELECT (
  id, tenant_id, organization_id, brand_id, location_id, owner_type, owner_id,
  purpose, nickname, payment_account_id, account_holder_name, bank_name, account_type,
  routing_last4, account_last4, verification_status, default_for_owner,
  is_active, created_by_user_id, created_by_role, approved_by_user_id,
  approved_by_role, approved_at, metadata, created_at, updated_at, deleted_at
) ON public.bank_accounts TO authenticated;

GRANT SELECT ON public.payment_fee_counters TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.clear_bank_account_default_for_scope() TO service_role;

-- Source: 20260723000010_scope_vendor_documents_storage_rls.sql
-- vendor_documents_manager_read/write (both is_manager_or_above() only, no tenant scoping at
-- all) let any manager-tier user in ANY organization read/write ANY object in the bucket,
-- including other tenants' W-9s. _write was FOR ALL, which also covers SELECT -- so dropping
-- only _read and leaving _write in place would NOT have closed the read hole (Postgres ORs
-- permissive policies together, see CLAUDE.md workflow rules). Both must go.
DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;

DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;

-- SELECT/UPDATE/DELETE act on an object that (by the time it's read/modified) always has a
-- matching vendor_documents row -- submit-tax-info and the admin-upload flow both insert that
-- row using the exact same storage_path as storage.objects.name. Scope through that row with
-- the same reference_scope_visible/writable() functions the vendor_documents table itself
-- already uses, so storage access can never be broader than table access.
CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND public.is_manager_or_above()
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_visible(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at)
  )
);

CREATE POLICY vendor_documents_manager_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
)
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

CREATE POLICY vendor_documents_manager_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor_documents'
  AND EXISTS (
    SELECT 1 FROM public.vendor_documents vd
    WHERE vd.storage_path = storage.objects.name
      AND vd.deleted_at IS NULL
      AND public.reference_scope_writable(vd.organization_id, vd.brand_id, vd.location_id, vd.deleted_at, 'location_manager')
  )
);

-- INSERT is different: DocumentVault.jsx uploads to storage BEFORE the vendor_documents row
-- exists (admin_uploads/{vendor_id}/{timestamp}_{name}), so there's nothing to join yet. Scope
-- off the vendor_id embedded in the path instead, mirroring how the anon magic-link INSERT
-- policy already scopes off a value derived from the path (the token) rather than a row.
CREATE POLICY vendor_documents_manager_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name ~ '^admin_uploads/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = (split_part(storage.objects.name, '/', 2))::uuid
      AND public.reference_scope_writable(v.organization_id, v.brand_id, v.location_id, NULL, 'location_manager')
  )
);

-- Source: 20260723000014_admin_manual_vendor_tax_entry.sql
REVOKE ALL ON FUNCTION public.admin_submit_vendor_tax_info(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_submit_vendor_tax_info(uuid, text, text, text, text, uuid) TO authenticated;

-- Source: 20260723000014_custom_reports_module_builder.sql
REVOKE ALL ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[], UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.run_custom_report(TEXT[], TEXT, DATE, DATE, TEXT[], UUID) TO authenticated, service_role;

-- Source: 20260723000015_admin_manual_vendor_banking_entry.sql
REVOKE ALL ON FUNCTION public.admin_submit_vendor_banking_info(uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_submit_vendor_banking_info(uuid, text, text, text) TO authenticated;

-- Source: 20260724000000_hard_delete_invoice_workflow.sql
REVOKE ALL ON FUNCTION public.hard_delete_invoice_workflow(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hard_delete_invoice_workflow(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_invoice_workflow(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_invoice_workflow(UUID) TO authenticated, service_role;

-- Source: 20260724000001_grant_check_file_security_authenticated.sql
-- check_file_security() is SECURITY DEFINER (owned by postgres) but EXECUTE was never granted
-- to authenticated, even though it's called from the "Tenant Isolation Avatars Insert" storage
-- policy's WITH CHECK. Because Postgres evaluates every permissive policy attached to
-- storage.objects for a given command (not just the one whose bucket_id matches), calling this
-- function without permission throws "permission denied for function check_file_security" and
-- aborts the WHOLE insert -- for any authenticated user, in any bucket, not just avatars.
-- Confirmed live while testing the vendor_documents storage RLS fix this session.
GRANT EXECUTE ON FUNCTION public.check_file_security(text, jsonb) TO authenticated;

-- Source: 20260724000001_menu_item_authoring_edit.sql
revoke all on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.save_menu_item_phase1(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Source: 20260724000001_repair_invite_module_entitlements.sql
REVOKE ALL ON FUNCTION public.normalize_invited_module_keys(jsonb) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_invited_enabled_modules(uuid) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_tenant_enabled_modules(uuid) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_invited_enabled_modules(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_tenant_enabled_modules(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_invited_modules_to_tenant(uuid, uuid) TO service_role;

-- Source: 20260724000002_sync_auth_metadata_from_profile_after_invite.sql
GRANT EXECUTE ON FUNCTION public.sync_auth_metadata_from_profile(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- Source: 20260724000003_product_module_production_hardening.sql
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_barcodes_select ON public.product_barcodes;

CREATE POLICY product_barcodes_select ON public.product_barcodes
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

DROP POLICY IF EXISTS product_barcodes_write ON public.product_barcodes;

CREATE POLICY product_barcodes_write ON public.product_barcodes
  FOR ALL USING (public.product_write_allowed(organization_id, brand_id, location_id))
  WITH CHECK (public.product_write_allowed(organization_id, brand_id, location_id));

ALTER TABLE public.product_import_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_import_jobs_select ON public.product_import_jobs;

CREATE POLICY product_import_jobs_select ON public.product_import_jobs
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));

DROP POLICY IF EXISTS product_import_jobs_write ON public.product_import_jobs;

CREATE POLICY product_import_jobs_write ON public.product_import_jobs
  FOR ALL USING (public.product_write_allowed(organization_id, brand_id, location_id))
  WITH CHECK (public.product_write_allowed(organization_id, brand_id, location_id));

DROP POLICY IF EXISTS product_import_rows_select ON public.product_import_rows;

CREATE POLICY product_import_rows_select ON public.product_import_rows
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.reference_scope_visible(j.organization_id, j.brand_id, j.location_id, NULL)
  ));

DROP POLICY IF EXISTS product_import_rows_write ON public.product_import_rows;

CREATE POLICY product_import_rows_write ON public.product_import_rows
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.product_write_allowed(j.organization_id, j.brand_id, j.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.product_write_allowed(j.organization_id, j.brand_id, j.location_id)
  ));

-- ===== Grants =====

REVOKE ALL ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric, integer) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.soft_delete_product_safe(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.restore_product(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_product_barcode(uuid, text, text) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.remove_product_barcode(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.verify_vendor_item_mapping(uuid, numeric) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.merge_products(uuid, uuid, text) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.find_duplicate_products(uuid, text, integer) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.stage_product_import(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.commit_product_import(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric, integer) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.restore_product(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_product_barcode(uuid, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.remove_product_barcode(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.verify_vendor_item_mapping(uuid, numeric) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.merge_products(uuid, uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.find_duplicate_products(uuid, text, integer) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.stage_product_import(uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commit_product_import(uuid) TO authenticated, service_role;

-- Source: 20260724000004_vendor_archive_mechanism.sql
DROP POLICY IF EXISTS operational_vendors_select ON public.vendors;

DROP POLICY IF EXISTS operational_vendors_insert ON public.vendors;

DROP POLICY IF EXISTS operational_vendors_update ON public.vendors;

CREATE POLICY operational_vendors_select ON public.vendors
  FOR SELECT USING (reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_vendors_insert ON public.vendors
  FOR INSERT WITH CHECK (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_vendors_update ON public.vendors
  FOR UPDATE
  USING (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

REVOKE ALL ON FUNCTION public.archive_vendor(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.restore_vendor(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_vendor(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_vendor(uuid) TO authenticated;

-- Source: 20260725000002_client_feedback_issue_suggestions.sql
ALTER TABLE public.platform_feedback_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_feedback_settings_read ON public.platform_feedback_settings;

CREATE POLICY platform_feedback_settings_read
  ON public.platform_feedback_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS platform_feedback_settings_admin_update ON public.platform_feedback_settings;

CREATE POLICY platform_feedback_settings_admin_update
  ON public.platform_feedback_settings FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

ALTER TABLE public.client_feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_feedback_insert_own ON public.client_feedback_submissions;

CREATE POLICY client_feedback_insert_own
  ON public.client_feedback_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS client_feedback_read_own_or_platform ON public.client_feedback_submissions;

CREATE POLICY client_feedback_read_own_or_platform
  ON public.client_feedback_submissions FOR SELECT
  USING (public.get_auth_role() = 'platform_admin' OR user_id = auth.uid());

DROP POLICY IF EXISTS client_feedback_platform_update ON public.client_feedback_submissions;

CREATE POLICY client_feedback_platform_update
  ON public.client_feedback_submissions FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

GRANT SELECT ON public.platform_feedback_settings TO authenticated;

GRANT SELECT, INSERT ON public.client_feedback_submissions TO authenticated;

GRANT UPDATE ON public.client_feedback_submissions TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_platform_feedback_settings() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_platform_feedback_settings(TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- Source: 20260726000001_team_invite_access_permissions.sql
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text, jsonb) TO authenticated, service_role;

-- Source: 20260726000005_harden_performance_report_scope.sql
-- Performance analytics are location-scoped in the application. Run these report
-- RPCs as the caller so table RLS and tenant_scope_visible() enforce the active
-- organization/location instead of relying on client-supplied parameters alone.
ALTER FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) SECURITY INVOKER;

ALTER FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) SECURITY INVOKER;

ALTER FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) SECURITY INVOKER;

-- Source: 20260726190000_validation_hard_locks.sql
REVOKE ALL ON FUNCTION public.invoice_hard_validation_failures(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.invoice_hard_validation_failures(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.validate_onboarding_address_payload(jsonb, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.validate_onboarding_hierarchy_payload(jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_onboarding_hierarchy_for_review(uuid, jsonb) TO authenticated, service_role;

-- Source: 20260727000001_strict_location_performance_security.sql
REVOKE ALL ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  TO authenticated, service_role;

-- Normal application users must enter through the validating wrappers.
REVOKE EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_location_performance_budget(
  uuid, uuid, date, date, text, numeric
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.delete_location_performance_budget(
  uuid, uuid, date, date, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_location_performance_budget(
  uuid, uuid, date, date, text, numeric
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.delete_location_performance_budget(
  uuid, uuid, date, date, text
) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.budget_targets FROM authenticated;

-- Source: 20260727000002_align_performance_with_active_hierarchy.sql
REVOKE ALL ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  TO authenticated, service_role;

-- Source: 20260727000003_enrich_location_inventory_usage_evidence.sql
REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

-- Source: 20260727020000_close_unguarded_write_rpc_scope.sql
REVOKE EXECUTE ON FUNCTION public.record_payment_ledger(uuid, uuid, uuid, text, numeric, timestamptz, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.resolve_payment_provider_config(uuid, uuid, uuid, uuid) FROM anon;

-- Source: 20260727020000_restore_performance_report_rpc_execute_grants.sql
GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO authenticated, service_role;

-- Source: 20260727030000_close_unguarded_event_and_usage_rpc_scope.sql
REVOKE EXECUTE ON FUNCTION public.generate_daily_theoretical_usage(uuid, date) FROM anon;

-- Source: 20260727030000_resecure_performance_base_report_rpcs.sql
-- Final-state guard after 20260727020000. Normal authenticated Performance
-- clients must use the single-location wrappers, which assert the active
-- organization -> brand -> location hierarchy. Keep the shared base functions
-- available to service_role and to the SECURITY DEFINER wrappers only.
REVOKE EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_category_performance_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, text, text[]
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_category_performance_drilldown(
  uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_report(
  uuid, uuid[], date, date, text[], text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

-- Source: 20260727060000_correct_performance_budget_scope.sql
REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

-- Source: 20260727070000_expose_price_mover_impact_evidence.sql
REVOKE EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

-- Source: 20260727080000_location_timezone_performance_reports.sql
REVOKE ALL ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_performance_location_timezone(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, text, text[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_category_performance_drilldown(
  uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_price_movers_report(
  uuid, uuid, date, date, date, date, text[], uuid[], text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_price_movers_drilldown(
  uuid, uuid, uuid, text, date, date, date, date, uuid[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid, date, date, text
) TO authenticated, service_role;

-- Source: 20260727110000_performance_scalability_bounds.sql
REVOKE ALL ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_location_performance_overview_rollup(uuid, uuid, date, date)
  TO authenticated, service_role;

-- Source: 20260727120000_finish_price_movers_security_invoker.sql
ALTER FUNCTION public.get_price_movers_report(
  uuid, uuid[], date, date, date, date, text[], uuid[], text, uuid
) SECURITY INVOKER;

ALTER FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) SECURITY INVOKER;

-- Source: 20260727150000_fix_performance_drilldown_rpc_coherence.sql
REVOKE EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_inventory_usage_drilldown(
  uuid, uuid, uuid, uuid[], date, date, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_price_movers_drilldown(
  uuid, uuid, text, uuid[], date, date, date, date, uuid[], text
) TO service_role;

