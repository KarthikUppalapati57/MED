BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid;
  v_tax uuid;
  v_bank uuid;
  v_text text;
  v_json jsonb;
  v_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Decrypt Audit Org', 'decrypt-audit-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Decrypt Audit Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Decrypt Audit Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Decrypt Audit Vendor', 'active')
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, verification_status, w9_status)
  VALUES (v_vendor, v_org, v_brand, v_location, 'verified', 'verified')
  RETURNING id INTO v_tax;
  PERFORM public.store_vendor_tax_secret(v_tax, '123456789');

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, brand_id, location_id, verification_state, callback_status, is_default)
  VALUES (v_vendor, v_org, v_brand, v_location, 'pending', 'pending', true)
  RETURNING id INTO v_bank;
  PERFORM public.store_vendor_banking_secret(v_bank, '000111222333', '021000021');

  SELECT count(*) INTO v_count FROM public.vendor_onboarding_events WHERE vendor_id = v_vendor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'expected zero audit events before any decrypt call, got %', v_count;
  END IF;

  -- get_vendor_tax_for_audit / get_vendor_banking_for_audit are service_role-only (VO-SEC-008).
  SET LOCAL ROLE service_role;

  SELECT public.get_vendor_tax_for_audit(v_tax) INTO v_text;
  IF v_text <> '123456789' THEN
    RAISE EXCEPTION 'expected decrypted tax secret 123456789, got %', v_text;
  END IF;

  SELECT public.get_vendor_banking_for_audit(v_bank) INTO v_json;
  IF v_json->>'account' <> '000111222333' THEN
    RAISE EXCEPTION 'expected decrypted banking account 000111222333, got %', v_json;
  END IF;

  RESET ROLE;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = v_vendor
    AND event_type = 'tax_secret_decrypted'
    AND (metadata->>'tax_row_id')::uuid = v_tax;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one tax_secret_decrypted audit event, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.vendor_onboarding_events
  WHERE vendor_id = v_vendor
    AND event_type = 'banking_secret_decrypted'
    AND (metadata->>'banking_row_id')::uuid = v_bank;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one banking_secret_decrypted audit event, got %', v_count;
  END IF;

  -- A failed lookup (nonexistent row) must not fabricate an audit event either.
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.get_vendor_tax_for_audit(gen_random_uuid());
    RAISE EXCEPTION 'decrypt of a nonexistent tax row was expected to fail';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  RESET ROLE;

  SELECT count(*) INTO v_count FROM public.vendor_onboarding_events WHERE vendor_id = v_vendor;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'failed decrypt lookup should not add an audit event, expected 2 total got %', v_count;
  END IF;

  RAISE NOTICE 'vendor secret decrypt audit log acceptance assertions passed';
END $$;

ROLLBACK;
