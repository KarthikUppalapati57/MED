-- ============================================================
-- MEVS MASTER DEPLOYMENT SCRIPT
-- RUN THIS IN THE SUPABASE SQL EDITOR TO SYNCHRONIZE YOUR DB
-- ============================================================

-- 1. BASE SAAS HIERARCHY
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

CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. UPDATE PROFILES & PERMISSIONS
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id),
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id),
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id),
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'location' CHECK (access_level IN ('platform', 'organization', 'brand', 'location'));

DO $$ BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin', 'platform_admin'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. APPLY TENANT ID TO ALL TABLES
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id)', t);
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id)', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_' || t || '_org_id', t);
        END IF;
    END LOOP;
END $$;

-- 4. SUBSCRIPTION SYSTEM
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly NUMERIC(10,2) NOT NULL,
    features JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.plans (id, name, description, price_monthly, features)
VALUES 
    ('free', 'Free Tier', 'Perfect for small venues', 0.00, '{"max_locations": 1, "max_users": 5}'),
    ('pro', 'Pro Plan', 'Everything for growing restaurants', 99.00, '{"max_locations": 5, "max_users": 20, "analytics": true}'),
    ('enterprise', 'Enterprise', 'Custom solutions for chains', 499.00, '{"max_locations": 999, "max_users": 999, "analytics": true, "audit_logs": true}')
ON CONFLICT (id) DO NOTHING;

-- 5. AUDIT LOGGING
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. WEBHOOKS
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    type TEXT,
    data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. ENABLE RLS (Simplified for development)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
    pol_name text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            pol_name := 'RLS_SaaS_Isolation_' || t;
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (
                (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''platform_admin'') OR 
                (organization_id = (auth.jwt() -> ''user_metadata'' ->> ''organization_id'')::uuid)
            )', pol_name, t);
        END IF;
    END LOOP;
END $$;

-- 8. HEALTH CHECK VIEW
CREATE OR REPLACE VIEW public.system_health_check AS
SELECT 
    (SELECT count(*) FROM public.organizations) as org_count,
    (SELECT count(*) FROM public.profiles) as profile_count,
    (SELECT count(*) FROM public.invoices) as invoice_count;

GRANT SELECT ON public.system_health_check TO authenticated;
GRANT SELECT ON public.system_health_check TO anon;
