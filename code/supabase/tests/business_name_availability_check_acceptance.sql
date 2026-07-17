-- Acceptance test for 20260720000018_business_name_availability_check.sql
--
-- Verifies: (1) is_business_name_available() correctly reports taken vs free names,
-- case-insensitively; (2) it self-excludes -- the SAME tenant checking their own already-used
-- name sees it as available, not a false warning; (3) submit_business_verification() does
-- NOT block a second tenant from registering an already-taken name -- this is advisory only,
-- so the second tenant's submission still succeeds and their own row exists afterward.

BEGIN;

SELECT plan(5);

CREATE TEMP TABLE bnu_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE bnu_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON bnu_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bnu_results TO authenticated;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO bnu_ids(key, value) VALUES ('tenant_a', v_tenant_a), ('tenant_b', v_tenant_b);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_tenant_a, 'authenticated', 'authenticated', 'bnu-tenant-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_b, 'authenticated', 'authenticated', 'bnu-tenant-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, onboarding_status, onboarding_current_step, business_email, business_email_verified_at, business_phone, business_phone_verified_at)
  VALUES
    (v_tenant_a, 'bnu-tenant-a@example.test', 'BNU Tenant A', 'tenant_super_admin', 'active', 'not_started', 'not_started', 'business_verification', 'bnu-tenant-a@example.test', now(), '+18655550400', now()),
    (v_tenant_b, 'bnu-tenant-b@example.test', 'BNU Tenant B', 'tenant_super_admin', 'active', 'not_started', 'not_started', 'business_verification', 'bnu-tenant-b@example.test', now(), '+18655550401', now())
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    onboarding_status = EXCLUDED.onboarding_status,
    onboarding_current_step = EXCLUDED.onboarding_current_step,
    business_email = EXCLUDED.business_email,
    business_email_verified_at = EXCLUDED.business_email_verified_at,
    business_phone = EXCLUDED.business_phone,
    business_phone_verified_at = EXCLUDED.business_phone_verified_at;
END $$;

-- ===== tenant A submits "Craven Wings LLC" =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bnu_ids WHERE key = 'tenant_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_business_verification(jsonb_build_object(
  'legalName', 'Craven Wings LLC',
  'businessType', 'llc',
  'identifierType', 'ein',
  'taxIdentifier', '111223333',
  'email', 'bnu-tenant-a@example.test',
  'phone', '+18655550400',
  'website', 'https://craven-wings.example.test'
));
RESET ROLE;

-- ===== availability check, case-insensitive, run as tenant B (a stranger to this name) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bnu_ids WHERE key = 'tenant_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO bnu_results
SELECT 'availability_check_flags_taken_name_case_insensitive',
       public.is_business_name_available('CRAVEN WINGS LLC') = false,
       'result=' || public.is_business_name_available('CRAVEN WINGS LLC');
INSERT INTO bnu_results
SELECT 'availability_check_accepts_free_name',
       public.is_business_name_available('Downtown Grill LLC') = true,
       'result=' || public.is_business_name_available('Downtown Grill LLC');
RESET ROLE;

-- ===== tenant A checking their OWN existing name sees it as available (self-exclusion) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bnu_ids WHERE key = 'tenant_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO bnu_results
SELECT 'owner_checking_own_name_not_flagged',
       public.is_business_name_available('Craven Wings LLC') = true,
       'result=' || public.is_business_name_available('Craven Wings LLC');
RESET ROLE;

-- ===== tenant B CAN submit the same name -- this is advisory only, not enforced =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bnu_ids WHERE key = 'tenant_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_business_verification(jsonb_build_object(
      'legalName', 'craven wings llc',
      'businessType', 'llc',
      'identifierType', 'ein',
      'taxIdentifier', '444556666',
      'email', 'bnu-tenant-b@example.test',
      'phone', '+18655550401',
      'website', 'https://craven-wings-copycat.example.test'
    ));
    INSERT INTO bnu_results VALUES ('second_tenant_not_blocked_from_duplicate_name', true, 'no exception raised, as expected -- advisory only');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO bnu_results VALUES ('second_tenant_not_blocked_from_duplicate_name', false, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO bnu_results
SELECT 'tenant_b_has_a_verification_row_after_duplicate_submit',
       EXISTS (SELECT 1 FROM public.business_verifications WHERE user_id = (SELECT value FROM bnu_ids WHERE key = 'tenant_b')),
       'checked';

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM bnu_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
