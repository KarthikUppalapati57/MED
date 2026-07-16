-- Acceptance test for 20260720000014_reject_business_verification_terminal_status.sql
--
-- Verifies: (1) reject_business_verification now sets 'rejected' (a new, distinct status)
-- rather than 'failed', on both business_verifications and profiles; (2)
-- request_onboarding_more_info is unchanged -- still sets 'failed' (resubmittable) --
-- proving Reject and Ask-to-resubmit are no longer the same state; (3) reject still
-- produces exactly one tenant notification (no duplicate-notification regression); (4)
-- platform_business_verification_reviews() surfaces 'rejected' rows to admins; (5) approve is
-- unaffected and still sets 'verified'.

BEGIN;

SELECT plan(7);

CREATE TEMP TABLE rbts_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rbts_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON rbts_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rbts_results TO authenticated;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_tenant_rejected uuid := gen_random_uuid();
  v_tenant_resubmit uuid := gen_random_uuid();
  v_tenant_approved uuid := gen_random_uuid();
BEGIN
  INSERT INTO rbts_ids(key, value) VALUES
    ('admin', v_admin),
    ('tenant_rejected', v_tenant_rejected),
    ('tenant_resubmit', v_tenant_resubmit),
    ('tenant_approved', v_tenant_approved);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'rbts-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_rejected, 'authenticated', 'authenticated', 'rbts-tenant-rejected@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_resubmit, 'authenticated', 'authenticated', 'rbts-tenant-resubmit@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_tenant_approved, 'authenticated', 'authenticated', 'rbts-tenant-approved@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, onboarding_status, onboarding_current_step, business_email, business_email_verified_at, business_phone, business_phone_verified_at)
  VALUES
    (v_admin, 'rbts-admin@example.test', 'RBTS Admin', 'platform_admin', 'active', 'not_started', 'not_started', 'business_verification', NULL, NULL, NULL, NULL),
    (v_tenant_rejected, 'rbts-tenant-rejected@example.test', 'RBTS Tenant Rejected', 'tenant_super_admin', 'active', 'pending_review', 'pending_review', 'business_verification', 'rbts-tenant-rejected@example.test', now(), '+18655550200', now()),
    (v_tenant_resubmit, 'rbts-tenant-resubmit@example.test', 'RBTS Tenant Resubmit', 'tenant_super_admin', 'active', 'pending_review', 'pending_review', 'business_verification', 'rbts-tenant-resubmit@example.test', now(), '+18655550201', now()),
    (v_tenant_approved, 'rbts-tenant-approved@example.test', 'RBTS Tenant Approved', 'tenant_super_admin', 'active', 'pending_review', 'pending_review', 'business_verification', 'rbts-tenant-approved@example.test', now(), '+18655550202', now())
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
    (v_tenant_rejected, 'RBTS Tenant Rejected LLC', 'llc', 'ein', '1111', 'local_simulation', 'pending_review', 40, jsonb_build_object('email', 'rbts-tenant-rejected@example.test', 'phone', '+18655550200')),
    (v_tenant_resubmit, 'RBTS Tenant Resubmit LLC', 'llc', 'ein', '2222', 'local_simulation', 'pending_review', 70, jsonb_build_object('email', 'rbts-tenant-resubmit@example.test', 'phone', '+18655550201')),
    (v_tenant_approved, 'RBTS Tenant Approved LLC', 'llc', 'ein', '3333', 'local_simulation', 'pending_review', 90, jsonb_build_object('email', 'rbts-tenant-approved@example.test', 'phone', '+18655550202'));
END $$;

-- RPC calls run impersonated as the platform admin; assertions run as postgres (RESET ROLE)
-- so they aren't subject to RLS/grants, matching the convention in
-- fix_business_verification_review_actions_acceptance.sql.

-- ===== reject on tenant_rejected: must set 'rejected' (NOT 'failed'), single notification =====

DELETE FROM public.notifications WHERE user_id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbts_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.reject_business_verification(
  (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected'),
  'EIN could not be verified and does not match business records.'
);
RESET ROLE;

INSERT INTO rbts_results
SELECT 'reject_sets_rejected_on_business_verifications',
       verification_status = 'rejected',
       'verification_status=' || verification_status
FROM public.business_verifications
WHERE user_id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected');

INSERT INTO rbts_results
SELECT 'reject_sets_rejected_on_profiles',
       business_verification_status = 'rejected' AND onboarding_status = 'blocked',
       'business_verification_status=' || business_verification_status || ' onboarding_status=' || onboarding_status
FROM public.profiles
WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected');

INSERT INTO rbts_results
SELECT 'reject_produces_exactly_one_tenant_notification',
       count(*) = 1,
       'count=' || count(*)
FROM public.notifications
WHERE user_id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected');

-- ===== request_more_info on tenant_resubmit: unchanged, still sets 'failed' (resubmittable) =====

DELETE FROM public.notifications WHERE user_id = (SELECT value FROM rbts_ids WHERE key = 'tenant_resubmit');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbts_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.request_onboarding_more_info(
  (SELECT value FROM rbts_ids WHERE key = 'tenant_resubmit'),
  'Please correct your business phone number.'
);
RESET ROLE;

INSERT INTO rbts_results
SELECT 'resubmit_still_sets_failed_not_rejected',
       business_verification_status = 'failed',
       'business_verification_status=' || business_verification_status
FROM public.profiles
WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_resubmit');

-- ===== rejected user is distinguishable from resubmit user (the actual regression being fixed) =====

INSERT INTO rbts_results
SELECT 'rejected_and_resubmit_are_different_statuses',
       (SELECT business_verification_status FROM public.profiles WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected'))
         <> (SELECT business_verification_status FROM public.profiles WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_resubmit')),
       'rejected=' || (SELECT business_verification_status FROM public.profiles WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected'))
         || ' resubmit=' || (SELECT business_verification_status FROM public.profiles WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_resubmit'));

-- ===== platform_business_verification_reviews() surfaces the rejected row to admins =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbts_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO rbts_results
SELECT 'review_queue_includes_rejected_row',
       EXISTS (
         SELECT 1 FROM public.platform_business_verification_reviews() r
         WHERE r.user_id = (SELECT value FROM rbts_ids WHERE key = 'tenant_rejected')
           AND r.verification_status = 'rejected'
       ),
       'checked';
RESET ROLE;

-- ===== approve on tenant_approved: unaffected by this migration, still sets 'verified' =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rbts_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.approve_business_verification(
  (SELECT value FROM rbts_ids WHERE key = 'tenant_approved'),
  'Looks good.'
);
RESET ROLE;

INSERT INTO rbts_results
SELECT 'approve_still_sets_verified_status',
       business_verification_status = 'verified',
       'business_verification_status=' || business_verification_status
FROM public.profiles
WHERE id = (SELECT value FROM rbts_ids WHERE key = 'tenant_approved');

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM rbts_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
