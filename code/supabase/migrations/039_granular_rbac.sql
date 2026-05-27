-- Migration 039: Granular RBAC System (Phase 2)
-- Replaces single-column role strings with an enterprise RBAC schema.
-- We are running this in parallel with profiles.role for safety during transition.

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

-- 2. Permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL
);

-- 3. Role Permissions Table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. User Roles Table
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 5. Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "Users can view roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Users can view permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Users can view role_permissions" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Users can view own user_roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_my_org());
CREATE POLICY "Admin can manage user_roles" ON public.user_roles FOR ALL USING (is_admin() AND organization_id = public.get_my_org());

-- 7. Seed Default Data & Backfill from profiles
DO $$
DECLARE
    r_plat_id UUID;
    r_owner_id UUID;
    r_branch_id UUID;
    r_staff_id UUID;
BEGIN
    -- Seed default roles
    INSERT INTO public.roles (name) VALUES ('platform_admin') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_plat_id;
    INSERT INTO public.roles (name) VALUES ('org_owner') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_owner_id;
    INSERT INTO public.roles (name) VALUES ('branch_manager') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_branch_id;
    INSERT INTO public.roles (name) VALUES ('ground_staff') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO r_staff_id;

    -- Backfill existing profiles into user_roles
    INSERT INTO public.user_roles (user_id, role_id, location_id, organization_id)
    SELECT 
        p.id as user_id,
        CASE 
            WHEN p.role = 'platform_admin' THEN r_plat_id
            WHEN p.role = 'org_owner' THEN r_owner_id
            WHEN p.role = 'branch_manager' THEN r_branch_id
            ELSE r_staff_id
        END as role_id,
        p.location_id,
        p.organization_id
    FROM public.profiles p
    WHERE p.organization_id IS NOT NULL
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;
