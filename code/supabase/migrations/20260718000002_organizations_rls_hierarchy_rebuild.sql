-- Rebuild organizations RLS: the current policy set is fossils from three eras (002/004/005
-- JWT-user_metadata-based, 011 owner_id-based) never revisited when tenant_super_admin/
-- org_manager were introduced (20260708000002). No policy grants tenant-wide visibility to
-- tenant_super_admin, which is why ContextSwitcher.jsx's "tenant org dropdown" query returns
-- nothing useful for that role today. Drop everything, rebuild on get_auth_role()/
-- get_auth_tenant() (profiles-based, not JWT), per CLAUDE.md's "drop stale, don't add beside".
--
-- No INSERT policy is added: both onboarding paths (setup_organization_full,
-- setup_onboarding_hierarchy, both in 20260708000002...sql) are SECURITY DEFINER and insert
-- organizations rows themselves, bypassing RLS -- confirmed no other code path needs a
-- direct-client INSERT policy on this table.

BEGIN;

DROP POLICY IF EXISTS "RLS_SaaS_Isolation_organizations" ON public.organizations;
DROP POLICY IF EXISTS "Platform Admins see all Orgs" ON public.organizations;
DROP POLICY IF EXISTS "Users see their own Org" ON public.organizations;
DROP POLICY IF EXISTS "Users can create their own organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners can view their own organizations" ON public.organizations;

CREATE POLICY organizations_select_scope ON public.organizations
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR id = public.get_auth_org()
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  );

CREATE POLICY organizations_write_scope ON public.organizations
  FOR UPDATE
  USING (
    public.is_platform_admin()
    OR (public.get_auth_role() = 'org_manager' AND id = public.get_auth_org())
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (public.get_auth_role() = 'org_manager' AND id = public.get_auth_org())
    OR (public.get_auth_role() = 'tenant_super_admin' AND tenant_id = public.get_auth_tenant())
  );

COMMIT;
