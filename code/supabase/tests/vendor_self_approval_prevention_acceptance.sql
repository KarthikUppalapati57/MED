BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_creator uuid := gen_random_uuid();
  v_other_manager uuid := gen_random_uuid();
  v_vendor uuid;
  v_bank_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_creator, 'authenticated', 'authenticated', 'self-approval-creator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other_manager, 'authenticated', 'authenticated', 'self-approval-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Self Approval Org', 'self-approval-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Self Approval Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Self Approval Location');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_creator, 'self-approval-creator@example.test', 'Self Approval Creator', 'org_manager', v_org, v_brand, v_location, 'organization'),
    (v_other_manager, 'self-approval-other@example.test', 'Self Approval Other', 'org_manager', v_org, v_brand, v_location, 'organization')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id, updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_creator, 'org_manager'), (v_org, v_other_manager, 'org_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status, approval_status, created_by)
  VALUES (v_org, v_brand, v_location, 'Self Approval Vendor', 'active', 'draft', v_creator)
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, storage_path, status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'w9', 'test/self-approval-w9.pdf', 'on_file');

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, legal_name, w9_status, verification_status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'Self Approval Vendor Legal', 'verified', 'verified');

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, brand_id, location_id, verification_state, callback_status, is_default, verified_at)
  VALUES (v_vendor, v_org, v_brand, v_location, 'verified', 'confirmed', true, now())
  RETURNING id INTO v_bank_id;
  PERFORM public.store_vendor_banking_secret(v_bank_id, '111222333444', '021000021');

  -- The vendor's own creator cannot approve it, whether via the RPC or a direct UPDATE.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_creator::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.transition_vendor_approval(v_vendor, 'approved');
    RAISE EXCEPTION 'creator approved their own vendor via the RPC';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%cannot approve their own%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.vendors SET approval_status = 'approved' WHERE id = v_vendor;
    RAISE EXCEPTION 'creator approved their own vendor via a direct UPDATE';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%cannot approve their own%' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;

  IF EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor AND approval_status = 'approved') THEN
    RAISE EXCEPTION 'vendor was approved despite the self-approval rejection';
  END IF;

  -- A different manager (same org/brand/location) approving the same vendor still works --
  -- this rule blocks self-approval specifically, not approval in general.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other_manager::text, 'role', 'authenticated')::text, true);

  v_result := public.transition_vendor_approval(v_vendor, 'approved');
  IF v_result->>'approval_status' <> 'approved' THEN
    RAISE EXCEPTION 'a different manager was unexpectedly blocked from approving: %', v_result;
  END IF;

  RESET ROLE;

  RAISE NOTICE 'vendor self-approval prevention acceptance assertions passed';
END $$;

ROLLBACK;
