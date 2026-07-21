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
  v_brand_a uuid := gen_random_uuid();
  v_location_a uuid := gen_random_uuid();
  v_tenant_admin uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_branch_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_other_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (v_tenant_admin, 'authenticated', 'authenticated', 'tsa_admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_org_manager, 'authenticated', 'authenticated', 'tsa_org@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch_manager, 'authenticated', 'authenticated', 'tsa_branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'tsa_loc@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other_manager, 'authenticated', 'authenticated', 'tsa_other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

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

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand_a, v_org_a, 'Tenant Role Brand A')
  ON CONFLICT (brand_id) DO NOTHING;

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location_a, v_brand_a, v_org_a, 'Tenant Role Location A')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, tenant_id, organization_id, brand_id, location_id, email, full_name, role, access_level, status)
  VALUES
    (v_tenant_admin, v_tenant_a, v_org_a, NULL, NULL, 'tenant-super-admin@example.test', 'Tenant Super Admin', 'tenant_super_admin', 'organization', 'active'),
    (v_org_manager, v_tenant_a, v_org_a, NULL, NULL, 'org-manager@example.test', 'Org Manager', 'org_manager', 'organization', 'active'),
    (v_branch_manager, v_tenant_a, v_org_a, v_brand_a, NULL, 'branch-manager@example.test', 'Branch Manager', 'branch_manager', 'brand', 'active'),
    (v_location_manager, v_tenant_a, v_org_a, v_brand_a, v_location_a, 'location-manager@example.test', 'Location Manager', 'location_manager', 'location', 'active'),
    (v_other_manager, v_tenant_b, v_org_b, NULL, NULL, 'other-org-manager@example.test', 'Other Org Manager', 'org_manager', 'organization', 'active')
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
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
    (v_org_a, v_branch_manager, 'branch_manager'),
    (v_org_a, v_location_manager, 'location_manager'),
    (v_org_b, v_other_manager, 'org_manager')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO tenant_role_results
  VALUES
    ('role_rank_order', public.access_role_rank('location_manager') < public.access_role_rank('branch_manager') AND public.access_role_rank('branch_manager') < public.access_role_rank('org_manager') AND public.access_role_rank('org_manager') < public.access_role_rank('tenant_super_admin') AND public.access_role_rank('tenant_super_admin') < public.access_role_rank('platform_admin'), 'role rank order'),
    ('legacy_owner_maps_to_org_manager', public.normalize_app_role('owner') = 'org_manager', 'legacy owner alias'),
    ('tenant_ids_present_for_scoped_roles', NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id IN (v_tenant_admin, v_org_manager, v_branch_manager, v_location_manager)
         AND tenant_id IS NULL
     ), 'tenant_id exists for tenant/org/brand/location scoped users'),
    ('legacy_brand_manager_aliases_to_branch_manager', public.normalize_app_role('brand_manager') = 'branch_manager' AND public.access_role_rank('brand_manager') = public.access_role_rank('branch_manager'), 'legacy brand_manager aliases to branch_manager'),
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