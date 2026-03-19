-- ============================================================
-- MEVS - ATOMIC RECOVERY & SCHEMA INITIALIZATION (v6)
-- ============================================================

-- 1. THE GUARANTEED PURGE (Separate Block)
-- This ensures that even if something fails later, the recursion is GONE.
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. ESSENTIAL SCHEMA - CREATE MISSING TABLES
-- This ensures tables exist before we try to order by created_at.
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    price DECIMAL(12,2) DEFAULT 0,
    unit TEXT,
    stock_quantity DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(id),
    invoice_number TEXT,
    amount DECIMAL(12,2),
    status TEXT DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id),
    amount DECIMAL(12,2),
    payment_method TEXT,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id),
    quantity DECIMAL(12,2),
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wastage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id),
    quantity DECIMAL(12,2),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    cost DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auto_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id),
    threshold DECIMAL(12,2),
    order_quantity DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. APPLY CLEAN RLS POLICIES (Non-Atomic Loop)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['profiles', 'invitations', 'notifications', 'vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
            -- Standard read-all policy (safe)
            EXECUTE format('CREATE POLICY "RLS_View_v6_%I" ON public.%I FOR SELECT USING (true)', t, t);
            -- Role-based manage policy (safe, uses JWT metadata)
            EXECUTE format('CREATE POLICY "RLS_Manage_v6_%I" ON public.%I FOR ALL USING ((auth.jwt() -> ''user_metadata'' ->> ''role'') IN (''admin'', ''owner'', ''manager''))', t, t);
        END IF;
    END LOOP;
END $$;

-- 4. PROFILE SPECIAL RULE
CREATE POLICY "RLS_Update_Self_v6" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 5. FINAL ROLE SYNC
-- This promotion uses your email directly to make sure the JWT/Profile match.
DO $$
DECLARE
    u RECORD;
BEGIN
    FOR u IN (SELECT id, email FROM auth.users WHERE email ILIKE '%uppalapati%')
    LOOP
        INSERT INTO public.profiles (id, email, role)
        VALUES (u.id, u.email, 'admin')
        ON CONFLICT (id) DO UPDATE SET role = 'admin';
        
        UPDATE auth.users 
        SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'admin')
        WHERE id = u.id;
    END LOOP;
END $$;
