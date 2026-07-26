-- Acceptance test for 20260726000003_add_billing_notification_type_and_subscription_trigger.sql.
-- Asserts (1) 'billing' is now an accepted notifications.type, and (2)
-- trg_subscriptions_webhook exists on public.subscriptions. Only existence is asserted for the
-- trigger, not firing it end-to-end -- invoke_edge_function() does a real net.http_post gated on
-- private.workflow_runtime_settings.service_role_key (RAISE EXCEPTION if unset), so actually
-- firing it isn't a deterministic, network-independent test; the same limitation already applies
-- to the existing, already-working trg_payments_webhook/trg_invoices_webhook triggers.
BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_count integer;
  v_trigger_exists boolean;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user, 'billing-notif@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Billing Notif Test Org', 'billing-notif-test-' || replace(v_org::text, '-', ''));

  UPDATE public.profiles SET organization_id = v_org, role = 'location_manager', updated_at = now() WHERE id = v_user;

  INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read)
  VALUES (v_user, v_org, 'billing', 'Subscription past due', 'Your subscription is now past_due.', false);

  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id = v_user AND type = 'billing';
  ASSERT v_count = 1, format('expected billing-type notification to be accepted, got %s rows', v_count);

  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'subscriptions'
      AND trigger_name = 'trg_subscriptions_webhook'
  ) INTO v_trigger_exists;
  ASSERT v_trigger_exists, 'expected trg_subscriptions_webhook to exist on public.subscriptions';

  RAISE NOTICE 'add_billing_notification_type_and_subscription_trigger_acceptance: PASSED';
END $$;

ROLLBACK;
