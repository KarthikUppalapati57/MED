-- Acceptance test for 20260720000023_repeatable_bank_signature_capture.sql
--
-- Verifies: (1) signing the only bank account a tenant added completes onboarding immediately
-- (all_accounts_signed = true, banking_onboarding_completed = true); (2) for a tenant with TWO
-- accounts, signing the first does NOT complete onboarding (all_accounts_signed = false,
-- banking_onboarding_completed stays false); (3) signing the second/last one does complete it;
-- (4) an 'inactive' account is excluded from the all-signed check (doesn't block completion).

BEGIN;

SELECT plan(5);

CREATE TEMP TABLE rbsc_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rbsc_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON rbsc_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rbsc_results TO authenticated;

DO $$
DECLARE
  v_single uuid := gen_random_uuid();
  v_multi uuid := gen_random_uuid();
BEGIN
  INSERT INTO rbsc_ids(key, value) VALUES ('single', v_single), ('multi', v_multi);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_single, 'authenticated', 'authenticated', 'rbsc-single@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_multi, 'authenticated', 'authenticated', 'rbsc-multi@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, payment_verified, banking_onboarding_completed)
  VALUES
    (v_single, 'rbsc-single@example.test', 'RBSC Single', 'tenant_super_admin', 'active', 'verified', true, false),
    (v_multi, 'rbsc-multi@example.test', 'RBSC Multi', 'tenant_super_admin', 'active', 'verified', true, false)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role, status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    payment_verified = EXCLUDED.payment_verified,
    banking_onboarding_completed = EXCLUDED.banking_onboarding_completed;

  -- single: one account, no assignment needed for this test (RPC under test doesn't check scope)
  INSERT INTO public.onboarding_bank_accounts (id, user_id, bank_name, account_holder_name, account_type, routing_number_last4, account_number_last4, is_default, status)
  VALUES (gen_random_uuid(), v_single, 'Single Bank', 'RBSC Single', 'checking', '1234', '5678', true, 'pending_signature');

  -- multi: two pending accounts + one already-inactive account that must NOT block completion
  INSERT INTO public.onboarding_bank_accounts (id, user_id, bank_name, account_holder_name, account_type, routing_number_last4, account_number_last4, is_default, status)
  VALUES
    (gen_random_uuid(), v_multi, 'Multi Bank A', 'RBSC Multi', 'checking', '1111', '2222', true, 'pending_signature'),
    (gen_random_uuid(), v_multi, 'Multi Bank B', 'RBSC Multi', 'savings', '3333', '4444', false, 'pending_signature'),
    (gen_random_uuid(), v_multi, 'Multi Bank Old', 'RBSC Multi', 'checking', '5555', '6666', false, 'inactive');

  INSERT INTO rbsc_ids SELECT 'single_bank', id FROM public.onboarding_bank_accounts WHERE user_id = v_single;
  INSERT INTO rbsc_ids SELECT 'multi_bank_a', id FROM public.onboarding_bank_accounts WHERE user_id = v_multi AND bank_name = 'Multi Bank A';
  INSERT INTO rbsc_ids SELECT 'multi_bank_b', id FROM public.onboarding_bank_accounts WHERE user_id = v_multi AND bank_name = 'Multi Bank B';
END $$;

-- ===== single-account tenant: signing the only account completes onboarding right away =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbsc_ids WHERE key = 'single'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO rbsc_results
SELECT 'single_account_signature_completes_onboarding',
       (result->>'all_accounts_signed')::boolean = true,
       result::text
FROM (
  SELECT public.capture_tenant_payment_signature(
    (SELECT value FROM rbsc_ids WHERE key = 'single_bank'),
    'RBSC Single', 'Owner', 'v1', 'I agree', 'deadbeef'
  ) AS result
) sub;
RESET ROLE;

INSERT INTO rbsc_results
SELECT 'single_account_profile_marked_complete',
       banking_onboarding_completed = true,
       'banking_onboarding_completed=' || banking_onboarding_completed::text
FROM public.profiles WHERE id = (SELECT value FROM rbsc_ids WHERE key = 'single');

-- ===== multi-account tenant: signing the FIRST of two does NOT complete onboarding =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbsc_ids WHERE key = 'multi'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO rbsc_results
SELECT 'first_of_two_signatures_does_not_complete',
       (result->>'all_accounts_signed')::boolean = false,
       result::text
FROM (
  SELECT public.capture_tenant_payment_signature(
    (SELECT value FROM rbsc_ids WHERE key = 'multi_bank_a'),
    'RBSC Multi', 'Owner', 'v1', 'I agree', 'cafebabe'
  ) AS result
) sub;
RESET ROLE;

INSERT INTO rbsc_results
SELECT 'multi_account_profile_still_incomplete_after_first',
       banking_onboarding_completed = false,
       'banking_onboarding_completed=' || banking_onboarding_completed::text
FROM public.profiles WHERE id = (SELECT value FROM rbsc_ids WHERE key = 'multi');

-- ===== signing the SECOND (last pending, ignoring the inactive one) completes onboarding =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbsc_ids WHERE key = 'multi'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.capture_tenant_payment_signature(
  (SELECT value FROM rbsc_ids WHERE key = 'multi_bank_b'),
  'RBSC Multi', 'Owner', 'v1', 'I agree', 'f00dcafe'
);
RESET ROLE;

INSERT INTO rbsc_results
SELECT 'last_pending_signature_completes_onboarding_ignoring_inactive',
       banking_onboarding_completed = true,
       'banking_onboarding_completed=' || banking_onboarding_completed::text
FROM public.profiles WHERE id = (SELECT value FROM rbsc_ids WHERE key = 'multi');

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM rbsc_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
