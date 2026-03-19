-- ============================================================
-- MEVS INFRASTRUCTURE REPAIR & SYNC (V2)
-- ELIMINATES HANGS AND RECURSION LOOPS
-- ============================================================

-- 1. CLEANUP PREVIOUS BREAKPOINT FUNCTIONS (Avoid Recursion)
-- We switch to JWT-based checks because querying 'profiles' inside RLS
-- on 'profiles' or other tables creates infinite loops/hangs.

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'ground_staff');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_manager_plus()
RETURNS BOOLEAN AS $$
  SELECT public.get_auth_role() IN ('manager', 'owner', 'admin', 'platform_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin_plus()
RETURNS BOOLEAN AS $$
  SELECT public.get_auth_role() IN ('admin', 'platform_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. REPAIR PROFILES TABLE (THE HEART OF THE HANG)
-- Drops old table-dependent policies and replaces with JWT ones
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner/Admin can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner/Admin can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "RLS_SaaS_Profiles" ON public.profiles;

CREATE POLICY "Profiles_Self_Access" ON public.profiles FOR ALL USING (
    auth.uid() = id OR public.get_auth_role() = 'platform_admin'
);

CREATE POLICY "Profiles_Org_Access" ON public.profiles FOR SELECT USING (
    organization_id = public.get_auth_org()
);

-- 3. REPAIR BUSINESS TABLES (Fixing 'invoices', 'vendors', etc.)
DO $$
DECLARE
    t text;
    pol_name text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders'])
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            -- Drop ALL potential isolation policies to start fresh
            FOR pol_name IN 
                SELECT policyname FROM pg_policies WHERE tablename = t AND schemaname = 'public'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, t);
            END LOOP;

            -- Create the NEW fast policy
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (
                (public.get_auth_role() = ''platform_admin'') OR 
                (organization_id = public.get_auth_org())
            )', 'RLS_Sync_v2_' || t, t);
        END IF;
    END LOOP;
END $$;

-- 4. FIX AUTH SYNC
-- Forcefully ensure the user's role and org are in the JWT
UPDATE public.profiles 
SET role = 'platform_admin' 
WHERE email = 'uppalapatisivasaipavankarthik@gmail.com';

-- 5. STORAGE REPAIR (Storage also uses organization_id)
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;
DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;

CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (public.get_auth_role() = 'platform_admin') OR
        ((storage.foldername(name))[1] = public.get_auth_org()::text)
    )
);

-- 6. HEALTH CHECK
CREATE OR REPLACE VIEW public.health_monitor AS
SELECT 
    (SELECT count(*) FROM public.profiles) as total_users,
    (SELECT count(*) FROM public.organizations) as total_orgs,
    (SELECT count(*) FROM public.invoices) as total_invoices,
    public.get_auth_role() as current_user_role,
    public.get_auth_org() as current_user_org;

GRANT SELECT ON public.health_monitor TO authenticated;
