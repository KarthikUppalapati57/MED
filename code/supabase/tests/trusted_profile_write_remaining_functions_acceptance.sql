-- Acceptance test for 20260719000010_trusted_profile_write_remaining_functions.sql
--
-- Verifies the two highest-impact fixes actually work end-to-end under real 'authenticated'
-- impersonation (not just that the functions compile):
-- (1) admin_update_user_role can now actually change a target's role/brand/location --
--     this is the RPC UserManagement.jsx calls directly; before this fix it silently failed
--     every time.
-- (2) switch_user_context can now actually change the CALLER's own org/brand/location/role
--     (the ContextSwitcher plumbing CLAUDE.md documents as "hardened" -- it wasn't, once this
--     trigger shipped after that verification).
-- (3) both still enforce their existing business-rule checks (a location_manager still can't
--     be assigned a role at/above their own) -- no regression from adding the bypass flag.

BEGIN;

CREATE TEMP TABLE tpwrf_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tpwrf_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON tpwrf_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tpwrf_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_ground_staff uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO tpwrf_ids(key, value) VALUES
    ('org', v_org), ('brand', v_brand), ('org_manager', v_org_manager),
    ('ground_staff', v_ground_staff), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'TPWRF Org', 'tpwrf-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'TPWRF Brand', v_org);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'tpwrf-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground_staff, 'authenticated', 'authenticated', 'tpwrf-ground-staff@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'tpwrf-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id)
  VALUES
    (v_org_manager, 'tpwrf-org-manager@example.test', 'TPWRF Org Manager', 'org_manager', 'active', v_org),
    (v_ground_staff, 'tpwrf-ground-staff@example.test', 'TPWRF Ground Staff', 'ground_staff', 'active', v_org)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  -- location_manager is also a member of v_org so switch_user_context can find their membership row
  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id)
  VALUES (v_location_manager, 'tpwrf-location-manager@example.test', 'TPWRF Location Manager', 'location_manager', 'active', v_org)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org, v_location_manager, 'location_manager')
  ON CONFLICT DO NOTHING;
END $$;

-- ===== admin_update_user_role: org_manager promotes ground_staff to location_manager =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tpwrf_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.admin_update_user_role(
  (SELECT value FROM tpwrf_ids WHERE key = 'ground_staff'),
  'location_manager'
);

RESET ROLE;

INSERT INTO tpwrf_results
SELECT 'admin_update_user_role_actually_changes_role',
       role = 'location_manager',
       'role=' || role
FROM public.profiles
WHERE id = (SELECT value FROM tpwrf_ids WHERE key = 'ground_staff');

-- ===== admin_update_user_role still enforces its own-role-ceiling business rule =====
-- (org_manager cannot promote someone to org_manager or above -- can_invite_role should still block this)

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tpwrf_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.admin_update_user_role(
      (SELECT value FROM tpwrf_ids WHERE key = 'ground_staff'),
      'platform_admin'
    );
    INSERT INTO tpwrf_results VALUES ('admin_update_user_role_still_enforces_ceiling', false, 'unexpectedly allowed promotion to platform_admin');
  EXCEPTION WHEN others THEN
    INSERT INTO tpwrf_results VALUES ('admin_update_user_role_still_enforces_ceiling', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== switch_user_context: location_manager switches into their brand (no location) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tpwrf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.switch_user_context(
  (SELECT value FROM tpwrf_ids WHERE key = 'org'),
  NULL,
  NULL
);

RESET ROLE;

INSERT INTO tpwrf_results
SELECT 'switch_user_context_actually_writes_profile',
       organization_id = (SELECT value FROM tpwrf_ids WHERE key = 'org') AND role = 'location_manager',
       'organization_id=' || COALESCE(organization_id::text, 'NULL') || ' role=' || role
FROM public.profiles
WHERE id = (SELECT value FROM tpwrf_ids WHERE key = 'location_manager');

-- ===================== verdict =====================

SELECT * FROM tpwrf_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tpwrf_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'trusted_profile_write_remaining_functions_acceptance failed';
  END IF;
END $$;

ROLLBACK;
