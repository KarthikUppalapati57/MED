-- ============================================================
-- MEVS SAAS TRANSFORMATION: HIERARCHY & TENANT ISOLATION
-- ============================================================

-- 1. CLEANUP OLD HELPERS (to avoid conflicts)
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS is_manager_or_above() CASCADE;
DROP FUNCTION IF EXISTS is_owner_or_admin() CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- 2. ORGANIZATIONS (TOP-LEVEL TENANT)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    subscription_plan TEXT DEFAULT 'free',
    owner_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. BRANDS (SUB-TENANT)
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. LOCATIONS (PHYSICAL UNITS)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. UPDATE PROFILES
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id),
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id),
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id),
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'location' CHECK (access_level IN ('platform', 'organization', 'brand', 'location'));

-- Update role check to include platform_admin
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin', 'platform_admin'));

-- 6. ADD TENANT ID TO ALL BUSINESS TABLES (Safely)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        -- Only attempt to alter if the table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id)', t);
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id)', t);
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping...', t;
        END IF;
    END LOOP;
END $$;

-- 7. APPLY STRICT TENANT ISOLATION POLICIES (Safely)
DO $$
DECLARE
    t text;
    pol_name text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            pol_name := 'RLS_SaaS_Isolation_' || t;
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
            -- Using raw jwt access to avoid schema permission issues
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (
                (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''platform_admin'') OR 
                (organization_id = (auth.jwt() -> ''user_metadata'' ->> ''organization_id'')::uuid)
            )', pol_name, t);
        END IF;
    END LOOP;
END $$;

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
