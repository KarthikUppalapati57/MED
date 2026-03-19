-- ============================================================
-- 006: MEVS SAAS READINESS - PERFORMANCE & AUDITING
-- ============================================================

-- 1. PERFORMANCE: ADD MISSING INDICES FOR TENANT ISOLATION
-- This ensures that as data grows, cross-org queries remain fast
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_brands_organization_id ON public.brands(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_organization_id ON public.locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_brand_id ON public.locations(brand_id);

-- Apply indices to all business tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        -- Only create indices if the table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_' || t || '_org_id', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(location_id)', 'idx_' || t || '_loc_id', t);
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping indices...', t;
        END IF;
    END LOOP;
END $$;

-- 2. SUBSCRIPTIONS & PLANS
-- Allows for different tiers (Free, Pro, Enterprise)
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly NUMERIC(10,2) NOT NULL,
    features JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed basic plans
INSERT INTO public.plans (id, name, description, price_monthly, features)
VALUES 
    ('free', 'Free Tier', 'Perfect for small venues', 0.00, '{"max_locations": 1, "max_users": 5}'),
    ('pro', 'Pro Plan', 'Everything for growing restaurants', 99.00, '{"max_locations": 5, "max_users": 20, "analytics": true}'),
    ('enterprise', 'Enterprise', 'Custom solutions for chains', 499.00, '{"max_locations": 999, "max_users": 999, "analytics": true, "audit_logs": true}')
ON CONFLICT (id) DO NOTHING;

-- Link organizations to plans
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.plans(id) DEFAULT 'free';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 3. AUDIT LOGGING
-- Tracks every change in the system for compliance
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
BEGIN
    -- Try to get user/org from session
    v_user_id := auth.uid();
    v_org_id := (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid;

    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, old_data)
        VALUES (COALESCE(OLD.organization_id, v_org_id), v_user_id, 'DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD)::jsonb);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, old_data, new_data)
        VALUES (COALESCE(NEW.organization_id, v_org_id), v_user_id, 'UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
        VALUES (COALESCE(NEW.organization_id, v_org_id), v_user_id, 'INSERT', TG_TABLE_NAME, NEW.id, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit trigger to high-importance tables
-- (Inventory, Payments, Invoices)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['inventory', 'payments', 'invoices', 'auto_orders'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', t);
            EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()', t);
        ELSE
            RAISE NOTICE 'Table % does not exist, skipping audit trigger...', t;
        END IF;
    END LOOP;
END $$;


-- 4. WEBHOOK IDEMPOTENCY
-- Prevent duplicate processing of Stripe/PayPal events
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE NOT NULL, -- Stripe Event ID or PayPal Webhook ID
    source TEXT NOT NULL, -- 'stripe', 'paypal'
    type TEXT, -- e.g., 'payment_intent.succeeded'
    data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

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
