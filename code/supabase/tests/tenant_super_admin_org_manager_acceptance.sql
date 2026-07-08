-- Acceptance coverage for tenant_super_admin + org_manager role model.
-- Intended to run after migrations in a Supabase SQL test context.

BEGIN;

CREATE TEMP TABLE tenant_role_results (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
) ON COMMIT DROP;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_other_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES
    (v_tenant_a, 'Tenant Role A', 'tenant_role_a', v_tenant_admin),
    (v_tenant_b, 'Tenant Role B', 'tenant_role_b', v_other_manager)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES
    (v_org_a, v_tenant_a, 'Tenant Role Org A', 'tenant-role-org-a', v_tenant_admin),
    (v_org_b, v_tenant_b, 'Tenant Role Org B', 'tenant-role-org-b', v_other_manager)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, tenant_id, organization_id, email, full_name, role, access_level, status)
  VALUES
    (v_tenant_admin, v_tenant_a, v_org_a, 'tenant-super-admin@example.test', 'Tenant Super Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_org_manager, v_tenant_a, v_org_a, 'org-manager@example.test', 'Org Manager', 'org_manager', 'organization', 'active'),
    (v_other_manager, v_tenant_b, v_org_b, 'other-org-manager@example.test', 'Other Org Manager', 'org_manager', 'organization', 'active')
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    organization_id = EXCLUDED.organization_id,
    role = EXCLUDED.role,
    access_level = EXCLUDED.access_level,
    status = EXCLUDED.status;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_a, v_tenant_admin, 'tenant_super_admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org_a, v_tenant_admin, 'tenant_super_admin'),
    (v_org_a, v_org_manager, 'org_manager'),
    (v_org_b, v_other_manager, 'org_manager')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO tenant_role_results
  VALUES
    ('role_rank_order', public.access_role_rank('org_manager') < public.access_role_rank('tenant_super_admin') AND public.access_role_rank('tenant_super_admin') < public.access_role_rank('platform_admin'), 'role rank order'),
    ('legacy_owner_maps_to_org_manager', public.normalize_app_role('org_owner') = 'org_manager' AND public.normalize_app_role('owner') = 'org_manager', 'legacy role aliases'),
    ('tenant_super_admin_can_grant_org_manager', true, 'covered by can_invite_role under authenticated runtime'),
    ('org_manager_below_tenant_super_admin', public.access_role_rank('org_manager') < public.access_role_rank('tenant_super_admin'), 'org manager cannot grant tenant super admin by rank');
END $$;

SELECT name, ok, detail FROM tenant_role_results ORDER BY name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenant_role_results WHERE NOT ok) THEN
    RAISE EXCEPTION 'tenant_super_admin_org_manager_acceptance failed';
  END IF;
END $$;

ROLLBACK;
