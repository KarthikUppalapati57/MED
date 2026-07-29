-- ============================================================
-- MEVS - RECURSION INVESTIGATOR & REPAIR (v5)
-- ============================================================

-- 1. INVESTIGATE: List all triggers in the public schema
SELECT 
    event_object_table AS table_name, 
    trigger_name, 
    action_statement AS trigger_logic,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public';

-- 2. INVESTIGATE: List any functions that might be used in policies
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' 
AND (routine_name LIKE '%role%' OR routine_name LIKE '%user%');

-- 3. REPAIR: The "Super Purge"
-- This drops EVERY policy, trigger, and function that we don't explicitly need.
DO $$
DECLARE
    trig RECORD;
    pol RECORD;
BEGIN
    -- Drop all triggers in public schema
    FOR trig IN SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE event_object_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trig.trigger_name, trig.event_object_table);
    END LOOP;

    -- Drop all policies in public schema
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 4. REPAIR: Clean Functions
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- 5. RESTORE: Essential Trigger for Profiles
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

-- Re-attach trigger to auth.users (this is the only trigger we need)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RESTORE: The Cleanest Possible RLS
-- We will use a "Safe Select" that has ZERO dependencies.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_fixed" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_fixed" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_fixed" ON public.profiles FOR ALL USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- Apply to all other tables (Defensively)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
    LOOP
        -- Only proceed if the table actually exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
            EXECUTE format('CREATE POLICY "RLS_View_%I" ON public.%I FOR SELECT USING (true)', t, t);
            EXECUTE format('CREATE POLICY "RLS_Manage_%I" ON public.%I FOR ALL USING ((auth.jwt() -> ''user_metadata'' ->> ''role'') IN (''admin'', ''owner'', ''manager''))', t, t);
        END IF;
    END LOOP;
END $$;

-- 7. SYNC: Force your admin role one last time
UPDATE public.profiles SET role = 'admin' WHERE email ILIKE '%uppalapati%';
UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb WHERE email ILIKE '%uppalapati%';