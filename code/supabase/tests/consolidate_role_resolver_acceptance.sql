-- Acceptance test for 20260628000002_consolidate_role_resolver.sql.
-- Rollback-scoped: leaves no persistent test rows.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000332001',
  'authenticated',
  'authenticated',
  'role-resolver-location-manager@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000332000',
  'Role Resolver Test Org',
  'role-resolver-test-org'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.brands (brand_id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000332101', '00000000-0000-4000-8000-000000332000', 'Role Resolver Brand 1'),
  ('00000000-0000-4000-8000-000000332102', '00000000-0000-4000-8000-000000332000', 'Role Resolver Brand 2')
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO public.locations (id, brand_id, organization_id, name)
VALUES
  ('00000000-0000-4000-8000-000000332201', '00000000-0000-4000-8000-000000332101', '00000000-0000-4000-8000-000000332000', 'Role Resolver Location 1'),
  ('00000000-0000-4000-8000-000000332202', '00000000-0000-4000-8000-000000332102', '00000000-0000-4000-8000-000000332000', 'Role Resolver Location 2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, organization_id, brand_id, location_id, full_name, email, role, access_level, status)
VALUES (
  '00000000-0000-4000-8000-000000332001',
  '00000000-0000-4000-8000-000000332000',
  NULL,
  '00000000-0000-4000-8000-000000332201',
  'Role Resolver Location Manager',
  'role-resolver-location-manager@example.test',
  'location_manager',
  'location',
  'active'
)
ON CONFLICT (id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    role = EXCLUDED.role,
    access_level = EXCLUDED.access_level,
    status = EXCLUDED.status;

-- Transaction-scoped grant so this test can call the helper directly.
-- ROLLBACK removes it; the migration itself does not alter dependent helpers.
GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated;

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000332001',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'org_owner'),
    'user_metadata', jsonb_build_object('role', 'org_owner')
  )::text,
  true
);

DO $test$
DECLARE
  resolved_role text;
BEGIN
  SELECT public.get_auth_role() INTO resolved_role;

  IF resolved_role <> 'location_manager' THEN
    RAISE EXCEPTION 'get_auth_role expected profile role location_manager, got %', resolved_role;
  END IF;

  IF resolved_role = 'org_owner' THEN
    RAISE EXCEPTION 'get_auth_role still trusts JWT app_metadata.role';
  END IF;

  RAISE NOTICE 'get_auth_role assertion passed: %', resolved_role;
END;
$test$;

DO $test$
DECLARE
  brand_ids uuid[];
BEGIN
  SELECT array_agg(x ORDER BY x) INTO brand_ids
  FROM public.get_my_accessible_brand_ids() x;

  IF brand_ids <> ARRAY['00000000-0000-4000-8000-000000332101'::uuid] THEN
    RAISE EXCEPTION 'brand scope expected only brand 1, got %', brand_ids;
  END IF;

  IF '00000000-0000-4000-8000-000000332102'::uuid = ANY(brand_ids) THEN
    RAISE EXCEPTION 'brand scope leaked brand 2: %', brand_ids;
  END IF;

  RAISE NOTICE 'brand scope assertion passed: %', brand_ids;
END;
$test$;

DO $test$
DECLARE
  is_manager boolean;
BEGIN
  SELECT public.is_manager_or_above() INTO is_manager;

  IF is_manager IS NOT TRUE THEN
    RAISE EXCEPTION 'is_manager_or_above expected true for profile role location_manager, got %', is_manager;
  END IF;

  RAISE NOTICE 'is_manager_or_above assertion passed: %', is_manager;
END;
$test$;

SELECT 'consolidate_role_resolver acceptance passed' AS result;

ROLLBACK;