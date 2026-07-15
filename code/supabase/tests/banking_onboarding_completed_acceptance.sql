-- Acceptance test for 20260719000002_banking_onboarding_completed.sql
--
-- Verifies: (1) banking_onboarding_completed defaults false and is untouched by hierarchy/
-- payment flows, (2) submitting a bank account alone does NOT flip it, (3) capturing a
-- signature on a 'custom' billing address with missing fields is rejected and does NOT flip
-- it, (4) capturing a signature with a complete custom address succeeds, marks the account
-- 'authorized', and flips the flag, (5) ownership is enforced (a different user's bank
-- account cannot be signed).

BEGIN;

CREATE TEMP TABLE boc_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE boc_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON boc_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON boc_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
BEGIN
  INSERT INTO boc_ids(key, value) VALUES ('tenant', v_tenant), ('other', v_other);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_tenant, 'authenticated', 'authenticated', 'boc-tenant@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'boc-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES
    (v_tenant, 'boc-tenant@example.test', 'BOC Tenant', 'tenant_super_admin', 'active'),
    (v_other, 'boc-other@example.test', 'BOC Other', 'tenant_super_admin', 'active')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status;
END $$;

INSERT INTO boc_results
SELECT 'flag_defaults_false',
       banking_onboarding_completed = false,
       'banking_onboarding_completed=' || banking_onboarding_completed
FROM public.profiles
WHERE id = (SELECT value FROM boc_ids WHERE key = 'tenant');

-- ===== submit a bank account with billing_address_source='custom' but incomplete address =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM boc_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.submit_onboarding_bank_account(jsonb_build_object(
    'bank_name', 'Test Bank',
    'account_holder_name', 'BOC Tenant',
    'account_type', 'checking',
    'routing_number', '123456789',
    'account_number', '000123456789',
    'billing_address_source', 'custom',
    'billing_address_line1', '100 Main St',
    'billing_address_city', 'Knoxville'
    -- state/postal_code/country deliberately omitted -- incomplete custom address
  ));
  INSERT INTO boc_ids(key, value) VALUES ('bank_incomplete', (v_result->'bank_account'->>'id')::uuid);
END $$;

RESET ROLE;

INSERT INTO boc_results
SELECT 'submit_does_not_flip_flag',
       banking_onboarding_completed = false,
       'banking_onboarding_completed=' || banking_onboarding_completed
FROM public.profiles
WHERE id = (SELECT value FROM boc_ids WHERE key = 'tenant');

-- ===== attempt to capture signature with the incomplete custom address: must fail =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM boc_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.capture_tenant_payment_signature(
      (SELECT value FROM boc_ids WHERE key = 'bank_incomplete'),
      'BOC Tenant', 'Owner', 'tenant-bank-authorization-v1', 'I authorize...', 'deadbeef'
    );
    INSERT INTO boc_results VALUES ('incomplete_custom_address_rejected', false, 'signature capture unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO boc_results VALUES ('incomplete_custom_address_rejected', true, SQLERRM);
  END;
END $$;

RESET ROLE;

INSERT INTO boc_results
SELECT 'incomplete_custom_address_flag_still_false',
       banking_onboarding_completed = false,
       'banking_onboarding_completed=' || banking_onboarding_completed
FROM public.profiles
WHERE id = (SELECT value FROM boc_ids WHERE key = 'tenant');

-- ===== submit a second bank account with a complete custom address, capture signature: must succeed =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM boc_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.submit_onboarding_bank_account(jsonb_build_object(
    'bank_name', 'Test Bank',
    'account_holder_name', 'BOC Tenant',
    'account_type', 'checking',
    'routing_number', '123456789',
    'account_number', '000987654321',
    'is_default', true,
    'billing_address_source', 'custom',
    'billing_address_line1', '100 Main St',
    'billing_address_city', 'Knoxville',
    'billing_address_state', 'TN',
    'billing_address_postal_code', '37902',
    'billing_address_country', 'United States'
  ));
  INSERT INTO boc_ids(key, value) VALUES ('bank_complete', (v_result->'bank_account'->>'id')::uuid);
END $$;

RESET ROLE;

-- ===== a different user cannot sign this bank account =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM boc_ids WHERE key = 'other'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.capture_tenant_payment_signature(
      (SELECT value FROM boc_ids WHERE key = 'bank_complete'),
      'BOC Other', 'Owner', 'tenant-bank-authorization-v1', 'I authorize...', 'deadbeef'
    );
    INSERT INTO boc_results VALUES ('cross_user_signature_denied', false, 'cross-user signature capture unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO boc_results VALUES ('cross_user_signature_denied', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== the owner signs it: must succeed and flip the flag =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM boc_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.capture_tenant_payment_signature(
  (SELECT value FROM boc_ids WHERE key = 'bank_complete'),
  'BOC Tenant', 'Owner', 'tenant-bank-authorization-v1', 'I authorize...', 'deadbeef'
);

RESET ROLE;

INSERT INTO boc_results
SELECT 'bank_account_marked_authorized',
       status = 'authorized',
       'status=' || status
FROM public.onboarding_bank_accounts
WHERE id = (SELECT value FROM boc_ids WHERE key = 'bank_complete');

INSERT INTO boc_results
SELECT 'flag_flips_true_after_valid_signature',
       banking_onboarding_completed = true,
       'banking_onboarding_completed=' || banking_onboarding_completed
FROM public.profiles
WHERE id = (SELECT value FROM boc_ids WHERE key = 'tenant');

-- ===================== verdict =====================

SELECT * FROM boc_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM boc_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'banking_onboarding_completed_acceptance failed';
  END IF;
END $$;

ROLLBACK;
