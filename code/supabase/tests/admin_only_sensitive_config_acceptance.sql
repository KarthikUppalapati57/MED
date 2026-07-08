BEGIN;

CREATE TEMP TABLE batch3c4_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE batch3c4_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c4_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch3c4_results TO authenticated, anon, service_role;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_org_c uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_owner_c uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_archived_brand_a uuid := gen_random_uuid();
  v_archived_brand_b uuid := gen_random_uuid();
  v_archived_location_a uuid := gen_random_uuid();
  v_archived_profile_a uuid := gen_random_uuid();
  v_archived_invitation_a uuid := gen_random_uuid();
  v_business_a uuid := gen_random_uuid();
  v_business_b uuid := gen_random_uuid();
  v_franchise_ab uuid := gen_random_uuid();
  v_franchise_bc uuid := gen_random_uuid();
  v_subscription_a uuid := gen_random_uuid();
  v_subscription_b uuid := gen_random_uuid();
  v_insight_a uuid := gen_random_uuid();
  v_insight_b uuid := gen_random_uuid();
BEGIN
  INSERT INTO batch3c4_ids(key, value) VALUES
    ('org_a', v_org_a), ('org_b', v_org_b), ('org_c', v_org_c),
    ('brand1', v_brand1), ('brand2', v_brand2), ('loc1', v_loc1), ('loc2', v_loc2),
    ('owner_a', v_owner_a), ('owner_b', v_owner_b), ('owner_c', v_owner_c),
    ('branch', v_branch), ('location', v_location), ('ground', v_ground),
    ('archived_brand_a', v_archived_brand_a), ('archived_brand_b', v_archived_brand_b),
    ('archived_location_a', v_archived_location_a), ('archived_profile_a', v_archived_profile_a),
    ('archived_invitation_a', v_archived_invitation_a),
    ('business_a', v_business_a), ('business_b', v_business_b),
    ('franchise_ab', v_franchise_ab), ('franchise_bc', v_franchise_bc),
    ('subscription_a', v_subscription_a), ('subscription_b', v_subscription_b),
    ('insight_a', v_insight_a), ('insight_b', v_insight_b);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, 'authenticated', 'authenticated', 'batch3c4-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_b, 'authenticated', 'authenticated', 'batch3c4-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner_c, 'authenticated', 'authenticated', 'batch3c4-owner-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch3c4-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location, 'authenticated', 'authenticated', 'batch3c4-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch3c4-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES
    (v_org_a, 'Batch 3c4 Org A', 'batch-3c4-org-a', v_owner_a),
    (v_org_b, 'Batch 3c4 Org B', 'batch-3c4-org-b', v_owner_b),
    (v_org_c, 'Batch 3c4 Org C', 'batch-3c4-org-c', v_owner_c);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org_a, 'Batch 3c4 Brand 1'), (v_brand2, v_org_a, 'Batch 3c4 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_loc1, v_brand1, v_org_a, 'Batch 3c4 Location 1'), (v_loc2, v_brand2, v_org_a, 'Batch 3c4 Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id, access_level,
    business_email, business_email_verified_at, business_phone, business_phone_verified_at
  )
  VALUES
    (v_owner_a, 'batch3c4-owner-a@example.test', 'Batch 3c4 Owner A', 'org_manager', v_org_a, NULL, NULL, 'organization', 'owner-a-biz@example.test', now(), '+15550000001', now()),
    (v_owner_b, 'batch3c4-owner-b@example.test', 'Batch 3c4 Owner B', 'org_manager', v_org_b, NULL, NULL, 'organization', 'owner-b-biz@example.test', now(), '+15550000002', now()),
    (v_owner_c, 'batch3c4-owner-c@example.test', 'Batch 3c4 Owner C', 'org_manager', v_org_c, NULL, NULL, 'organization', 'owner-c-biz@example.test', now(), '+15550000003', now()),
    (v_branch, 'batch3c4-branch@example.test', 'Batch 3c4 Branch', 'branch_manager', v_org_a, v_brand1, NULL, 'brand', 'branch-biz@example.test', now(), '+15550000004', now()),
    (v_location, 'batch3c4-location@example.test', 'Batch 3c4 Location', 'location_manager', v_org_a, v_brand1, v_loc1, 'location', 'location-biz@example.test', now(), '+15550000005', now()),
    (v_ground, 'batch3c4-ground@example.test', 'Batch 3c4 Ground', 'ground_staff', v_org_a, v_brand1, v_loc1, 'location', 'ground-biz@example.test', now(), '+15550000006', now())
  ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         business_email = EXCLUDED.business_email,
         business_email_verified_at = EXCLUDED.business_email_verified_at,
         business_phone = EXCLUDED.business_phone,
         business_phone_verified_at = EXCLUDED.business_phone_verified_at,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org_a, v_owner_a, 'org_manager'),
    (v_org_b, v_owner_b, 'org_manager'),
    (v_org_c, v_owner_c, 'org_manager'),
    (v_org_a, v_branch, 'branch_manager'),
    (v_org_a, v_location, 'location_manager'),
    (v_org_a, v_ground, 'ground_staff');

  INSERT INTO public.archived_brands (brand_id, organization_id, name, archived_at, archived_by)
  VALUES
    (v_archived_brand_a, v_org_a, 'Archived Brand A', now(), v_owner_a),
    (v_archived_brand_b, v_org_b, 'Archived Brand B', now(), v_owner_b);

  INSERT INTO public.archived_locations (id, brand_id, organization_id, name, archived_at, archived_by)
  VALUES (v_archived_location_a, v_brand1, v_org_a, 'Archived Location A', now(), v_owner_a);

  INSERT INTO public.archived_profiles (id, full_name, email, phone, role, organization_id, permissions, archived_at, archived_by)
  VALUES (v_archived_profile_a, 'Archived User A', 'archived-user-a@example.test', '+15559990000', 'location_manager', v_org_a, '{"sensitive":true}'::jsonb, now(), v_owner_a);

  INSERT INTO public.archived_invitations (id, email, role, token, organization_id, brand_id, location_id, archived_at, archived_by)
  VALUES (v_archived_invitation_a, 'archived-invite-a@example.test', 'location_manager', 'raw-invite-token-a', v_org_a, v_brand1, v_loc1, now(), v_owner_a);

  INSERT INTO public.business_verifications (
    id, user_id, organization_id, legal_business_name, business_type, identifier_type,
    identifier_last4, provider_name, provider_reference_id, verification_status, metadata
  )
  VALUES
    (v_business_a, v_owner_a, v_org_a, 'Org A LLC', 'llc', 'ein', '1234', 'manual', 'biz-a', 'pending_review', '{"email":"owner-a-biz@example.test","phone":"+15550000001"}'::jsonb),
    (v_business_b, v_owner_b, v_org_b, 'Org B LLC', 'llc', 'ein', '9876', 'manual', 'biz-b', 'pending_review', '{"email":"owner-b-biz@example.test","phone":"+15550000002"}'::jsonb);

  INSERT INTO public.franchise_agreements (
    id, organization_id, parent_org_id, child_org_id, royalty_percentage, marketing_fee_percentage, status
  )
  VALUES
    (v_franchise_ab, v_org_a, v_org_a, v_org_b, 5, 2, 'active'),
    (v_franchise_bc, v_org_b, v_org_b, v_org_c, 4, 1, 'active');

  UPDATE public.subscriptions
  SET plan_tier = 'enterprise',
      status = 'active',
      stripe_customer_id = 'cus_a',
      stripe_subscription_id = 'sub_a'
  WHERE organization_id = v_org_a;

  UPDATE public.subscriptions
  SET plan_tier = 'enterprise',
      status = 'active',
      stripe_customer_id = 'cus_b',
      stripe_subscription_id = 'sub_b'
  WHERE organization_id = v_org_b;

  UPDATE batch3c4_ids
  SET value = (SELECT id FROM public.subscriptions WHERE organization_id = v_org_a)
  WHERE key = 'subscription_a';

  UPDATE batch3c4_ids
  SET value = (SELECT id FROM public.subscriptions WHERE organization_id = v_org_b)
  WHERE key = 'subscription_b';

  INSERT INTO public.ai_insights (id, organization_id, insight_type, severity, title, description, metadata)
  VALUES
    (v_insight_a, v_org_a, 'margin', 'high', 'Org A Sensitive Aggregate', 'Cross-location aggregate', '{"locations":["loc1","loc2"],"gross_margin":12}'::jsonb),
    (v_insight_b, v_org_b, 'margin', 'high', 'Org B Sensitive Aggregate', 'Cross-location aggregate', '{"gross_margin":18}'::jsonb);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c4_ids WHERE key='owner_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch3c4_results
SELECT 'org_manager_can_read_own_org_sensitive_tables',
       (SELECT count(*) FROM public.archived_brands) = 1
       AND (SELECT count(*) FROM public.archived_locations) = 1
       AND (SELECT count(*) FROM public.archived_profiles) = 1
       AND (SELECT count(id) FROM public.archived_invitations) = 1
       AND (SELECT count(*) FROM public.business_verifications) = 1
       AND (SELECT count(*) FROM public.franchise_agreements) = 1
       AND (SELECT count(*) FROM public.subscriptions) = 1
       AND (SELECT count(*) FROM public.ai_insights) = 1,
       'owner sees own-org rows and party franchise agreement';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.archived_brands (brand_id, organization_id, name, archived_at)
    VALUES (gen_random_uuid(), (SELECT value FROM batch3c4_ids WHERE key='org_a'), 'Owner Archived Brand Insert', now());
    INSERT INTO public.archived_locations (id, organization_id, name, archived_at)
    VALUES (gen_random_uuid(), (SELECT value FROM batch3c4_ids WHERE key='org_a'), 'Owner Archived Location Insert', now());
    INSERT INTO public.archived_profiles (id, organization_id, full_name, email, archived_at)
    VALUES (gen_random_uuid(), (SELECT value FROM batch3c4_ids WHERE key='org_a'), 'Owner Archived Profile Insert', 'owner-archived@example.test', now());
    INSERT INTO public.archived_invitations (id, organization_id, email, role, token, archived_at)
    VALUES (gen_random_uuid(), (SELECT value FROM batch3c4_ids WHERE key='org_a'), 'owner-invite@example.test', 'location_manager', 'owner-token', now());
    UPDATE public.business_verifications
    SET verification_status = 'verified'
    WHERE id = (SELECT value FROM batch3c4_ids WHERE key='business_a');
    INSERT INTO public.franchise_agreements (organization_id, parent_org_id, child_org_id, royalty_percentage, marketing_fee_percentage, status)
    VALUES ((SELECT value FROM batch3c4_ids WHERE key='org_a'), (SELECT value FROM batch3c4_ids WHERE key='org_a'), (SELECT value FROM batch3c4_ids WHERE key='org_c'), 3, 1, 'draft');
    UPDATE public.subscriptions
    SET status = 'trialing'
    WHERE id = (SELECT value FROM batch3c4_ids WHERE key='subscription_a');
    UPDATE public.ai_insights
    SET resolved = true
    WHERE id = (SELECT value FROM batch3c4_ids WHERE key='insight_a');
    INSERT INTO batch3c4_results VALUES ('org_manager_can_write_admin_only_tables', true, 'admin inserts/updates succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('org_manager_can_write_admin_only_tables', false, SQLERRM);
  END;
END $$;

INSERT INTO batch3c4_results
SELECT 'org_manager_cross_org_isolation',
       NOT EXISTS (SELECT 1 FROM public.archived_brands WHERE organization_id = (SELECT value FROM batch3c4_ids WHERE key='org_b'))
       AND NOT EXISTS (SELECT 1 FROM public.business_verifications WHERE organization_id = (SELECT value FROM batch3c4_ids WHERE key='org_b'))
       AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE organization_id = (SELECT value FROM batch3c4_ids WHERE key='org_b'))
       AND NOT EXISTS (SELECT 1 FROM public.ai_insights WHERE organization_id = (SELECT value FROM batch3c4_ids WHERE key='org_b')),
       'org B rows hidden from org A admin';

DO $$
DECLARE
  v_token text;
BEGIN
  BEGIN
    SELECT token INTO v_token FROM public.archived_invitations LIMIT 1;
    INSERT INTO batch3c4_results VALUES ('archived_invitation_token_not_selectable_by_authenticated', false, 'token unexpectedly selected');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('archived_invitation_token_not_selectable_by_authenticated', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c4_ids WHERE key='owner_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c4_results
SELECT 'child_org_admin_can_read_party_franchise_agreement',
       EXISTS (SELECT 1 FROM public.franchise_agreements WHERE id = (SELECT value FROM batch3c4_ids WHERE key='franchise_ab'))
       AND EXISTS (SELECT 1 FROM public.franchise_agreements WHERE id = (SELECT value FROM batch3c4_ids WHERE key='franchise_bc')),
       'org B admin sees agreements where org B is child or parent';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c4_ids WHERE key='branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c4_results
SELECT 'branch_manager_cannot_read_sensitive_tables',
       (SELECT count(*) FROM public.archived_brands) = 0
       AND (SELECT count(*) FROM public.archived_locations) = 0
       AND (SELECT count(*) FROM public.archived_profiles) = 0
       AND (SELECT count(id) FROM public.archived_invitations) = 0
       AND (SELECT count(*) FROM public.business_verifications) = 0
       AND (SELECT count(*) FROM public.franchise_agreements) = 0
       AND (SELECT count(*) FROM public.subscriptions) = 0
       AND (SELECT count(*) FROM public.ai_insights) = 0,
       'branch manager sees no sensitive rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_tier, status)
    VALUES ((SELECT value FROM batch3c4_ids WHERE key='org_a'), 'bad', 'active');
    INSERT INTO batch3c4_results VALUES ('branch_manager_cannot_write_sensitive_tables', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('branch_manager_cannot_write_sensitive_tables', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c4_ids WHERE key='location'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c4_results
SELECT 'location_manager_cannot_read_sensitive_tables_before_self_path',
       (SELECT count(*) FROM public.archived_brands) = 0
       AND (SELECT count(*) FROM public.business_verifications) = 0
       AND (SELECT count(*) FROM public.franchise_agreements) = 0
       AND (SELECT count(*) FROM public.subscriptions) = 0
       AND (SELECT count(*) FROM public.ai_insights) = 0,
       'location manager sees no admin-only rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_verifications (
      user_id, organization_id, legal_business_name, business_type, identifier_type,
      identifier_last4, provider_name, verification_status, metadata
    )
    VALUES (
      (SELECT value FROM batch3c4_ids WHERE key='location'),
      (SELECT value FROM batch3c4_ids WHERE key='org_a'),
      'Location Manager LLC',
      'llc',
      'ein',
      '5555',
      'self_onboarding',
      'pending_review',
      '{"email":"location-biz@example.test","phone":"+15550000005"}'::jsonb
    );
    INSERT INTO batch3c4_results VALUES ('self_onboarding_business_verification_insert_allowed', true, 'self insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('self_onboarding_business_verification_insert_allowed', false, SQLERRM);
  END;
END $$;
INSERT INTO batch3c4_results
SELECT 'self_onboarding_business_verification_read_limited_to_own_row',
       (SELECT count(*) FROM public.business_verifications) = 1
       AND EXISTS (SELECT 1 FROM public.business_verifications WHERE user_id = (SELECT value FROM batch3c4_ids WHERE key='location')),
       'self path exposes only caller-owned verification';
DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.business_verifications
    SET verification_status = 'verified'
    WHERE user_id = (SELECT value FROM batch3c4_ids WHERE key='location');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    INSERT INTO batch3c4_results
    VALUES ('location_manager_cannot_update_business_verification', v_rows = 0, 'rows_updated=' || v_rows::text);
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('location_manager_cannot_update_business_verification', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch3c4_ids WHERE key='ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO batch3c4_results
SELECT 'ground_staff_cannot_read_sensitive_tables',
       (SELECT count(*) FROM public.archived_brands) = 0
       AND (SELECT count(*) FROM public.franchise_agreements) = 0
       AND (SELECT count(*) FROM public.subscriptions) = 0
       AND (SELECT count(*) FROM public.ai_insights) = 0,
       'ground staff sees no sensitive rows';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ai_insights (organization_id, insight_type, severity, title, metadata)
    VALUES ((SELECT value FROM batch3c4_ids WHERE key='org_a'), 'bad', 'low', 'Bad Ground Insight', '{}'::jsonb);
    INSERT INTO batch3c4_results VALUES ('ground_staff_cannot_write_ai_insights', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('ground_staff_cannot_write_ai_insights', true, SQLERRM);
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.archived_brands;
    PERFORM count(*) FROM public.business_verifications;
    PERFORM count(*) FROM public.franchise_agreements;
    PERFORM count(*) FROM public.subscriptions;
    PERFORM count(*) FROM public.ai_insights;
    INSERT INTO batch3c4_results VALUES ('anon_cannot_read_sensitive_tables', false, 'anon read unexpectedly completed');
  EXCEPTION WHEN others THEN
    INSERT INTO batch3c4_results VALUES ('anon_cannot_read_sensitive_tables', true, SQLERRM);
  END;
END $$;
RESET ROLE;

INSERT INTO batch3c4_results
SELECT 'anon_truncate_denied',
       NOT has_table_privilege('anon', 'public.archived_brands', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.archived_invitations', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.business_verifications', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.franchise_agreements', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.subscriptions', 'TRUNCATE')
       AND NOT has_table_privilege('anon', 'public.ai_insights', 'TRUNCATE'),
       'anon truncate revoked on sensitive tables';

INSERT INTO batch3c4_results
SELECT 'archived_jwt_user_metadata_policy_removed',
       NOT EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('archived_brands','archived_locations','archived_profiles','archived_invitations')
           AND (qual ILIKE '%user_metadata%' OR with_check ILIKE '%user_metadata%')
       ),
       'no archived policy references user_metadata';

SET LOCAL ROLE service_role;
INSERT INTO public.archived_brands (brand_id, organization_id, name, archived_at)
VALUES (gen_random_uuid(), (SELECT value FROM batch3c4_ids WHERE key='org_a'), 'Service Archived Brand', now());
SELECT token FROM public.archived_invitations LIMIT 1;
INSERT INTO public.ai_insights (organization_id, insight_type, severity, title, metadata)
VALUES ((SELECT value FROM batch3c4_ids WHERE key='org_a'), 'service', 'low', 'Service Insight', '{"system":true}'::jsonb);
UPDATE public.subscriptions SET status = 'active' WHERE id = (SELECT value FROM batch3c4_ids WHERE key='subscription_a');
DELETE FROM public.ai_insights WHERE title = 'Service Insight';
INSERT INTO batch3c4_results VALUES ('service_role_retains_full_access', true, 'service insert/select token/update/delete succeeded');
RESET ROLE;

SELECT * FROM batch3c4_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch3c4_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 3c-4 admin-only sensitive config acceptance failed';
  END IF;
END $$;

ROLLBACK;
