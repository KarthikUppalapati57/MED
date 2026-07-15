-- Acceptance test for send_due_date_reminders() (20260717000001_payment_reminders_and_failure_notify.sql).
-- Seeds a branch_manager and a location_manager in different scopes, seeds invoices due at
-- various offsets, and asserts each user only gets notified for invoices in their own scope
-- and only for matching reminder-day offsets -- then re-runs to confirm no duplicates.
BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_branch_user uuid := gen_random_uuid();
  v_location_user uuid := gen_random_uuid();
  v_inv_due_7 uuid := gen_random_uuid();
  v_inv_due_3 uuid := gen_random_uuid();
  v_inv_due_10 uuid := gen_random_uuid();
  v_inv_other_brand uuid := gen_random_uuid();
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_branch_user, 'reminder-branch@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_location_user, 'reminder-location@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Reminder Test Org', 'reminder-test-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand1, v_org, 'Brand One'), (v_brand2, v_org, 'Brand Two');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_loc1, v_org, v_brand1, 'Location One'), (v_loc2, v_org, v_brand2, 'Location Two');

  UPDATE public.profiles
     SET organization_id = v_org, brand_id = v_brand1, location_id = NULL, role = 'branch_manager', updated_at = now()
   WHERE id = v_branch_user;

  UPDATE public.profiles
     SET organization_id = v_org, brand_id = v_brand2, location_id = v_loc2, role = 'location_manager', updated_at = now()
   WHERE id = v_location_user;

  INSERT INTO public.invoice_reminder_settings (user_id, organization_id, reminder_days, enabled)
  VALUES
    (v_branch_user, v_org, '{7,3,1}', true),
    (v_location_user, v_org, '{7,3,1}', true);

  -- Brand-1 invoice due in 7 days: branch_manager should see it (brand match).
  INSERT INTO public.invoices (id, organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, payment_status, due_date)
  VALUES (v_inv_due_7, v_org, v_brand1, v_loc1, 'Vendor A', 'INV-R1', 100, 'approved', 'unpaid', CURRENT_DATE + 7);

  -- Brand-2/Location-2 invoice due in 3 days: location_manager should see it (location match);
  -- branch_manager should NOT (different brand).
  INSERT INTO public.invoices (id, organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, payment_status, due_date)
  VALUES (v_inv_due_3, v_org, v_brand2, v_loc2, 'Vendor B', 'INV-R2', 200, 'approved', 'unpaid', CURRENT_DATE + 3);

  -- Brand-1 invoice due in 10 days: not in reminder_days {7,3,1}, nobody should be notified.
  INSERT INTO public.invoices (id, organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, payment_status, due_date)
  VALUES (v_inv_due_10, v_org, v_brand1, v_loc1, 'Vendor C', 'INV-R3', 300, 'approved', 'unpaid', CURRENT_DATE + 10);

  PERFORM public.send_due_date_reminders();

  -- branch_manager: exactly one reminder, for the brand-1 invoice.
  SELECT count(*) INTO v_count FROM public.invoice_reminder_log WHERE user_id = v_branch_user;
  ASSERT v_count = 1, format('expected branch_manager to get 1 reminder, got %s', v_count);

  SELECT count(*) INTO v_count FROM public.invoice_reminder_log WHERE user_id = v_branch_user AND invoice_id = v_inv_due_7;
  ASSERT v_count = 1, 'expected branch_manager reminder to be for the brand-1 invoice';

  -- location_manager: exactly one reminder, for the brand-2/location-2 invoice.
  SELECT count(*) INTO v_count FROM public.invoice_reminder_log WHERE user_id = v_location_user;
  ASSERT v_count = 1, format('expected location_manager to get 1 reminder, got %s', v_count);

  SELECT count(*) INTO v_count FROM public.invoice_reminder_log WHERE user_id = v_location_user AND invoice_id = v_inv_due_3;
  ASSERT v_count = 1, 'expected location_manager reminder to be for the brand-2 invoice';

  -- Notifications were inserted matching the log.
  SELECT count(*) INTO v_count FROM public.notifications WHERE user_id IN (v_branch_user, v_location_user) AND type = 'invoice';
  ASSERT v_count = 2, format('expected 2 notifications total, got %s', v_count);

  -- Re-running must not duplicate (UNIQUE constraint + ON CONFLICT DO NOTHING).
  PERFORM public.send_due_date_reminders();

  SELECT count(*) INTO v_count FROM public.invoice_reminder_log;
  ASSERT v_count = 2, format('expected still 2 log rows after re-run, got %s', v_count);

  RAISE NOTICE 'send_due_date_reminders_acceptance: PASSED';
END $$;

ROLLBACK;
