-- ============================================================
-- 136: Tighten Locations RLS
-- ============================================================
-- 1. Drop overly permissive Tenant_Isolation_locations
-- 2. Create discrete SELECT, INSERT, UPDATE, DELETE policies
--    restricting modifications to org_owner and platform_admin.
-- ============================================================

BEGIN;

-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Tenant_Isolation_locations" ON public.locations;

-- Read Access: All members of the organization can read locations
DROP POLICY IF EXISTS "Tenant_Isolation_locations_SELECT" ON public.locations;
CREATE POLICY "Tenant_Isolation_locations_SELECT"
  ON public.locations FOR SELECT
  USING (organization_id = public.get_auth_org());

-- Write Access: Only org_owner or platform_admin can insert
DROP POLICY IF EXISTS "Tenant_Isolation_locations_INSERT" ON public.locations;
CREATE POLICY "Tenant_Isolation_locations_INSERT"
  ON public.locations FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_org() 
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

-- Update Access: Org owners or specific location managers
DROP POLICY IF EXISTS "Tenant_Isolation_locations_UPDATE" ON public.locations;
CREATE POLICY "Tenant_Isolation_locations_UPDATE"
  ON public.locations FOR UPDATE
  USING (
    organization_id = public.get_auth_org()
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

-- Delete Access: Only org_owner or platform_admin
DROP POLICY IF EXISTS "Tenant_Isolation_locations_DELETE" ON public.locations;
CREATE POLICY "Tenant_Isolation_locations_DELETE"
  ON public.locations FOR DELETE
  USING (
    organization_id = public.get_auth_org() 
    AND public.get_auth_role() IN ('org_owner', 'platform_admin')
  );

COMMIT;
