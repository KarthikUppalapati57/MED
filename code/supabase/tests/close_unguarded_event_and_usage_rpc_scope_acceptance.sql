-- Acceptance test for 20260727030000_close_unguarded_event_and_usage_rpc_scope.sql.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_raised boolean;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_a, 'event-usage-scope-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Event Usage Scope Org A', 'event-usage-scope-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, 'Event Usage Scope Org B', 'event-usage-scope-org-b-' || replace(v_org_b::text, '-', ''));

  UPDATE public.profiles SET organization_id = v_org_a, role = 'branch_manager', updated_at = now() WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- emit_domain_event: foreign org must be rejected; own org and NULL org (platform-level event) must succeed.
  v_raised := false;
  BEGIN
    PERFORM public.emit_domain_event('test.event', 'test_entity', gen_random_uuid(), v_org_b, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'emit_domain_event must reject a foreign organization id';
  PERFORM public.emit_domain_event('test.event', 'test_entity', gen_random_uuid(), v_org_a, '{}'::jsonb);
  PERFORM public.emit_domain_event('test.event', 'test_entity', gen_random_uuid(), NULL, '{}'::jsonb);

  -- generate_daily_theoretical_usage: foreign org must be rejected; own org must succeed.
  v_raised := false;
  BEGIN
    PERFORM * FROM public.generate_daily_theoretical_usage(v_org_b, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'generate_daily_theoretical_usage must reject a foreign organization id';
  PERFORM * FROM public.generate_daily_theoretical_usage(v_org_a, CURRENT_DATE);

  RESET ROLE;

  RAISE NOTICE 'close_unguarded_event_and_usage_rpc_scope_acceptance: PASSED';
END $$;

ROLLBACK;
