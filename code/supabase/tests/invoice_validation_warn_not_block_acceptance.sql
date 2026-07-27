-- Acceptance test for 20260726190000_validation_hard_locks.sql and
-- 20260726193000_invoice_validation_warning_override.sql -- both install the identical
-- record_invoice_validation_state_on_approval trigger (the second is a near-duplicate of the
-- first; whichever one is live is exercised here), and neither had a test. Proves the core
-- product requirement: a hard validation failure (duplicate invoice) is recorded, not blocked --
-- the write succeeds and the failure is queryable afterward for the UI's note-required gate.
BEGIN;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_invoice_1 uuid;
  v_invoice_2 uuid;
  v_validation jsonb;
  v_failures jsonb;
BEGIN
  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'Test Tenant', 'test-tenant-' || replace(v_tenant::text, '-', ''));

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user, 'inv-validation@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), jsonb_build_object('provider','email','providers',ARRAY['email'],'organization_id',v_org,'tenant_id',v_tenant,'role','org_manager'), '{}'::jsonb);

  INSERT INTO public.organizations (id, tenant_id, name, slug)
  VALUES (v_org, v_tenant, 'Invoice Validation Test Org', 'invoice-validation-test-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name) VALUES (v_brand, v_org, 'Test Brand');
  INSERT INTO public.locations (id, organization_id, brand_id, name) VALUES (v_location, v_org, v_brand, 'Test Location');

  UPDATE public.profiles SET organization_id = v_org, brand_id = v_brand, location_id = v_location, role = 'org_manager', has_unlimited_approval = true, updated_at = now() WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated', 'app_metadata', jsonb_build_object('organization_id', v_org, 'tenant_id', v_tenant, 'role', 'org_manager'))::text, true);

  -- First invoice: an existing, non-rejected invoice with a given number/vendor.
  INSERT INTO public.invoices (organization_id, tenant_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, created_by)
  VALUES (v_org, v_tenant, v_brand, v_location, 'Acme Foods', 'INV-DUP-TEST-1', 100.00, 'approved', v_user)
  RETURNING id INTO v_invoice_1;

  -- Second invoice: same vendor/number, different id -- starts in a non-approval status so the
  -- later UPDATE is what actually exercises the trigger.
  INSERT INTO public.invoices (organization_id, tenant_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status, created_by)
  VALUES (v_org, v_tenant, v_brand, v_location, 'Acme Foods', 'INV-DUP-TEST-1', 100.00, 'extracting', v_user)
  RETURNING id INTO v_invoice_2;

  -- Moving invoice 2 to pending_approval must succeed (not raise) even though it's a duplicate.
  UPDATE public.invoices SET status = 'pending_approval' WHERE id = v_invoice_2;

  SELECT validation_results INTO v_validation FROM public.invoices WHERE id = v_invoice_2;
  v_failures := v_validation->'approval_validation_failures';

  ASSERT v_validation IS NOT NULL, 'validation_results must be populated after moving to pending_approval';
  ASSERT v_failures @> '["duplicate_invoice"]'::jsonb,
    format('expected duplicate_invoice in approval_validation_failures, got %s', v_failures);
  ASSERT (v_validation->>'approval_validation_acknowledgement_required')::boolean = true,
    'acknowledgement_required must be true when a hard validation failure is present';
  ASSERT (SELECT status FROM public.invoices WHERE id = v_invoice_2) = 'pending_approval',
    'the write must not have been blocked -- status must reflect the requested change';

  RAISE NOTICE 'invoice_validation_warn_not_block_acceptance: PASSED';
END $$;

ROLLBACK;
