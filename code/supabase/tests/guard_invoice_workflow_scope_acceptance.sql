BEGIN;

ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_branch_user uuid := gen_random_uuid();
  v_location_user uuid := gen_random_uuid();
  v_result jsonb;
  v_invoice public.invoices%ROWTYPE;
  v_rejected boolean := false;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES
    (v_branch_user, 'guard-branch-' || substr(v_branch_user::text, 1, 8) || '@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
    (v_location_user, 'guard-location-' || substr(v_location_user::text, 1, 8) || '@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Invoice Scope Guard Org', 'invoice-scope-guard-' || substr(v_org::text, 1, 8));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Invoice Scope Guard Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'Invoice Scope Guard Location');

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand,
         location_id = NULL,
         role = 'branch_manager',
         access_level = 'brand',
         email = 'guard-branch-' || substr(v_branch_user::text, 1, 8) || '@example.test',
         full_name = 'Invoice Scope Guard Branch'
   WHERE id = v_branch_user;

  UPDATE public.profiles
     SET organization_id = v_org,
         brand_id = v_brand,
         location_id = v_location,
         role = 'location_manager',
         access_level = 'location',
         email = 'guard-location-' || substr(v_location_user::text, 1, 8) || '@example.test',
         full_name = 'Invoice Scope Guard Location'
   WHERE id = v_location_user;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_branch_user, 'branch_manager'),
    (v_org, v_location_user, 'location_manager');

  PERFORM set_config('request.jwt.claim.sub', v_branch_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_branch_user::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.save_invoice_workflow(
      NULL,
      jsonb_build_object(
        'organization_id', v_org,
        'vendor_name', 'Rejected Scope Vendor',
        'invoice_number', 'REJECT-MISSING-SCOPE',
        'total_amount', 10,
        'status', 'pending_review',
        'source', 'manual_upload'
      ),
      '[]'::jsonb
    );
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%Invoice requires brand and location context%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'save_invoice_workflow allowed a switcher role to create an unscoped invoice';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_location_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_location_user::text, 'role', 'authenticated')::text, true);

  SELECT public.save_invoice_workflow(
    NULL,
    jsonb_build_object(
      'organization_id', v_org,
      'vendor_name', 'Fixed Scope Vendor',
      'invoice_number', 'FIXED-PROFILE-SCOPE',
      'total_amount', 20,
      'status', 'pending_review',
      'source', 'manual_upload'
    ),
    '[]'::jsonb
  ) INTO v_result;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = (v_result->>'id')::uuid;

  IF v_invoice.brand_id IS DISTINCT FROM v_brand OR v_invoice.location_id IS DISTINCT FROM v_location THEN
    RAISE EXCEPTION 'fixed-profile scope fallback failed, got brand %, location %', v_invoice.brand_id, v_invoice.location_id;
  END IF;

  RAISE NOTICE 'PASS switcher role cannot save brand/location-less invoice';
  RAISE NOTICE 'PASS fixed-profile location_manager fallback stamps brand/location';
END $$;

ROLLBACK;