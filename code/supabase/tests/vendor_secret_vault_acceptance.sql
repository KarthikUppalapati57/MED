BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_loc uuid := gen_random_uuid();
  v_vendor uuid;
  v_bank1 uuid;
  v_bank2 uuid;
  v_tax uuid;
  v_json jsonb;
  v_text text;
  v_count integer;
  v_secret1 uuid;
  v_secret2 uuid;
  v_tax_secret uuid;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Vault Vendor Org', 'vault-vendor-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Vault Vendor Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_loc, v_org, v_brand, 'Vault Vendor Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, NULL, 'Vaulted Vendor', 'active')
  RETURNING id INTO v_vendor;

  SET LOCAL ROLE service_role;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, brand_id, location_id, verification_state)
  VALUES (v_vendor, v_org, v_brand, NULL, 'pending')
  RETURNING id INTO v_bank1;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, brand_id, location_id, verification_state)
  VALUES (v_vendor, v_org, v_brand, NULL, 'pending')
  RETURNING id INTO v_bank2;

  INSERT INTO public.vendor_tax_information (vendor_id, organization_id, brand_id, location_id, legal_name, w9_status)
  VALUES (v_vendor, v_org, v_brand, NULL, 'Vaulted Vendor Legal', 'received')
  RETURNING id INTO v_tax;

  PERFORM public.store_vendor_banking_secret(v_bank1, '000111222333', '021000021');
  PERFORM public.store_vendor_banking_secret(v_bank2, '999888777666', '011000015');
  PERFORM public.store_vendor_tax_secret(v_tax, '12-3456789');

  SELECT banking_secret_id, account_last4
    INTO v_secret1, v_text
  FROM public.vendor_banking_details
  WHERE id = v_bank1;

  IF v_secret1 IS NULL OR v_text <> '2333' THEN
    RAISE EXCEPTION 'bank row 1 expected secret ref + last4 2333, got secret %, last4 %', v_secret1, v_text;
  END IF;

  SELECT banking_secret_id, account_last4
    INTO v_secret2, v_text
  FROM public.vendor_banking_details
  WHERE id = v_bank2;

  IF v_secret2 IS NULL OR v_text <> '7666' THEN
    RAISE EXCEPTION 'bank row 2 expected secret ref + last4 7666, got secret %, last4 %', v_secret2, v_text;
  END IF;

  IF v_secret1 = v_secret2 THEN
    RAISE EXCEPTION 'multi-account safety failed: two banking rows share secret id %', v_secret1;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM vault.secrets
  WHERE name IN ('vbank_' || v_bank1::text, 'vbank_' || v_bank2::text);

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected two row-keyed banking secrets, got %', v_count;
  END IF;

  SELECT tax_secret_id, tax_id_last4
    INTO v_tax_secret, v_text
  FROM public.vendor_tax_information
  WHERE id = v_tax;

  IF v_tax_secret IS NULL OR v_text <> '6789' THEN
    RAISE EXCEPTION 'tax row expected secret ref + last4 6789, got secret %, last4 %', v_tax_secret, v_text;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'vendor_banking_details' AND column_name IN ('account_number', 'routing_number'))
      OR (table_name = 'vendor_tax_information' AND column_name = 'tax_id_full')
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'plaintext vendor banking/tax columns still exist, count %', v_count;
  END IF;

  SELECT public.get_vendor_banking_for_audit(v_bank1)
    INTO v_json;

  IF v_json->>'account' <> '000111222333' OR v_json->>'routing' <> '021000021' THEN
    RAISE EXCEPTION 'audit banking decrypt returned wrong payload %', v_json;
  END IF;

  SELECT public.get_vendor_tax_for_audit(v_tax)
    INTO v_text;

  IF v_text <> '12-3456789' THEN
    RAISE EXCEPTION 'audit tax decrypt returned wrong value %', v_text;
  END IF;

  RESET ROLE;
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.store_vendor_banking_secret(v_bank1, '123456789000', '021000021');
    RAISE EXCEPTION 'authenticated could execute store_vendor_banking_secret';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.store_vendor_tax_secret(v_tax, '98-7654321');
    RAISE EXCEPTION 'authenticated could execute store_vendor_tax_secret';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_vendor_banking_for_audit(v_bank1);
    RAISE EXCEPTION 'authenticated could execute get_vendor_banking_for_audit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.get_vendor_tax_for_audit(v_tax);
    RAISE EXCEPTION 'authenticated could execute get_vendor_tax_for_audit';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  RAISE NOTICE 'Vendor secret Vault acceptance assertions passed';
END $$;

ROLLBACK;
