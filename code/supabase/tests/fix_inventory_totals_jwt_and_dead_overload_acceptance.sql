-- Acceptance test for 20260727040000_fix_inventory_totals_jwt_and_dead_overload.sql.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_raised boolean;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_a, 'inv-totals-scope-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Inv Totals Scope Org A', 'inv-totals-scope-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, 'Inv Totals Scope Org B', 'inv-totals-scope-org-b-' || replace(v_org_b::text, '-', ''));

  UPDATE public.profiles SET organization_id = v_org_a, role = 'branch_manager', updated_at = now() WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- get_inventory_totals: foreign org must be rejected (now checked against profiles via
  -- get_auth_org(), not a JWT claim that may not even be set in this session).
  v_raised := false;
  BEGIN
    PERFORM public.get_inventory_totals(v_org_b, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'get_inventory_totals must reject a foreign organization id';
  PERFORM public.get_inventory_totals(v_org_a, NULL, NULL);

  -- can_access_dashboard_scope: the surviving (org, brand, location, scope) overload must still
  -- resolve and behave correctly after the dead overload was dropped.
  ASSERT public.can_access_dashboard_scope(v_org_a, NULL::uuid, NULL::uuid, 'org') = true,
    'can_access_dashboard_scope must still allow the caller''s own org after the dead overload was dropped';
  ASSERT public.can_access_dashboard_scope(v_org_b, NULL::uuid, NULL::uuid, 'org') = false,
    'can_access_dashboard_scope must still reject a foreign org after the dead overload was dropped';

  RESET ROLE;

  RAISE NOTICE 'fix_inventory_totals_jwt_and_dead_overload_acceptance: PASSED';
END $$;

ROLLBACK;
