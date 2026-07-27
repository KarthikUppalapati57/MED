-- Acceptance test for 20260727020000_close_unguarded_write_rpc_scope.sql.
-- Same role-impersonation pattern as close_unguarded_report_rpc_scope_acceptance.sql.
BEGIN;

DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_brand_b uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_loc_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_victim uuid := gen_random_uuid();
  v_payment_a uuid := gen_random_uuid();
  v_payment_b uuid := gen_random_uuid();
  v_raised boolean;
  v_result jsonb;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant_a, 'Tenant A', 'tenant-a-' || replace(v_tenant_a::text, '-', '')),
    (v_tenant_b, 'Tenant B', 'tenant-b-' || replace(v_tenant_b::text, '-', ''));

  INSERT INTO public.organizations (id, tenant_id, name, slug) VALUES
    (v_org_a, v_tenant_a, 'Write Scope Org A', 'write-scope-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, v_tenant_b, 'Write Scope Org B', 'write-scope-org-b-' || replace(v_org_b::text, '-', ''));

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_user_a, 'write-scope-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org_a,'role','org_manager','tenant_id',v_tenant_a), '{}'::jsonb),
    (v_victim, 'write-scope-victim@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org_a,'role','ground_staff','tenant_id',v_tenant_a), '{}'::jsonb);

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES
    (v_brand_a, v_org_a, 'Brand A'),
    (v_brand_b, v_org_b, 'Brand B');

  INSERT INTO public.locations (id, organization_id, brand_id, name, timezone) VALUES
    (v_loc_a, v_org_a, v_brand_a, 'Loc A', 'UTC'),
    (v_loc_b, v_org_b, v_brand_b, 'Loc B', 'UTC');

  INSERT INTO public.payments (id, tenant_id, organization_id, brand_id, location_id, amount, status, payment_date) VALUES
    (v_payment_a, v_tenant_a, v_org_a, v_brand_a, v_loc_a, 100.00, 'completed', now()),
    (v_payment_b, v_tenant_b, v_org_b, v_brand_b, v_loc_b, 100.00, 'completed', now());

  UPDATE public.profiles SET organization_id = v_org_a, role = 'org_manager', updated_at = now() WHERE id = v_user_a;
  UPDATE public.profiles SET organization_id = v_org_a, role = 'ground_staff', updated_at = now() WHERE id = v_victim;
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org_a, v_user_a, 'org_manager'), (v_org_a, v_victim, 'ground_staff');

  INSERT INTO public.operational_settings (organization_id, category, settings)
  VALUES (v_org_a, 'payments', jsonb_build_object('marker', 'org-a-real-settings'));
  INSERT INTO public.operational_settings (organization_id, category, scope, settings)
  VALUES (v_org_a, 'product_approval', 'organization', jsonb_build_object('require_location_manager_approval', true));

  INSERT INTO public.payment_provider_configs (tenant_id, organization_id, collection_provider, payout_provider, enabled, settings)
  VALUES (v_tenant_a, v_org_a, 'stripe', 'stripe', true, jsonb_build_object('marker', 'org-a-real-provider-config'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_a::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('organization_id', v_org_a, 'role', 'org_manager', 'tenant_id', v_tenant_a))::text, true);

  -- record_payment_ledger: foreign org must be rejected.
  v_raised := false;
  BEGIN
    PERFORM public.record_payment_ledger(v_org_b, NULL, v_payment_b, 'ach', 100.00, now(), v_user_a);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'record_payment_ledger must reject a foreign organization id';
  PERFORM public.record_payment_ledger(v_org_a, NULL, v_payment_a, 'ach', 100.00, now(), v_user_a);

  -- resolve_payment_provider_config: foreign org must come back with the safe default, not org A's real config.
  v_result := public.resolve_payment_provider_config(v_tenant_b, v_org_b, NULL, NULL);
  ASSERT v_result->>'collection_provider' = 'not_configured' AND (v_result->'settings'->>'marker') IS NULL,
    'resolve_payment_provider_config must not leak org A''s config when queried with org B''s id';
  v_result := public.resolve_payment_provider_config(v_tenant_a, v_org_a, NULL, NULL);
  ASSERT v_result->'settings'->>'marker' = 'org-a-real-provider-config',
    'resolve_payment_provider_config must return the real config for the caller''s own org';

  -- get_payment_approval_settings: same shape.
  v_result := public.get_payment_approval_settings(v_org_b, NULL, NULL);
  ASSERT v_result = '{}'::jsonb, 'get_payment_approval_settings must not leak org A''s settings when queried with org B''s id';
  v_result := public.get_payment_approval_settings(v_org_a, NULL, NULL);
  ASSERT v_result->>'marker' = 'org-a-real-settings', 'get_payment_approval_settings must return real settings for the caller''s own org';

  -- get_product_approval_setting: same shape, boolean instead of jsonb.
  ASSERT public.get_product_approval_setting(v_org_b) = false,
    'get_product_approval_setting must not leak org A''s true setting when queried with org B''s id';
  ASSERT public.get_product_approval_setting(v_org_a) = true,
    'get_product_approval_setting must return the real setting for the caller''s own org';

  -- org_remove_member: passing org B's id explicitly must be rejected; own org (default or explicit) must succeed.
  v_raised := false;
  BEGIN
    PERFORM public.org_remove_member(v_victim, v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'org_remove_member must reject an explicitly-passed foreign organization id';

  PERFORM public.org_remove_member(v_victim, v_org_a);

  RESET ROLE;

  ASSERT (SELECT role FROM public.profiles WHERE id = v_victim) = 'ground_staff'
     AND (SELECT organization_id FROM public.profiles WHERE id = v_victim) IS NULL,
    'org_remove_member must still succeed and reset the profile for the caller''s own org';

  RAISE NOTICE 'close_unguarded_write_rpc_scope_acceptance: PASSED';
END $$;

ROLLBACK;
