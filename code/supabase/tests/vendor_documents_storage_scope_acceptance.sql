BEGIN;

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_loc_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_brand_b uuid := gen_random_uuid();
  v_loc_b uuid := gen_random_uuid();
  v_manager_a uuid := gen_random_uuid();
  v_vendor_a uuid;
  v_vendor_b uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_manager_a, 'storage-rls-manager-a@example.test', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org_a, 'Storage RLS Org A', 'storage-rls-org-a-' || replace(v_org_a::text, '-', '')),
    (v_org_b, 'Storage RLS Org B', 'storage-rls-org-b-' || replace(v_org_b::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand_a, v_org_a, 'Storage RLS Brand A'),
    (v_brand_b, v_org_b, 'Storage RLS Brand B');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES
    (v_loc_a, v_org_a, v_brand_a, 'Storage RLS Location A'),
    (v_loc_b, v_org_b, v_brand_b, 'Storage RLS Location B');

  UPDATE public.profiles
     SET organization_id = v_org_a,
         brand_id = v_brand_a,
         location_id = v_loc_a,
         role = 'location_manager',
         access_level = 'location',
         updated_at = now()
   WHERE id = v_manager_a;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_a, v_manager_a, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org_a, v_brand_a, v_loc_a, 'Storage RLS Vendor A', 'active')
  RETURNING id INTO v_vendor_a;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org_b, v_brand_b, v_loc_b, 'Storage RLS Vendor B', 'active')
  RETURNING id INTO v_vendor_b;

  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, file_name, storage_path, status, uploaded_via)
  VALUES (v_vendor_a, v_org_a, v_brand_a, v_loc_a, 'w9', 'a.pdf', 'w9_documents/tokA_a.pdf', 'pending_review', 'vendor_magic_link');

  INSERT INTO public.vendor_documents (vendor_id, organization_id, brand_id, location_id, document_type, file_name, storage_path, status, uploaded_via)
  VALUES (v_vendor_b, v_org_b, v_brand_b, v_loc_b, 'w9', 'b.pdf', 'w9_documents/tokB_b.pdf', 'pending_review', 'vendor_magic_link');

  -- Pre-existing, unrelated gap: check_file_security() is SECURITY DEFINER but EXECUTE was
  -- never granted to authenticated, so it errors (not just returns false) for ANY authenticated
  -- storage.objects insert in ANY bucket, since the "Tenant Isolation Avatars Insert" policy's
  -- WITH CHECK gets evaluated alongside every other permissive policy on the table. Granted only
  -- inside this rolled-back test transaction so the INSERT assertions below can actually reach
  -- this migration's policies instead of erroring out on an unrelated avatars-bucket policy.
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_file_security(text, jsonb) TO authenticated';

  -- storage.objects rows would normally come from the actual file upload; inserted directly
  -- here (as postgres, which bypasses RLS) since the object body itself is irrelevant to a
  -- policy test -- only bucket_id/name matter.
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES
    ('vendor_documents', 'w9_documents/tokA_a.pdf', v_manager_a, '{}'::jsonb),
    ('vendor_documents', 'w9_documents/tokB_b.pdf', v_manager_a, '{}'::jsonb);

  -- Impersonate org A's manager, active at their own (only) location.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_manager_a::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Own org's document: still readable -- the fix must not also break legitimate access.
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'vendor_documents' AND name = 'w9_documents/tokA_a.pdf';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'org A manager expected to read own W-9 object, got %', v_count;
  END IF;

  -- Other org's document: the cross-tenant exposure this migration closes (VO-T-091).
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'vendor_documents' AND name = 'w9_documents/tokB_b.pdf';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'org A manager could read org B W-9 object -- cross-tenant storage exposure not fixed, got %', v_count;
  END IF;

  -- Full bucket listing must not leak org B's row either.
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'vendor_documents';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'org A manager bucket listing expected exactly 1 visible object, got %', v_count;
  END IF;

  -- Admin-upload INSERT for org A's own vendor succeeds (path-derived scope, no vendor_documents row yet).
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('vendor_documents', 'admin_uploads/' || v_vendor_a::text || '/1_new.pdf', v_manager_a, '{}'::jsonb);

  SELECT count(*) INTO v_count FROM storage.objects WHERE name = 'admin_uploads/' || v_vendor_a::text || '/1_new.pdf';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'org A manager admin-upload insert for own vendor was expected to succeed';
  END IF;

  -- Admin-upload INSERT for org B's vendor is blocked.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES ('vendor_documents', 'admin_uploads/' || v_vendor_b::text || '/1_new.pdf', v_manager_a, '{}'::jsonb);
    RAISE EXCEPTION 'org A manager admin-upload insert for org B vendor was allowed';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR with_check_option_violation THEN
      NULL;
  END;

  RESET ROLE;

  RAISE NOTICE 'vendor_documents storage RLS scoping acceptance assertions passed';
END $$;

ROLLBACK;
