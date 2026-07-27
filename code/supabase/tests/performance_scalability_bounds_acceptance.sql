-- Acceptance test for 20260727110000_performance_scalability_bounds.sql.
BEGIN;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_raised boolean;
  v_result jsonb;
  v_arr jsonb;
BEGIN
  -- 1. Test assert_performance_report_bounds
  PERFORM public.assert_performance_report_bounds('2026-01-01'::date, '2026-01-31'::date);

  v_raised := false;
  BEGIN
    PERFORM public.assert_performance_report_bounds('2026-02-01'::date, '2026-01-01'::date);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'assert_performance_report_bounds must reject reversed dates';

  v_raised := false;
  BEGIN
    PERFORM public.assert_performance_report_bounds('2024-01-01'::date, '2026-07-01'::date);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'assert_performance_report_bounds must reject ranges over 548 days';

  -- 2. Test limit_performance_jsonb_array
  v_arr := '["a", "b", "c", "d", "e"]'::jsonb;
  ASSERT public.limit_performance_jsonb_array(v_arr, 2, 1) = '["b", "c"]'::jsonb,
    'limit_performance_jsonb_array must slice correctly with limit and offset';

  -- 3. Test with_performance_limit_metadata
  v_result := public.with_performance_limit_metadata(
    '{"items": [1, 2]}'::jsonb,
    'items',
    10,
    2,
    0,
    clock_timestamp()
  );
  ASSERT v_result->'metadata'->>'detailLimit' = '2'
     AND v_result->'metadata'->>'detailTotalCount' = '10'
     AND (v_result->'metadata'->>'detailTruncated')::boolean = true,
    'with_performance_limit_metadata must attach pagination and truncation metadata';

  -- 4. Test get_location_performance_overview_rollup
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant_a, 'Tenant A', 'tenant-a-' || replace(v_tenant_a::text, '-', ''));

  INSERT INTO public.organizations (id, tenant_id, name, slug) VALUES
    (v_org_a, v_tenant_a, 'Perf Bounds Org A', 'perf-bounds-org-a-' || replace(v_org_a::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES
    (v_brand_a, v_org_a, 'Brand A');

  INSERT INTO public.locations (id, organization_id, brand_id, name, timezone) VALUES
    (v_loc_a, v_org_a, v_brand_a, 'Loc A', 'UTC');

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_a, 'perf-bounds-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org_a,'brand_id',v_brand_a,'location_id',v_loc_a,'role','org_manager','tenant_id',v_tenant_a), '{}'::jsonb);

  UPDATE public.profiles SET organization_id = v_org_a, brand_id = v_brand_a, location_id = v_loc_a, role = 'org_manager', updated_at = now() WHERE id = v_user_a;
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org_a, v_user_a, 'org_manager');
  INSERT INTO public.location_members (location_id, user_id, role) VALUES (v_loc_a, v_user_a, 'location_manager');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('organization_id', v_org_a, 'brand_id', v_brand_a, 'location_id', v_loc_a, 'role', 'org_manager', 'tenant_id', v_tenant_a))::text, true);

  v_result := public.get_location_performance_overview_rollup(v_org_a, v_loc_a, '2026-07-01'::date, '2026-07-31'::date);
  ASSERT v_result ? 'payments' AND v_result ? 'products' AND v_result ? 'inventory' AND v_result ? 'recipes' AND v_result ? 'metadata',
    'get_location_performance_overview_rollup must return all top-level rollup keys';
  ASSERT v_result->'metadata'->>'aggregation' = 'server_rollup',
    'get_location_performance_overview_rollup must indicate server_rollup in metadata';

  RESET ROLE;

  RAISE NOTICE 'performance_scalability_bounds_acceptance: PASSED';
END $$;

ROLLBACK;
