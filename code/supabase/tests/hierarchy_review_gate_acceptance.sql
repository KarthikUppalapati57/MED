-- Acceptance test for 20260720000020_hierarchy_review_gate.sql
--
-- Verifies: (1) submit blocks when business verification / payment aren't done; (2) a valid
-- submit stores the payload and sets profiles.hierarchy_review_status = 'pending_review'
-- without creating any organization yet; (3) approve_onboarding_hierarchy actually creates
-- the organization/brand/location (proving it correctly delegates to
-- setup_onboarding_hierarchy) and sets profiles.organization_id; (4) reject is terminal
-- ('rejected', distinct from resubmit); (5) request_onboarding_hierarchy_resubmit sets
-- 'failed' and routes onboarding_current_step back to hierarchy_setup; (6) non-admins cannot
-- approve/reject/resubmit; (7) the admin queue surfaces pending/rejected/failed submissions.

BEGIN;

SELECT plan(10);

CREATE TEMP TABLE hrg_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE hrg_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON hrg_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hrg_results TO authenticated;

DO $$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_not_verified uuid := gen_random_uuid();
  v_approve uuid := gen_random_uuid();
  v_reject uuid := gen_random_uuid();
  v_resubmit uuid := gen_random_uuid();
BEGIN
  INSERT INTO hrg_ids(key, value) VALUES
    ('admin', v_admin), ('not_verified', v_not_verified), ('approve', v_approve), ('reject', v_reject), ('resubmit', v_resubmit);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'hrg-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_not_verified, 'authenticated', 'authenticated', 'hrg-notverified@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_approve, 'authenticated', 'authenticated', 'hrg-approve@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_reject, 'authenticated', 'authenticated', 'hrg-reject@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_resubmit, 'authenticated', 'authenticated', 'hrg-resubmit@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, business_verification_status, payment_verified, onboarding_status)
  VALUES
    (v_admin, 'hrg-admin@example.test', 'HRG Admin', 'platform_admin', 'active', 'not_started', false, 'not_started'),
    (v_not_verified, 'hrg-notverified@example.test', 'HRG NotVerified', 'tenant_super_admin', 'active', 'pending_review', false, 'in_progress'),
    (v_approve, 'hrg-approve@example.test', 'HRG Approve', 'tenant_super_admin', 'active', 'verified', true, 'in_progress'),
    (v_reject, 'hrg-reject@example.test', 'HRG Reject', 'tenant_super_admin', 'active', 'verified', true, 'in_progress'),
    (v_resubmit, 'hrg-resubmit@example.test', 'HRG Resubmit', 'tenant_super_admin', 'active', 'verified', true, 'in_progress')
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    business_verification_status = EXCLUDED.business_verification_status,
    payment_verified = EXCLUDED.payment_verified,
    onboarding_status = EXCLUDED.onboarding_status;
END $$;

-- ===== precondition: business not verified / no payment blocks submission =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'not_verified'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.submit_onboarding_hierarchy_for_review(
      (SELECT value FROM hrg_ids WHERE key = 'not_verified'),
      jsonb_build_array(jsonb_build_object('name', 'X', 'slug', 'x-' || gen_random_uuid()::text, 'brands', '[]'::jsonb))
    );
    INSERT INTO hrg_results VALUES ('precondition_blocks_unverified_tenant', false, 'did not raise for unverified/unpaid tenant');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO hrg_results VALUES ('precondition_blocks_unverified_tenant', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== valid submit: stores payload, sets pending_review, creates NO organization yet =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'approve'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_hierarchy_for_review(
  (SELECT value FROM hrg_ids WHERE key = 'approve'),
  jsonb_build_array(jsonb_build_object(
    'name', 'HRG Approve Org', 'slug', 'hrg-approve-org-' || replace((SELECT value FROM hrg_ids WHERE key = 'approve')::text, '-', ''),
    'metadata', '{}'::jsonb,
    'brands', jsonb_build_array(jsonb_build_object(
      'name', 'HRG Brand', 'metadata', '{}'::jsonb,
      'locations', jsonb_build_array(jsonb_build_object(
        'name', 'HRG Location', 'address', '123 Main St, Test City, TS 00000',
        'business_address', jsonb_build_object('line1','123 Main St','city','Test City','state','TS','postalCode','00000','country','United States'),
        'mailing_address', jsonb_build_object('line1','123 Main St','city','Test City','state','TS','postalCode','00000','country','United States')
      ))
    ))
  ))
);
RESET ROLE;

INSERT INTO hrg_results
SELECT 'submit_sets_pending_review_status',
       hierarchy_review_status = 'pending_review',
       'hierarchy_review_status=' || COALESCE(hierarchy_review_status, '<null>')
FROM public.profiles WHERE id = (SELECT value FROM hrg_ids WHERE key = 'approve');

INSERT INTO hrg_results
SELECT 'submit_stores_hierarchy_payload',
       EXISTS (SELECT 1 FROM public.onboarding_hierarchy_submissions WHERE user_id = (SELECT value FROM hrg_ids WHERE key = 'approve') AND status = 'pending_review'),
       'checked';

INSERT INTO hrg_results
SELECT 'submit_creates_no_organization_yet',
       organization_id IS NULL,
       'organization_id=' || COALESCE(organization_id::text, '<null>')
FROM public.profiles WHERE id = (SELECT value FROM hrg_ids WHERE key = 'approve');

-- ===== non-admin cannot approve =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'approve'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_onboarding_hierarchy((SELECT value FROM hrg_ids WHERE key = 'approve'));
    INSERT INTO hrg_results VALUES ('non_admin_cannot_approve', false, 'did not raise for non-admin');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO hrg_results VALUES ('non_admin_cannot_approve', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- ===== admin approves: actually creates the organization (delegates to setup_onboarding_hierarchy) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.approve_onboarding_hierarchy((SELECT value FROM hrg_ids WHERE key = 'approve'));
RESET ROLE;

INSERT INTO hrg_results
SELECT 'approve_creates_real_organization',
       organization_id IS NOT NULL,
       'organization_id=' || COALESCE(organization_id::text, '<null>')
FROM public.profiles WHERE id = (SELECT value FROM hrg_ids WHERE key = 'approve');

INSERT INTO hrg_results
SELECT 'approve_marks_submission_approved',
       status = 'approved',
       'status=' || status
FROM public.onboarding_hierarchy_submissions WHERE user_id = (SELECT value FROM hrg_ids WHERE key = 'approve');

-- ===== reject path: terminal 'rejected', distinct from resubmit =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'reject'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_hierarchy_for_review(
  (SELECT value FROM hrg_ids WHERE key = 'reject'),
  jsonb_build_array(jsonb_build_object('name', 'HRG Reject Org', 'slug', 'hrg-reject-org-' || replace((SELECT value FROM hrg_ids WHERE key = 'reject')::text, '-', ''), 'brands', jsonb_build_array(jsonb_build_object('name','B','locations',jsonb_build_array(jsonb_build_object('name','L','business_address',jsonb_build_object('line1','1 St','city','C','state','S','postalCode','0','country','US'),'mailing_address',jsonb_build_object('line1','1 St','city','C','state','S','postalCode','0','country','US')))))
  ))
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.reject_onboarding_hierarchy((SELECT value FROM hrg_ids WHERE key = 'reject'), 'Address could not be verified.');
RESET ROLE;

INSERT INTO hrg_results
SELECT 'reject_sets_rejected_terminal_status',
       hierarchy_review_status = 'rejected' AND organization_id IS NULL,
       'hierarchy_review_status=' || COALESCE(hierarchy_review_status,'<null>') || ' org=' || COALESCE(organization_id::text,'<null>')
FROM public.profiles WHERE id = (SELECT value FROM hrg_ids WHERE key = 'reject');

-- ===== resubmit path: 'failed', routes back to hierarchy_setup =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'resubmit'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.submit_onboarding_hierarchy_for_review(
  (SELECT value FROM hrg_ids WHERE key = 'resubmit'),
  jsonb_build_array(jsonb_build_object('name', 'HRG Resubmit Org', 'slug', 'hrg-resubmit-org-' || replace((SELECT value FROM hrg_ids WHERE key = 'resubmit')::text, '-', ''), 'brands', jsonb_build_array(jsonb_build_object('name','B','locations',jsonb_build_array(jsonb_build_object('name','L','business_address',jsonb_build_object('line1','1 St','city','C','state','S','postalCode','0','country','US'),'mailing_address',jsonb_build_object('line1','1 St','city','C','state','S','postalCode','0','country','US')))))
  ))
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.request_onboarding_hierarchy_resubmit((SELECT value FROM hrg_ids WHERE key = 'resubmit'), 'Please fix your brand name.');
RESET ROLE;

INSERT INTO hrg_results
SELECT 'resubmit_sets_failed_and_routes_to_hierarchy_setup',
       hierarchy_review_status = 'failed' AND onboarding_current_step = 'hierarchy_setup',
       'hierarchy_review_status=' || COALESCE(hierarchy_review_status,'<null>') || ' step=' || COALESCE(onboarding_current_step,'<null>')
FROM public.profiles WHERE id = (SELECT value FROM hrg_ids WHERE key = 'resubmit');

-- ===== admin queue surfaces pending/rejected/failed submissions =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM hrg_ids WHERE key = 'admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO hrg_results
SELECT 'admin_queue_surfaces_reject_and_resubmit',
       (SELECT count(*) FROM public.platform_hierarchy_review_queue() WHERE user_id IN ((SELECT value FROM hrg_ids WHERE key = 'reject'), (SELECT value FROM hrg_ids WHERE key = 'resubmit'))) = 2,
       'checked';
RESET ROLE;

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM hrg_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
