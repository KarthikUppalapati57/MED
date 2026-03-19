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

-- 4. Fix Invitations table name issues and columns (Safety sweep)
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id);

-- 5. Ensure System Org exists for migration
INSERT INTO public.organizations (name, slug)
VALUES ('System Provider', 'system-provider')
ON CONFLICT (slug) DO NOTHING;

-- 6. Ensure user is Platform Admin (Hard Reset)
DO $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'system-provider' LIMIT 1;
    
    UPDATE public.profiles 
    SET role = 'platform_admin', organization_id = v_org_id 
    WHERE email = 'uppalapatisivasaipavankarthik@gmail.com';

    UPDATE auth.users 
    SET raw_user_meta_data = 
      COALESCE(raw_user_meta_data, '{}'::jsonb) || 
      jsonb_build_object('role', 'platform_admin', 'organization_id', v_org_id)
    WHERE email = 'uppalapatisivasaipavankarthik@gmail.com';
END $$;
