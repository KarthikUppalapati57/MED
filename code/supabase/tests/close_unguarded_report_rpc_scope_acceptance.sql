-- Acceptance test for 20260727010000_close_unguarded_report_rpc_scope.sql.
-- Proves each of the 6 previously-unguarded report RPCs now rejects a non-admin caller passing
-- another organization's (or, for get_labor_schedule_variance, another location's) id, and still
-- succeeds for the caller's own scope. Role impersonation follows the same
-- SET LOCAL ROLE authenticated + request.jwt.claim.sub pattern used by
-- admin_only_api_payout_config_acceptance.sql.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_brand_b uuid := gen_random_uuid();
  v_location_a uuid := gen_random_uuid();
  v_location_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_raised boolean;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_a, 'report-scope-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Report Scope Org A', 'report-scope-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, 'Report Scope Org B', 'report-scope-org-b-' || replace(v_org_b::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES
    (v_brand_a, v_org_a, 'Brand A'),
    (v_brand_b, v_org_b, 'Brand B');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_location_a, v_org_a, v_brand_a, 'Location A'),
    (v_location_b, v_org_b, v_brand_b, 'Location B');

  UPDATE public.profiles
  SET organization_id = v_org_a, brand_id = v_brand_a, location_id = v_location_a, role = 'branch_manager', updated_at = now()
  WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- get_pnl_summary: org B must be rejected, org A must succeed.
  v_raised := false;
  BEGIN
    PERFORM public.get_pnl_summary(v_org_b, CURRENT_DATE, CURRENT_DATE, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_pnl_summary must reject a foreign organization id';
  PERFORM public.get_pnl_summary(v_org_a, CURRENT_DATE, CURRENT_DATE, NULL, NULL);

  -- get_performance_dashboard_metrics: same shape.
  v_raised := false;
  BEGIN
    PERFORM public.get_performance_dashboard_metrics(v_org_b, CURRENT_DATE, CURRENT_DATE, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_performance_dashboard_metrics must reject a foreign organization id';
  PERFORM public.get_performance_dashboard_metrics(v_org_a, CURRENT_DATE, CURRENT_DATE, NULL, NULL);

  -- get_flagged_vendor_items: same shape.
  v_raised := false;
  BEGIN
    PERFORM public.get_flagged_vendor_items(v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_flagged_vendor_items must reject a foreign organization id';
  PERFORM public.get_flagged_vendor_items(v_org_a);

  -- get_labor_schedule_variance: no org param at all -- takes a location id directly. Foreign
  -- location must be rejected, NULL must be rejected (that used to mean "every tenant"), own
  -- location must succeed.
  v_raised := false;
  BEGIN
    PERFORM public.get_labor_schedule_variance(CURRENT_DATE, CURRENT_DATE, v_location_b);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_labor_schedule_variance must reject a foreign location id';

  v_raised := false;
  BEGIN
    PERFORM public.get_labor_schedule_variance(CURRENT_DATE, CURRENT_DATE, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_labor_schedule_variance must reject a NULL location id (previously aggregated every tenant)';
  PERFORM public.get_labor_schedule_variance(CURRENT_DATE, CURRENT_DATE, v_location_a);

  -- get_product_dashboard_summary and get_product_verification_queue are WHERE-clause guarded
  -- (LANGUAGE sql, no RAISE) -- a foreign org must come back with zero rows, not an exception.
  ASSERT (SELECT total_products FROM public.get_product_dashboard_summary(v_org_b, NULL, NULL)) = 0,
    'get_product_dashboard_summary must return zero rows for a foreign organization id';
  PERFORM * FROM public.get_product_dashboard_summary(v_org_a, NULL, NULL);

  ASSERT (SELECT count(*) FROM public.get_product_verification_queue(v_org_b, NULL, NULL, NULL, NULL)) = 0,
    'get_product_verification_queue must return zero rows for a foreign organization id';
  PERFORM * FROM public.get_product_verification_queue(v_org_a, NULL, NULL, NULL, NULL);

  RESET ROLE;

  RAISE NOTICE 'close_unguarded_report_rpc_scope_acceptance: PASSED';
END $$;

ROLLBACK;
