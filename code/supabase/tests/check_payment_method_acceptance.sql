-- Acceptance test for 20260720000016_check_payment_method.sql
--
-- Verifies: (1) profiles.payment_method_type now accepts 'check'; (2) a non-admin cannot call
-- confirm_check_payment_received (platform_admin gate); (3) confirming a check payment sets
-- payment_verified = true and payment_method_verified_at; (4) it fails loudly for a tenant who
-- isn't actually on the 'check' method (guards against confirming the wrong payment path);
-- (5) it produces a tenant notification.

BEGIN;

SELECT plan(5);

CREATE TEMP TABLE cpm_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE cpm_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON cpm_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cpm_results TO authenticated;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_tenant_check uuid := gen_random_uuid();
  v_tenant_card uuid := gen_random_uuid();
  v_non_admin uuid := gen_random_uuid();
BEGIN
  INSERT INTO cpm_ids(key, value) VALUES
    ('admin', v_admin), ('tenant_check', v_tenant_check), ('tenant_card', v_tenant_card), ('non_admin', v_non_admin);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'cpm-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_check, 'authenticated', 'authenticated', 'cpm-tenant-check@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_card, 'authenticated', 'authenticated', 'cpm-tenant-card@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_non_admin, 'authenticated', 'authenticated', 'cpm-nonadmin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, onboarding_status, payment_verified, payment_method_type)
  VALUES
    (v_admin, 'cpm-admin@example.test', 'CPM Admin', 'platform_admin', 'active', 'verified', 'in_progress', false, NULL),
    (v_tenant_check, 'cpm-tenant-check@example.test', 'CPM Tenant Check', 'tenant_super_admin', 'active', 'verified', 'in_progress', false, 'check'),
    (v_tenant_card, 'cpm-tenant-card@example.test', 'CPM Tenant Card', 'tenant_super_admin', 'active', 'verified', 'in_progress', false, 'stripe_subscription'),
    (v_non_admin, 'cpm-nonadmin@example.test', 'CPM Non Admin', 'ground_staff', 'active', 'not_started', 'not_started', false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    onboarding_status = EXCLUDED.onboarding_status,
    payment_verified = EXCLUDED.payment_verified,
    payment_method_type = EXCLUDED.payment_method_type;
END $$;

-- ===== profiles.payment_method_type accepts 'check' (proven by the seed insert above succeeding) =====

INSERT INTO cpm_results
SELECT 'payment_method_type_accepts_check',
       payment_method_type = 'check',
       'payment_method_type=' || payment_method_type
FROM public.profiles WHERE id = (SELECT value FROM cpm_ids WHERE key = 'tenant_check');

-- ===== non-admin cannot confirm =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM cpm_ids WHERE key = 'non_admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_check_payment_received((SELECT value FROM cpm_ids WHERE key = 'tenant_check'), 'attempted by non-admin');
    INSERT INTO cpm_results VALUES ('non_admin_cannot_confirm', false, 'RPC did not raise for a non-admin caller');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO cpm_results VALUES ('non_admin_cannot_confirm', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== confirming the wrong tenant (not on 'check') fails loudly =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM cpm_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_check_payment_received((SELECT value FROM cpm_ids WHERE key = 'tenant_card'), 'wrong tenant');
    INSERT INTO cpm_results VALUES ('rejects_tenant_not_on_check_method', false, 'RPC did not raise for a tenant on stripe_subscription');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO cpm_results VALUES ('rejects_tenant_not_on_check_method', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== admin confirms the real check-payment tenant: succeeds, sets payment_verified =====

DELETE FROM public.notifications WHERE user_id = (SELECT value FROM cpm_ids WHERE key = 'tenant_check');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM cpm_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.confirm_check_payment_received(
  (SELECT value FROM cpm_ids WHERE key = 'tenant_check'),
  'Check #1042 deposited and cleared.'
);
RESET ROLE;

INSERT INTO cpm_results
SELECT 'confirm_sets_payment_verified',
       payment_verified = true AND payment_method_verified_at IS NOT NULL,
       'payment_verified=' || payment_verified || ' verified_at=' || COALESCE(payment_method_verified_at::text, '<null>')
FROM public.profiles WHERE id = (SELECT value FROM cpm_ids WHERE key = 'tenant_check');

INSERT INTO cpm_results
SELECT 'confirm_produces_tenant_notification',
       count(*) >= 1,
       'count=' || count(*)
FROM public.notifications
WHERE user_id = (SELECT value FROM cpm_ids WHERE key = 'tenant_check');

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM cpm_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
