-- Acceptance test for 20260720000017_tax_identifier_vault_reveal.sql
--
-- Verifies: (1) submit_business_verification stores the full identifier in Vault and points
-- business_verifications.tax_identifier_secret_id at it; (2) the identifier_last4 behavior
-- (still masked) is unchanged; (3) reveal_my_tax_identifier() returns the correct full value
-- to the OWNING tenant; (4) it is self-only -- a different authenticated user (with no
-- business_verifications row of their own) cannot use it to see anyone else's data, and gets
-- their own "nothing to reveal" error, never someone else's identifier; (5) resubmitting with
-- a different identifier re-stores a fresh secret and reveal returns the NEW value, not the
-- old one.

BEGIN;

SELECT plan(5);

CREATE TEMP TABLE tivr_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE tivr_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON tivr_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tivr_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
BEGIN
  INSERT INTO tivr_ids(key, value) VALUES ('tenant', v_tenant), ('other', v_other);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_tenant, 'authenticated', 'authenticated', 'tivr-tenant@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'tivr-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, onboarding_status, onboarding_current_step, business_email, business_email_verified_at, business_phone, business_phone_verified_at)
  VALUES
    (v_tenant, 'tivr-tenant@example.test', 'TIVR Tenant', 'tenant_super_admin', 'active', 'not_started', 'not_started', 'business_verification', 'tivr-tenant@example.test', now(), '+18655550300', now()),
    (v_other, 'tivr-other@example.test', 'TIVR Other', 'tenant_super_admin', 'active', 'not_started', 'not_started', 'business_verification', NULL, NULL, NULL, NULL)
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

-- ===== tenant submits business verification with a real-looking EIN =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tivr_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_business_verification(jsonb_build_object(
  'legalName', 'TIVR Tenant LLC',
  'businessType', 'llc',
  'identifierType', 'ein',
  'taxIdentifier', '123456789',
  'email', 'tivr-tenant@example.test',
  'phone', '+18655550300',
  'website', 'https://tivr-tenant.example.test'
));
RESET ROLE;

INSERT INTO tivr_results
SELECT 'submit_stores_masked_last4_unchanged',
       identifier_last4 = '6789',
       'identifier_last4=' || COALESCE(identifier_last4, '<null>')
FROM public.business_verifications WHERE user_id = (SELECT value FROM tivr_ids WHERE key = 'tenant');

INSERT INTO tivr_results
SELECT 'submit_stores_vault_secret_pointer',
       tax_identifier_secret_id IS NOT NULL,
       'tax_identifier_secret_id=' || COALESCE(tax_identifier_secret_id::text, '<null>')
FROM public.business_verifications WHERE user_id = (SELECT value FROM tivr_ids WHERE key = 'tenant');

-- ===== owning tenant can reveal the full value =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tivr_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO tivr_results
SELECT 'owner_can_reveal_full_identifier',
       (public.reveal_my_tax_identifier()->>'full_identifier') = '123456789',
       'result=' || COALESCE(public.reveal_my_tax_identifier()->>'full_identifier', '<null>');
RESET ROLE;

-- ===== a different authenticated user cannot see the tenant's identifier -- they only ever
-- get their OWN "nothing to reveal" error, never someone else's data =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tivr_ids WHERE key = 'other'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.reveal_my_tax_identifier();
    INSERT INTO tivr_results VALUES ('other_user_gets_no_data_not_tenants', false, 'reveal_my_tax_identifier did not raise for a user with no verification of their own');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO tivr_results VALUES ('other_user_gets_no_data_not_tenants', SQLERRM = 'No stored tax identifier to reveal', SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== resubmission with a different identifier re-stores a fresh secret; reveal returns the
-- NEW value, not the old one =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tivr_ids WHERE key = 'tenant'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_business_verification(jsonb_build_object(
  'legalName', 'TIVR Tenant LLC',
  'businessType', 'llc',
  'identifierType', 'ein',
  'taxIdentifier', '987654321',
  'email', 'tivr-tenant@example.test',
  'phone', '+18655550300',
  'website', 'https://tivr-tenant.example.test'
));
INSERT INTO tivr_results
SELECT 'resubmission_reveals_new_value_not_old',
       (public.reveal_my_tax_identifier()->>'full_identifier') = '987654321',
       'result=' || COALESCE(public.reveal_my_tax_identifier()->>'full_identifier', '<null>');
RESET ROLE;

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM tivr_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
