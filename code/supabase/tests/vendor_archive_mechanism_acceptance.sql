BEGIN;

CREATE TEMP TABLE archive_test_vars (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

GRANT ALL ON archive_test_vars TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_other_brand uuid := gen_random_uuid();
  v_other_location uuid := gen_random_uuid();
  v_manager uuid := gen_random_uuid();
  v_other_manager uuid := gen_random_uuid();
  v_vendor uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_manager, 'authenticated', 'authenticated', 'archive-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_other_manager, 'authenticated', 'authenticated', 'archive-other-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org, 'Archive Org', 'archive-org-' || replace(v_org::text, '-', '')),
    (v_other_org, 'Archive Other Org', 'archive-other-org-' || replace(v_other_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Archive Brand'), (v_other_brand, v_other_org, 'Archive Other Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Archive Location'), (v_other_location, v_other_org, v_other_brand, 'Archive Other Location');

  INSERT INTO public.profiles (id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_manager, 'archive-manager@example.test', 'Archive Manager', 'location_manager', v_org, v_brand, v_location, 'location'),
    (v_other_manager, 'archive-other-manager@example.test', 'Archive Other Manager', 'location_manager', v_other_org, v_other_brand, v_other_location, 'location')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, organization_id = EXCLUDED.organization_id,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id, updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_manager, 'location_manager'), (v_other_org, v_other_manager, 'location_manager');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Archive Test Vendor', 'active')
  RETURNING id INTO v_vendor;

  INSERT INTO archive_test_vars(key, value) VALUES
    ('org', v_org),
    ('brand', v_brand),
    ('location', v_location),
    ('other_org', v_other_org),
    ('other_brand', v_other_brand),
    ('other_location', v_other_location),
    ('manager', v_manager),
    ('other_manager', v_other_manager),
    ('vendor', v_vendor);
END $$;

DO $$
BEGIN
  -- Out-of-org manager cannot archive it.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM archive_test_vars WHERE key = 'other_manager'), 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.archive_vendor((SELECT value FROM archive_test_vars WHERE key = 'vendor'));
    RAISE EXCEPTION 'out-of-org manager archived a vendor they cannot access';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%Access denied%' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;
END $$;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- In-scope manager archives it successfully.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM archive_test_vars WHERE key = 'manager'), 'role', 'authenticated')::text, true);

  PERFORM public.archive_vendor((SELECT value FROM archive_test_vars WHERE key = 'vendor'));

  -- Archived vendors disappear from the normal list, same as every other soft-deleted table.
  SELECT count(*) INTO v_count FROM public.vendors WHERE id = (SELECT value FROM archive_test_vars WHERE key = 'vendor');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'archived vendor still visible via normal SELECT, got %', v_count;
  END IF;

  BEGIN
    PERFORM public.archive_vendor((SELECT value FROM archive_test_vars WHERE key = 'vendor'));
    RAISE EXCEPTION 'double-archive was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%already archived%' AND SQLERRM NOT ILIKE '%Access denied%' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = (SELECT value FROM archive_test_vars WHERE key = 'vendor') AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'archive_vendor did not set deleted_at';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = (SELECT value FROM archive_test_vars WHERE key = 'vendor') AND event_type = 'vendor_archived' AND actor_id = (SELECT value FROM archive_test_vars WHERE key = 'manager');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one vendor_archived audit event, got %', v_count;
  END IF;
END $$;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- Restore brings it back.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM archive_test_vars WHERE key = 'manager'), 'role', 'authenticated')::text, true);

  PERFORM public.restore_vendor((SELECT value FROM archive_test_vars WHERE key = 'vendor'));

  SELECT count(*) INTO v_count FROM public.vendors WHERE id = (SELECT value FROM archive_test_vars WHERE key = 'vendor');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'restored vendor not visible via normal SELECT, got %', v_count;
  END IF;

  BEGIN
    PERFORM public.restore_vendor((SELECT value FROM archive_test_vars WHERE key = 'vendor'));
    RAISE EXCEPTION 'restoring a non-archived vendor was allowed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%not archived%' THEN
        RAISE;
      END IF;
  END;

  RESET ROLE;

  IF EXISTS (SELECT 1 FROM public.vendors WHERE id = (SELECT value FROM archive_test_vars WHERE key = 'vendor') AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'restore_vendor did not clear deleted_at';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = (SELECT value FROM archive_test_vars WHERE key = 'vendor') AND event_type = 'vendor_restored' AND actor_id = (SELECT value FROM archive_test_vars WHERE key = 'manager');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one vendor_restored audit event, got %', v_count;
  END IF;

  RAISE NOTICE 'vendor archive mechanism acceptance assertions passed';
END $$;

ROLLBACK;
