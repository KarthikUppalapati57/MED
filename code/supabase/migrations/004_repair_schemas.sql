-- ============================================================
-- MEVS SAAS: REPAIR INVITATIONS & SCHEMAS
-- ============================================================

-- 1. Ensure invitations table is hierarchy-ready
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'location';

-- 2. Update Role Checks everywhere
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (role IN ('ground_staff', 'manager', 'owner', 'admin', 'platform_admin'));

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
