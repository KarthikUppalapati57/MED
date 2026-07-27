-- Acceptance test for enforce_notification_delivery_preference() after
-- 20260727000000_notification_dispatch_result_tracking.sql (adds notification_id to the
-- notify-channel-dispatch payload). The payload change itself can't be asserted from plain SQL
-- (net.http_post is fire-and-forget), so this re-proves the existing gating behavior still holds
-- against the new function body -- a typo in the added jsonb_build_object key would make every
-- insert below raise instead of landing, which is exactly the failure mode this guards against.
-- Full gating-logic coverage (in_app_enabled/critical_only/skip_channel_dispatch/no-preference
-- defaults) lives in notification_delivery_preference_enforcement_acceptance.sql; not repeated
-- here beyond the minimum needed to prove this migration didn't regress it.
BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_notification_id uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user, 'dispatch-tracking@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Dispatch Tracking Test Org', 'dispatch-tracking-test-' || replace(v_org::text, '-', ''));

  UPDATE public.profiles SET organization_id = v_org, role = 'location_manager', updated_at = now() WHERE id = v_user;

  -- Critical type, no preference row on file -> must still land in-app (same as before this
  -- migration) and must not raise even though it takes the v_send_email/v_send_sms branch that
  -- now includes notification_id in the dispatch payload.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user, v_org, 'payment_failed', 'Payment failed', 'Critical path smoke test.', false)
  RETURNING id INTO v_notification_id;

  SELECT count(*) INTO v_count FROM public.notifications WHERE id = v_notification_id;
  ASSERT v_count = 1, format('expected critical notification to land without error, got %s rows', v_count);

  -- skip_channel_dispatch still takes the early-return branch (never reaches the payload build)
  -- and must still land too.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
  VALUES (v_user, v_org, 'invoice', 'Reminder', 'Skip-dispatch smoke test.', false, jsonb_build_object('skip_channel_dispatch', true));

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user AND type = 'invoice';
  ASSERT v_count = 1, format('expected skip_channel_dispatch insert to still land, got %s rows', v_count);

  RAISE NOTICE 'notification_dispatch_result_tracking_acceptance: PASSED';
END $$;

ROLLBACK;
