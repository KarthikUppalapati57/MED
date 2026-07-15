-- Acceptance test for 20260719000001_fix_business_verification_review_actions.sql
--
-- Verifies: (1) reject and request_more_info both produce exactly ONE notification for the
-- tenant (not two), (2) request_more_info now sets 'failed' (editable/resubmittable) instead
-- of the dead-end 'pending_review', (3) approve still produces exactly one notification and
-- moves status to 'verified', (4) get_my_business_verification_draft surfaces the reason.

BEGIN;

CREATE TEMP TABLE bvra_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE bvra_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON bvra_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bvra_results TO authenticated;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO bvra_ids(key, value) VALUES ('admin', v_admin), ('tenant_a', v_tenant_a), ('tenant_b', v_tenant_b);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'bvra-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_a, 'authenticated', 'authenticated', 'bvra-tenant-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_b, 'authenticated', 'authenticated', 'bvra-tenant-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, onboarding_status, onboarding_current_step, business_email, business_email_verified_at, business_phone, business_phone_verified_at)
  VALUES
    (v_admin, 'bvra-admin@example.test', 'BVRA Admin', 'platform_admin', 'active', 'not_started', 'not_started', 'business_verification', NULL, NULL, NULL, NULL),
    (v_tenant_a, 'bvra-tenant-a@example.test', 'BVRA Tenant A', 'tenant_super_admin', 'active', 'pending_review', 'pending_review', 'business_verification', 'bvra-tenant-a@example.test', now(), '+18655550100', now()),
    (v_tenant_b, 'bvra-tenant-b@example.test', 'BVRA Tenant B', 'tenant_super_admin', 'active', 'pending_review', 'pending_review', 'business_verification', 'bvra-tenant-b@example.test', now(), '+18655550101', now())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    onboarding_status = EXCLUDED.onboarding_status,
    onboarding_current_step = EXCLUDED.onboarding_current_step,
    business_email = EXCLUDED.business_email,
    business_email_verified_at = EXCLUDED.business_email_verified_at,
    business_phone = EXCLUDED.business_phone,
    business_phone_verified_at = EXCLUDED.business_phone_verified_at;

  INSERT INTO public.business_verifications (user_id, legal_business_name, business_type, identifier_type, identifier_last4, provider_name, verification_status, trust_score, metadata)
  VALUES
    (v_tenant_a, 'BVRA Tenant A LLC', 'llc', 'ein', '1234', 'local_simulation', 'pending_review', 70, jsonb_build_object('email', 'bvra-tenant-a@example.test', 'phone', '+18655550100')),
    (v_tenant_b, 'BVRA Tenant B LLC', 'llc', 'ein', '5678', 'local_simulation', 'pending_review', 70, jsonb_build_object('email', 'bvra-tenant-b@example.test', 'phone', '+18655550101'));
END $$;

-- RPC calls run impersonated as the platform admin (needed so get_auth_role() inside the
-- RPCs resolves correctly); assertions run afterward as postgres (RESET ROLE) so they aren't
-- subject to business_verifications/profiles/notifications RLS or missing authenticated
-- grants -- matching the "run as postgres so it's unaffected by RLS" convention used in
-- tenant_super_admin_identity_rls_acceptance.sql.

-- ===== request_more_info on tenant A: must reopen (status='failed'), single notification =====
-- (the seed INSERT above already fired trg_notify_business_verification_review_state once,
-- since a fresh 'pending_review' row is itself a notify-worthy status -- clear that baseline
-- notification so this assertion measures only what request_onboarding_more_info itself causes.)

DELETE FROM public.notifications WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bvra_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.request_onboarding_more_info(
  (SELECT value FROM bvra_ids WHERE key = 'tenant_a'),
  'Please correct your business phone number.'
);
RESET ROLE;

INSERT INTO bvra_results
SELECT 'more_info_sets_failed_status_business_verifications',
       verification_status = 'failed',
       'verification_status=' || verification_status
FROM public.business_verifications
WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

INSERT INTO bvra_results
SELECT 'more_info_sets_failed_status_profiles',
       business_verification_status = 'failed' AND onboarding_status = 'blocked',
       'business_verification_status=' || business_verification_status || ' onboarding_status=' || onboarding_status
FROM public.profiles
WHERE id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

INSERT INTO bvra_results
SELECT 'more_info_produces_exactly_one_tenant_notification',
       count(*) = 1,
       'count=' || count(*)
FROM public.notifications
WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

-- ===== reject on tenant B: single notification, status='failed' =====
-- (same baseline-clear reasoning as tenant A above.)

DELETE FROM public.notifications WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_b');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bvra_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.reject_business_verification(
  (SELECT value FROM bvra_ids WHERE key = 'tenant_b'),
  'EIN could not be verified.'
);
RESET ROLE;

INSERT INTO bvra_results
SELECT 'reject_produces_exactly_one_tenant_notification',
       count(*) = 1,
       'count=' || count(*)
FROM public.notifications
WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_b');

-- ===== approve on tenant A (after "resubmission" -- just flip back to pending_review to
-- simulate the tenant having fixed and resubmitted): still single notification, status='verified' =====

UPDATE public.business_verifications SET verification_status = 'pending_review' WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');
UPDATE public.profiles SET business_verification_status = 'pending_review' WHERE id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');
DELETE FROM public.notifications WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bvra_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.approve_business_verification(
  (SELECT value FROM bvra_ids WHERE key = 'tenant_a'),
  'Looks good.'
);
RESET ROLE;

INSERT INTO bvra_results
SELECT 'approve_sets_verified_status',
       business_verification_status = 'verified',
       'business_verification_status=' || business_verification_status
FROM public.profiles
WHERE id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

INSERT INTO bvra_results
SELECT 'approve_produces_exactly_one_tenant_notification',
       count(*) = 1,
       'count=' || count(*)
FROM public.notifications
WHERE user_id = (SELECT value FROM bvra_ids WHERE key = 'tenant_a');

-- ===== get_my_business_verification_draft surfaces the reason to the tenant (tenant B, still 'failed') =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM bvra_ids WHERE key = 'tenant_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO bvra_results
SELECT 'draft_surfaces_rejection_reason',
       (public.get_my_business_verification_draft()->>'rejection_reason') = 'EIN could not be verified.',
       COALESCE(public.get_my_business_verification_draft()->>'rejection_reason', '<null>');
RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM bvra_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bvra_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'fix_business_verification_review_actions_acceptance failed';
  END IF;
END $$;

ROLLBACK;
