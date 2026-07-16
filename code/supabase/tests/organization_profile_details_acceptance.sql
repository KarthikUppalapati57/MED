-- Acceptance test for 20260719000017_organization_profile_details.sql
--
-- Verifies: (1) the new profile columns exist, (2) the OrgManagement.jsx org-list query shape
-- (which aliases admin_email:primary_contact_email -- previously a nonexistent column that
-- broke that query for every user) now succeeds, (3) an org_manager can update their own
-- org's profile fields via the existing organizations_write_scope RLS (no new policy needed),
-- (4) a location_manager (below org-level) is still blocked from writing them -- proving the
-- existing RLS extends correctly to the new columns without a regression.

BEGIN;

CREATE TEMP TABLE opd_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE opd_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON opd_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON opd_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO opd_ids(key, value) VALUES ('org', v_org), ('org_manager', v_org_manager), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'OPD Org', 'opd-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'OPD Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'OPD Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'opd-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'opd-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id)
  VALUES
    (v_org_manager, 'opd-org-manager@example.test', 'OPD Org Manager', 'org_manager', 'active', v_org, NULL, NULL),
    (v_location_manager, 'opd-location-manager@example.test', 'OPD Location Manager', 'location_manager', 'active', v_org, v_brand, v_location)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id;
END $$;

INSERT INTO opd_results
SELECT 'profile_columns_exist',
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizations'
          AND column_name IN ('address', 'city', 'state', 'zip_code', 'country', 'tax_id',
                               'primary_contact_name', 'primary_contact_email', 'primary_contact_phone')) = 9,
       'expected all 9 new profile columns to exist';

-- ===== the OrgManagement.jsx org-list query shape now succeeds (was broken before) =====

DO $$
BEGIN
  BEGIN
    PERFORM id, name, slug, subscription_status, plan_id, primary_contact_email AS admin_email, created_at, stripe_customer_id
    FROM public.organizations
    WHERE id = (SELECT value FROM opd_ids WHERE key = 'org');
    INSERT INTO opd_results VALUES ('org_list_query_shape_succeeds', true, 'query succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO opd_results VALUES ('org_list_query_shape_succeeds', false, SQLERRM);
  END;
END $$;

-- ===== org_manager can update their own org's profile fields =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM opd_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.organizations
SET address = '123 Main St', city = 'Knoxville', state = 'TN', zip_code = '37916',
    tax_id = '12-3456789', primary_contact_name = 'Jane Doe',
    primary_contact_email = 'jane@opd-org.test', primary_contact_phone = '555-0100'
WHERE id = (SELECT value FROM opd_ids WHERE key = 'org');

RESET ROLE;

INSERT INTO opd_results
SELECT 'org_manager_can_update_profile',
       address = '123 Main St' AND tax_id = '12-3456789' AND primary_contact_email = 'jane@opd-org.test',
       'address=' || COALESCE(address, 'NULL') || ' tax_id=' || COALESCE(tax_id, 'NULL')
FROM public.organizations
WHERE id = (SELECT value FROM opd_ids WHERE key = 'org');

-- ===== location_manager is blocked from writing org profile fields (existing RLS, no regression) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM opd_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  UPDATE public.organizations SET tax_id = '99-9999999'
  WHERE id = (SELECT value FROM opd_ids WHERE key = 'org');

  INSERT INTO opd_results VALUES ('location_manager_blocked', NOT FOUND, 'FOUND=' || FOUND || ' (RLS should silently affect 0 rows)');
END $$;

RESET ROLE;

INSERT INTO opd_results
SELECT 'location_manager_write_had_no_effect',
       tax_id = '12-3456789',
       'tax_id after blocked write attempt=' || COALESCE(tax_id, 'NULL')
FROM public.organizations
WHERE id = (SELECT value FROM opd_ids WHERE key = 'org');

-- ===================== verdict =====================

SELECT * FROM opd_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM opd_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'organization_profile_details_acceptance failed';
  END IF;
END $$;

ROLLBACK;
