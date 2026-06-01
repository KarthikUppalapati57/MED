-- Migration 054: Custom RBAC Roles per Organization
-- Extends the global roles system to allow organizations to build custom granular roles

BEGIN;

-- 1. Add organization_id and customization fields to roles table
ALTER TABLE public.roles 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'slate',
ADD COLUMN IF NOT EXISTS default_page_permissions JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS default_signing_privileges JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Mark existing hardcoded roles as system roles
UPDATE public.roles SET is_system = true WHERE name IN ('platform_admin', 'org_owner', 'branch_manager', 'location_manager', 'ground_staff');

-- 2. Modify the unique constraint
-- We need to drop the existing global UNIQUE on `name`
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;

-- System roles must be globally unique. Custom roles must be unique within an org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_system_name ON public.roles (name) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name ON public.roles (organization_id, name) WHERE is_system = false;

-- 3. Update RLS policies for roles table
DROP POLICY IF EXISTS "Users can view roles" ON public.roles;

-- Anyone can read system roles, and users can read their own org's custom roles
CREATE POLICY "Users can view roles" ON public.roles 
FOR SELECT USING (
    is_system = true 
    OR organization_id = public.get_auth_org() 
    OR public.get_auth_role() = 'platform_admin'
);

-- Only org owners (or platform admins) can insert/update custom roles
CREATE POLICY "Org owners can manage custom roles" ON public.roles 
FOR ALL USING (
    is_system = false 
    AND (
        (public.get_auth_role() = 'org_owner' AND organization_id = public.get_auth_org())
        OR public.get_auth_role() = 'platform_admin'
    )
);

COMMIT;
