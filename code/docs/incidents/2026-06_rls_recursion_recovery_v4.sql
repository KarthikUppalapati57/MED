-- ============================================================
-- MEVS - ULTIMATE RECOVERY & ZERO-RECURSION RLS (v4 - FINAL)
-- ============================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. NUKING RECURSIVE HELPERS (The Root Cause)
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS is_manager_or_above() CASCADE;
DROP FUNCTION IF EXISTS is_owner_or_admin() CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- 2. TOTAL POLICY PURGE (Definitive Scorched Earth)
-- This drops EVERY policy on EVERY table to ensure no hidden recursion remains.
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 3. RESTORE SCHEMA STABILITY (Profiles, Invitations, Notifications)
-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'ground_staff',
    avatar_url TEXT,
    phone TEXT,
    invited_by UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure all columns exist (in case table was partially created)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone') THEN
        ALTER TABLE public.profiles ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_active') THEN
        ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='updated_at') THEN
        ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'owner', 'manager', 'ground_staff'));

-- Invitations
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'ground_staff' CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin')),
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_by UUID REFERENCES auth.users(id),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK (type IN ('invoice', 'payment', 'order', 'inventory', 'system', 'alert')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    reference_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. FIX TRIGGER (Proper Role Handling)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', ''), 
    COALESCE(new.raw_user_meta_data->>'role', 'ground_staff')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = COALESCE(new.raw_user_meta_data->>'role', profiles.role),
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. GRANT ADMIN ACCESS & SYNC METADATA
DO $$
DECLARE
    target_email_1 TEXT := 'uppalapatisivasaipavankarthik@gmail.com';
    target_email_2 TEXT := 'uppalapatisivasaipavankarthik@gamil.com';
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT id, email FROM auth.users 
        WHERE LOWER(email) IN (LOWER(target_email_1), LOWER(target_email_2))
    LOOP
        UPDATE public.profiles SET role = 'admin' WHERE id = user_record.id;
        
        UPDATE auth.users 
        SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'admin')
        WHERE id = user_record.id;
    END LOOP;
END $$;

-- 6. PROJECT-WIDE ZERO-RECURSION POLICIES
-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RLS: Profiles viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "RLS: Profiles update self" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "RLS: Admin manage profiles" ON public.profiles FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RLS: Manager+ invitations" ON public.invitations FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'owner', 'manager'));
CREATE POLICY "RLS: Public invitations" ON public.invitations FOR SELECT USING (true);

-- Application Data (Vendors, Products, Invoices, Payments, Inventory, etc.)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders'])
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('CREATE POLICY "RLS: View %I" ON public.%I FOR SELECT USING (true)', t, t);
        EXECUTE format('CREATE POLICY "RLS: Manage %I" ON public.%I FOR ALL USING ((auth.jwt() -> ''user_metadata'' ->> ''role'') IN (''admin'', ''owner'', ''manager''))', t, t);
    END LOOP;
END $$;

-- Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RLS: Own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "RLS: System notifications" ON public.notifications FOR INSERT WITH CHECK (true);


 