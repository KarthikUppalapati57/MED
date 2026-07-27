-- Acceptance test for 20260727030000_close_unguarded_event_and_usage_rpc_scope.sql.
BEGIN;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_raised boolean;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant_a, 'Tenant A', 'tenant-a-' || replace(v_tenant_a::text, '-', '')),
    (v_tenant_b, 'Tenant B', 'tenant-b-' || replace(v_tenant_b::text, '-', ''));

  INSERT INTO public.organizations (id, tenant_id, name, slug) VALUES
    (v_org_a, v_tenant_a, 'Event Usage Scope Org A', 'event-usage-scope-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, v_tenant_b, 'Event Usage Scope Org B', 'event-usage-scope-org-b-' || replace(v_org_b::text, '-', ''));

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_a, 'event-usage-scope-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org_a,'role','branch_manager','tenant_id',v_tenant_a), '{}'::jsonb);

  UPDATE public.profiles SET organization_id = v_org_a, role = 'branch_manager', updated_at = now() WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('organization_id', v_org_a, 'role', 'branch_manager', 'tenant_id', v_tenant_a))::text, true);

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
