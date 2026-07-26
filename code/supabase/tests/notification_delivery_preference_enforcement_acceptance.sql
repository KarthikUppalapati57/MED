-- Acceptance test for enforce_notification_delivery_preference()
-- (20260726000002_notification_delivery_preference_enforcement.sql).
-- Asserts the BEFORE INSERT trigger enforces in_app_enabled and critical_only regardless of
-- which code path is doing the insert (simulated here with plain INSERTs, matching how
-- workflowService.js / notifyPaymentFailure.ts / billing-worker / etc all do it directly), and
-- that a user with no stored preference row still gets the default (in-app visible) behavior.
BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_user_disabled uuid := gen_random_uuid();
  v_user_critical_only uuid := gen_random_uuid();
  v_user_no_preference uuid := gen_random_uuid();
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_user_disabled, 'pref-disabled@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_user_critical_only, 'pref-critical-only@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_user_no_preference, 'pref-none@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Notif Pref Test Org', 'notif-pref-test-' || replace(v_org::text, '-', ''));

  UPDATE public.profiles SET organization_id = v_org, role = 'location_manager', updated_at = now() WHERE id = v_user_disabled;
  UPDATE public.profiles SET organization_id = v_org, role = 'location_manager', updated_at = now() WHERE id = v_user_critical_only;
  UPDATE public.profiles SET organization_id = v_org, role = 'location_manager', updated_at = now() WHERE id = v_user_no_preference;

  -- User 1: inventory notifications fully disabled.
  INSERT INTO public.notification_delivery_preferences (user_id, organization_id, module_key, in_app_enabled, critical_only)
  VALUES (v_user_disabled, v_org, 'inventory', false, false);

  -- User 2: payments notifications restricted to critical-only.
  INSERT INTO public.notification_delivery_preferences (user_id, organization_id, module_key, in_app_enabled, critical_only)
  VALUES (v_user_critical_only, v_org, 'payments', true, true);

  -- User 3: no preference row for any module at all.

  -- Case 1: in_app_enabled = false -> insert must be silently cancelled.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user_disabled, v_org, 'inventory', 'Low stock', 'Test message', false);

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user_disabled;
  ASSERT v_count = 0, format('expected 0 notifications for in_app_enabled=false user, got %s', v_count);

  -- Case 2a: critical_only = true, non-critical type -> suppressed.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user_critical_only, v_org, 'payment', 'Payment update', 'A normal payment changed.', false);

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user_critical_only;
  ASSERT v_count = 0, format('expected non-critical notification to be suppressed under critical_only, got %s rows', v_count);

  -- Case 2b: critical_only = true, critical type -> lands.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user_critical_only, v_org, 'payment_failed', 'Payment failed', 'A critical payment failed.', false);

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user_critical_only AND type = 'payment_failed';
  ASSERT v_count = 1, format('expected critical notification to land under critical_only, got %s rows', v_count);

  -- Case 3: no preference row at all -> defaults apply (in-app visible).
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user_no_preference, v_org, 'system', 'Welcome', 'Default behavior check.', false);

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user_no_preference;
  ASSERT v_count = 1, format('expected default (no preference row) insert to succeed, got %s rows', v_count);

  -- skip_channel_dispatch metadata flag doesn't block the in-app insert itself.
  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
  VALUES (v_user_no_preference, v_org, 'invoice', 'Invoice due soon', 'Reminder body.', false, jsonb_build_object('skip_channel_dispatch', true));

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user_no_preference AND type = 'invoice';
  ASSERT v_count = 1, format('expected skip_channel_dispatch insert to still land in-app, got %s rows', v_count);

  RAISE NOTICE 'notification_delivery_preference_enforcement_acceptance: PASSED';
END $$;

ROLLBACK;
