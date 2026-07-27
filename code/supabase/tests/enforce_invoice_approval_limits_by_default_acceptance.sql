-- Acceptance test for 20260727130000_enforce_invoice_approval_limits_by_default.sql.
BEGIN;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_lm_user uuid := gen_random_uuid();
  v_admin_user uuid := gen_random_uuid();
  v_invoice_over uuid;
  v_invoice_under uuid;
  v_invoice_huge uuid;
  v_raised boolean;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'Approval Limit Test Tenant', 'approval-limit-test-' || replace(v_tenant::text, '-', ''));

  INSERT INTO public.organizations (id, tenant_id, name, slug)
  VALUES (v_org, v_tenant, 'Approval Limit Test Org', 'approval-limit-test-org-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES (v_brand, v_org, 'Test Brand');
  INSERT INTO public.locations (id, organization_id, brand_id, name) VALUES (v_location, v_org, v_brand, 'Test Location');

  -- location_manager capped at $500, not unlimited -- the common real-world case this migration protects.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_lm_user, 'approval-limit-lm@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org,'role','location_manager'), '{}'::jsonb);
  UPDATE public.profiles SET organization_id = v_org, brand_id = v_brand, location_id = v_location, role = 'location_manager', invoice_approval_limit = 500, has_unlimited_approval = false, updated_at = now() WHERE id = v_lm_user;

  -- platform_admin with has_unlimited_approval = true -- what this migration's data fix grants.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_admin_user, 'approval-limit-admin@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'role','platform_admin'), '{}'::jsonb);
  UPDATE public.profiles SET role = 'platform_admin', invoice_approval_limit = 0, has_unlimited_approval = true, updated_at = now() WHERE id = v_admin_user;

  INSERT INTO public.invoices (organization_id, tenant_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, created_by)
  VALUES (v_org, v_tenant, v_brand, v_location, 'Acme Foods', 'INV-OVER-LIMIT', 1000.00, 'pending_approval', v_lm_user)
  RETURNING id INTO v_invoice_over;

  INSERT INTO public.invoices (organization_id, tenant_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, created_by)
  VALUES (v_org, v_tenant, v_brand, v_location, 'Acme Foods', 'INV-UNDER-LIMIT', 400.00, 'pending_approval', v_lm_user)
  RETURNING id INTO v_invoice_under;

  INSERT INTO public.invoices (organization_id, tenant_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, created_by)
  VALUES (v_org, v_tenant, v_brand, v_location, 'Acme Foods', 'INV-HUGE', 250000.00, 'pending_approval', v_admin_user)
  RETURNING id INTO v_invoice_huge;

  -- Case 1: location_manager, $1000 invoice, $500 limit -- must now be rejected. Before this
  -- migration this silently auto-approved (no policy row existed, and enforceApprovalLimits
  -- defaulted off), regardless of amount.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_lm_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_lm_user::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('organization_id', v_org, 'role', 'location_manager'))::text, true);

  v_raised := false;
  BEGIN
    UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice_over;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'a location_manager with a $500 limit must not be able to approve a $1000 invoice';
  ASSERT (SELECT status FROM public.invoices WHERE id = v_invoice_over) = 'pending_approval',
    'the rejected invoice must remain pending_approval, not silently approved';

  -- Case 2: same user, $400 invoice, $500 limit -- must still succeed. The fix must not also
  -- block legitimate within-limit approvals.
  UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice_under;
  ASSERT (SELECT status FROM public.invoices WHERE id = v_invoice_under) = 'approved',
    'a location_manager must still be able to approve an invoice within their own limit';

  RESET ROLE;

  -- Case 3: platform_admin with has_unlimited_approval = true -- must be able to approve any
  -- amount. Proves the migration's data fix works end to end, not just the code change.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_admin_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_user::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'platform_admin'))::text, true);

  UPDATE public.invoices SET status = 'approved' WHERE id = v_invoice_huge;
  ASSERT (SELECT status FROM public.invoices WHERE id = v_invoice_huge) = 'approved',
    'an unlimited approver must be able to approve an invoice of any amount';

  RESET ROLE;

  RAISE NOTICE 'enforce_invoice_approval_limits_by_default_acceptance: PASSED';
END $$;

ROLLBACK;
