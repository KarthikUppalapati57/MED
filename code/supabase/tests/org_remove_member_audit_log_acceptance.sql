-- Acceptance test for 20260719000009_org_remove_member_audit_log.sql
--
-- Verifies: (1) org_remove_member still detaches membership and resets role to ground_staff
-- exactly as before -- no regression, (2) it now also writes an audit_logs row recording who
-- removed whom, (3) a non-org_manager (location_manager) still cannot call it -- no
-- regression on the existing permission check.

BEGIN;

CREATE TEMP TABLE ormal_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE ormal_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON ormal_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ormal_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
BEGIN
  INSERT INTO ormal_ids(key, value) VALUES
    ('org', v_org), ('org_manager', v_org_manager), ('location_manager', v_location_manager), ('member', v_member);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'ORMAL Org', 'ormal-org-' || v_org);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'ormal-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'ormal-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_member, 'authenticated', 'authenticated', 'ormal-member@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id)
  VALUES
    (v_org_manager, 'ormal-org-manager@example.test', 'ORMAL Org Manager', 'org_manager', 'active', v_org),
    (v_location_manager, 'ormal-location-manager@example.test', 'ORMAL Location Manager', 'location_manager', 'active', v_org),
    (v_member, 'ormal-member@example.test', 'ORMAL Member', 'location_manager', 'active', v_org)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id) VALUES (v_org, v_member)
  ON CONFLICT DO NOTHING;
END $$;

-- ===== a location_manager still cannot remove a member (no permission regression) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM ormal_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.org_remove_member((SELECT value FROM ormal_ids WHERE key = 'member'));
    INSERT INTO ormal_results VALUES ('location_manager_cannot_remove', false, 'unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO ormal_results VALUES ('location_manager_cannot_remove', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== org_manager removes the member =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM ormal_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.org_remove_member((SELECT value FROM ormal_ids WHERE key = 'member'));

RESET ROLE;

INSERT INTO ormal_results
SELECT 'membership_detached_and_role_reset',
       organization_id IS NULL AND role = 'ground_staff',
       'organization_id=' || COALESCE(organization_id::text, 'NULL') || ' role=' || role
FROM public.profiles
WHERE id = (SELECT value FROM ormal_ids WHERE key = 'member');

INSERT INTO ormal_results
SELECT 'organization_members_row_deleted',
       NOT EXISTS (
         SELECT 1 FROM public.organization_members
         WHERE user_id = (SELECT value FROM ormal_ids WHERE key = 'member')
           AND organization_id = (SELECT value FROM ormal_ids WHERE key = 'org')
       ),
       'checked organization_members for the removed row';

INSERT INTO ormal_results
SELECT 'audit_log_written',
       EXISTS (
         SELECT 1 FROM public.audit_logs
         WHERE action = 'org_member_removed'
           AND organization_id = (SELECT value FROM ormal_ids WHERE key = 'org')
           AND user_id = (SELECT value FROM ormal_ids WHERE key = 'org_manager')
           AND entity_id = (SELECT value FROM ormal_ids WHERE key = 'member')::text
       ),
       'expected an audit_logs row recording org_manager removed member';

-- ===================== verdict =====================

SELECT * FROM ormal_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ormal_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'org_remove_member_audit_log_acceptance failed';
  END IF;
END $$;

ROLLBACK;
