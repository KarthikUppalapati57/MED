-- ============================================================
-- MEVS - SUPER SYNC & SCHEMA RECONCILIATION
-- CONSOLIDATES ALL MIGRATIONS (001-007) + RLS REPAIRS
-- ============================================================

-- 1. PURGE RECURSION LOOPS
-- Drop all table-querying functions that cause HANGS in RLS
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_manager_or_above() CASCADE;
DROP FUNCTION IF EXISTS public.is_owner_or_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 2. HIGH-PERFORMANCE JWT HELPERS
-- These do ZERO table queries, so they NEVER hang.
CREATE OR REPLACE FUNCTION public.get_auth_role() RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'ground_staff');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_org() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. ENSURE ALL CORE TABLES HAVE FULL COLUMNS (Merging 001-007)
-- We use ADD COLUMN IF NOT EXISTS to avoid deleting existing data.

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan_id TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Brands & Locations
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (Auth extension)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT DEFAULT 'ground_staff',
    organization_id UUID REFERENCES public.organizations(id),
    brand_id UUID REFERENCES public.brands(id),
    location_id UUID REFERENCES public.locations(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Repair Business Tables (Adding SaaS columns if missing)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id)', t);
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id)', t);
        END IF;
    END LOOP;
END $$;

-- 4. REGENERATE CLEAN RLS POLICIES
-- This block wipes all policies and replaces them with the Sync v4 logic.
DO $$
DECLARE
    pol RECORD;
    t text;
BEGIN
    -- WIPE
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;

    -- REBUILD
    FOR t IN SELECT unnest(ARRAY['profiles', 'invitations', 'notifications', 'vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'organizations', 'brands', 'locations'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            
            -- Platform Admin Override
            EXECUTE format('CREATE POLICY "Platform_Admin_Full" ON public.%I FOR ALL USING (public.get_auth_role() = ''platform_admin'')', t);
            
            -- Tenant Isolation (Primary Rule)
            IF t = 'organizations' THEN
                CREATE POLICY "Org_Self_Access" ON public.organizations FOR SELECT USING (id = public.get_auth_org());
            ELSIF t = 'profiles' THEN
                CREATE POLICY "Profile_Self_Access" ON public.profiles FOR ALL USING (auth.uid() = id);
                CREATE POLICY "Profile_Org_Visibility" ON public.profiles FOR SELECT USING (organization_id = public.get_auth_org());
            ELSE
                EXECUTE format('CREATE POLICY "Tenant_Isolation_%I" ON public.%I FOR ALL USING (organization_id = public.get_auth_org())', t, t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- 5. STORAGE POLICIES
-- Ensure storage bucket logic is also using the faster helpers
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;

CREATE POLICY "Storage_Org_Isolation_Select" ON storage.objects FOR SELECT USING (
    bucket_id IN ('invoices', 'avatars') AND (
        (public.get_auth_role() = 'platform_admin') OR
        ((storage.foldername(name))[1] = public.get_auth_org()::text)
    )
);

-- 6. AUDIT LOGGING (Fix possible circular triggers)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit_Log_Isolation" ON public.audit_logs FOR SELECT USING (
    organization_id = public.get_auth_org() OR public.get_auth_role() = 'platform_admin'
);

-- 7. PROMOTION (Hard-code your account to platform_admin for recovery)
DO $$
DECLARE
    target_uid UUID;
BEGIN
    SELECT id INTO target_uid FROM auth.users WHERE email = 'uppalapatisivasaipavankarthik@gmail.com' LIMIT 1;
    
    IF target_uid IS NOT NULL THEN
        -- Sync Profile
        INSERT INTO public.profiles (id, email, role)
        VALUES (target_uid, 'uppalapatisivasaipavankarthik@gmail.com', 'platform_admin')
        ON CONFLICT (id) DO UPDATE SET role = 'platform_admin';
        
        -- Sync JWT Metadata
        UPDATE auth.users 
        SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'platform_admin')
        WHERE id = target_uid;
    END IF;
END $$;

-- 8. SYSTEM HEALTH CHECK
DROP VIEW IF EXISTS public.health_monitor;
CREATE OR REPLACE VIEW public.health_monitor AS
SELECT 
    (SELECT count(*) FROM public.organizations) as total_orgs,
    (SELECT count(*) FROM public.profiles) as total_users,
    (SELECT count(*) FROM public.invoices) as total_invoices,
    public.get_auth_role() as active_role,
    public.get_auth_org() as active_org_id;
GRANT SELECT ON public.health_monitor TO authenticated;
