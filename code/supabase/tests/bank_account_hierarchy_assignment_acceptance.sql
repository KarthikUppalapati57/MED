-- Acceptance test for 20260720000022_bank_account_hierarchy_assignment.sql
--
-- Verifies: (1) org-level assignment stamps organization_id only; (2) brand-level assignment
-- stamps organization_id+brand_id; (3) location-level assignment stamps all three; (4) missing
-- assignment_scope/assignment_id raises; (5) assigning to a hierarchy node the caller has no
-- membership in raises (never trust the client for scope); (6) a second bank account for the
-- same tenant is allowed (multi-account); (7) the scope-tier CHECK constraint blocks an invalid
-- direct row (location without brand) even bypassing the RPC.

BEGIN;

SELECT plan(7);

CREATE TEMP TABLE baha_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE baha_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON baha_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON baha_results TO authenticated;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
BEGIN
  INSERT INTO baha_ids(key, value) VALUES
    ('admin', v_admin), ('owner', v_owner), ('outsider', v_outsider);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'baha-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'baha-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_outsider, 'authenticated', 'authenticated', 'baha-outsider@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, payment_verified, onboarding_status)
  VALUES
    (v_admin, 'baha-admin@example.test', 'BAHA Admin', 'platform_admin', 'active', 'not_started', false, 'not_started'),
    (v_owner, 'baha-owner@example.test', 'BAHA Owner', 'tenant_super_admin', 'active', 'verified', true, 'in_progress'),
    (v_outsider, 'baha-outsider@example.test', 'BAHA Outsider', 'tenant_super_admin', 'active', 'verified', true, 'in_progress')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    payment_verified = EXCLUDED.payment_verified,
    onboarding_status = EXCLUDED.onboarding_status;
END $$;

UPDATE public.platform_onboarding_settings
SET usps_address_validation_enabled = true
WHERE id = true;

-- ===== build a real hierarchy for 'owner' via the same path production uses =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_hierarchy_for_review(
  (SELECT value FROM baha_ids WHERE key = 'owner'),
  jsonb_build_array(jsonb_build_object(
    'name', 'BAHA Org', 'slug', 'baha-org-' || replace((SELECT value FROM baha_ids WHERE key = 'owner')::text, '-', ''),
    'brands', jsonb_build_array(jsonb_build_object(
      'name', 'BAHA Brand',
      'locations', jsonb_build_array(jsonb_build_object(
        'name', 'BAHA Location', 'address', '1 Test St',
        'business_address', jsonb_build_object('line1','1 Test St','city','C','state','S','postalCode','0','country','US'),
        'mailing_address', jsonb_build_object('line1','1 Test St','city','C','state','S','postalCode','0','country','US')
      ))
    ))
  ))
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.approve_onboarding_hierarchy((SELECT value FROM baha_ids WHERE key = 'owner'));
RESET ROLE;

INSERT INTO baha_ids
SELECT 'org', organization_id FROM public.profiles WHERE id = (SELECT value FROM baha_ids WHERE key = 'owner');
INSERT INTO baha_ids
SELECT 'brand', brand_id FROM public.brands WHERE organization_id = (SELECT value FROM baha_ids WHERE key = 'org');
INSERT INTO baha_ids
SELECT 'location', id FROM public.locations WHERE organization_id = (SELECT value FROM baha_ids WHERE key = 'org');

-- ===== org-level assignment =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_bank_account(jsonb_build_object(
  'bank_name', 'Org Bank', 'account_holder_name', 'BAHA Owner', 'account_type', 'checking',
  'routing_number', '123456789', 'account_number', '00011112222',
  'assignment_scope', 'organization', 'assignment_id', (SELECT value::text FROM baha_ids WHERE key = 'org')
));
RESET ROLE;

INSERT INTO baha_results
SELECT 'org_level_stamps_org_only',
       organization_id = (SELECT value FROM baha_ids WHERE key = 'org') AND brand_id IS NULL AND location_id IS NULL,
       'org=' || COALESCE(organization_id::text,'<null>') || ' brand=' || COALESCE(brand_id::text,'<null>') || ' loc=' || COALESCE(location_id::text,'<null>')
FROM public.onboarding_bank_accounts
WHERE user_id = (SELECT value FROM baha_ids WHERE key = 'owner') AND bank_name = 'Org Bank';

-- ===== brand-level assignment =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_bank_account(jsonb_build_object(
  'bank_name', 'Brand Bank', 'account_holder_name', 'BAHA Owner', 'account_type', 'checking',
  'routing_number', '123456789', 'account_number', '00011113333',
  'assignment_scope', 'brand', 'assignment_id', (SELECT value::text FROM baha_ids WHERE key = 'brand')
));
RESET ROLE;

INSERT INTO baha_results
SELECT 'brand_level_stamps_org_and_brand',
       organization_id = (SELECT value FROM baha_ids WHERE key = 'org') AND brand_id = (SELECT value FROM baha_ids WHERE key = 'brand') AND location_id IS NULL,
       'org=' || COALESCE(organization_id::text,'<null>') || ' brand=' || COALESCE(brand_id::text,'<null>') || ' loc=' || COALESCE(location_id::text,'<null>')
FROM public.onboarding_bank_accounts
WHERE user_id = (SELECT value FROM baha_ids WHERE key = 'owner') AND bank_name = 'Brand Bank';

-- ===== location-level assignment (also proves multi-account works: third account for same user) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_bank_account(jsonb_build_object(
  'bank_name', 'Location Bank', 'account_holder_name', 'BAHA Owner', 'account_type', 'savings',
  'routing_number', '123456789', 'account_number', '00011114444',
  'assignment_scope', 'location', 'assignment_id', (SELECT value::text FROM baha_ids WHERE key = 'location')
));
RESET ROLE;

INSERT INTO baha_results
SELECT 'location_level_stamps_all_three',
       organization_id = (SELECT value FROM baha_ids WHERE key = 'org') AND brand_id = (SELECT value FROM baha_ids WHERE key = 'brand') AND location_id = (SELECT value FROM baha_ids WHERE key = 'location'),
       'org=' || COALESCE(organization_id::text,'<null>') || ' brand=' || COALESCE(brand_id::text,'<null>') || ' loc=' || COALESCE(location_id::text,'<null>')
FROM public.onboarding_bank_accounts
WHERE user_id = (SELECT value FROM baha_ids WHERE key = 'owner') AND bank_name = 'Location Bank';

INSERT INTO baha_results
SELECT 'multiple_bank_accounts_allowed_for_same_tenant',
       (SELECT count(*) FROM public.onboarding_bank_accounts WHERE user_id = (SELECT value FROM baha_ids WHERE key = 'owner')) = 3,
       'checked';

-- ===== missing assignment raises =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_onboarding_bank_account(jsonb_build_object(
      'bank_name', 'No Scope Bank', 'account_holder_name', 'BAHA Owner', 'account_type', 'checking',
      'routing_number', '123456789', 'account_number', '00011115555'
    ));
    INSERT INTO baha_results VALUES ('missing_assignment_scope_raises', false, 'did not raise');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO baha_results VALUES ('missing_assignment_scope_raises', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== outsider cannot assign to owner's hierarchy nodes =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM baha_ids WHERE key = 'outsider'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_onboarding_bank_account(jsonb_build_object(
      'bank_name', 'Outsider Bank', 'account_holder_name', 'BAHA Outsider', 'account_type', 'checking',
      'routing_number', '123456789', 'account_number', '00011116666',
      'assignment_scope', 'location', 'assignment_id', (SELECT value::text FROM baha_ids WHERE key = 'location')
    ));
    INSERT INTO baha_results VALUES ('outsider_cannot_assign_to_foreign_hierarchy', false, 'did not raise');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO baha_results VALUES ('outsider_cannot_assign_to_foreign_hierarchy', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== CHECK constraint blocks an invalid direct row even bypassing the RPC =====

DO $$
BEGIN
  BEGIN
    INSERT INTO public.onboarding_bank_accounts (
      user_id, bank_name, account_holder_name, account_type,
      routing_number_last4, account_number_last4, location_id
    ) VALUES (
      (SELECT value FROM baha_ids WHERE key = 'owner'), 'Bad Row', 'X', 'checking',
      '1234', '5678', (SELECT value FROM baha_ids WHERE key = 'location')
    );
    INSERT INTO baha_results VALUES ('scope_tier_check_blocks_location_without_brand', false, 'did not raise');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO baha_results VALUES ('scope_tier_check_blocks_location_without_brand', true, SQLERRM);
  END;
END $$;

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM baha_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
