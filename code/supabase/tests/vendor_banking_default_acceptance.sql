BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_vendor uuid;
  v_bank_default uuid;
  v_bank_fallback uuid;
  v_selected record;
  v_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Vendor Default Org', 'vendor-default-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Vendor Default Brand');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, NULL, 'Defaultable Vendor', 'active')
  RETURNING id INTO v_vendor;

  SET LOCAL ROLE service_role;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, verification_state)
  VALUES (v_vendor, v_org, 'verified')
  RETURNING id INTO v_bank_default;

  PERFORM public.store_vendor_banking_secret(v_bank_default, '000111222333', '021000021');

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_bank_default
      AND is_default = true
      AND account_last4 = '2333'
      AND banking_secret_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'first banking row did not auto-default with secret + last4';
  END IF;

  INSERT INTO public.vendor_banking_details (vendor_id, organization_id, verification_state)
  VALUES (v_vendor, v_org, 'verified')
  RETURNING id INTO v_bank_fallback;

  PERFORM public.store_vendor_banking_secret(v_bank_fallback, '999888777666', '011000015');

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_bank_fallback
      AND is_default = false
      AND account_last4 = '7666'
      AND banking_secret_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'second banking row should coexist as non-default fallback';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.vendor_banking_details
  WHERE vendor_id = v_vendor
    AND deleted_at IS NULL;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected two banking rows for same vendor, got %', v_count;
  END IF;

  UPDATE public.vendor_banking_details
     SET is_default = true
   WHERE id = v_bank_fallback;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_bank_default
      AND is_default = false
      AND is_active = false
  ) THEN
    RAISE EXCEPTION 'promoting fallback did not demote and deactivate prior default %', v_bank_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_banking_details
    WHERE id = v_bank_fallback
      AND is_default = true
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'promoted fallback is not the active default %', v_bank_fallback;
  END IF;

  SELECT *
    INTO v_selected
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_selected.id IS DISTINCT FROM v_bank_fallback OR v_selected.account_last4 <> '7666' OR v_selected.banking_secret_id IS NULL THEN
    RAISE EXCEPTION 'picker expected promoted fallback %, got %', v_bank_fallback, row_to_json(v_selected);
  END IF;

  UPDATE public.vendor_banking_details
     SET verification_state = 'pending'
   WHERE id = v_bank_default;

  SELECT *
    INTO v_selected
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_selected.id IS DISTINCT FROM v_bank_fallback OR v_selected.account_last4 <> '7666' OR v_selected.banking_secret_id IS NULL THEN
    RAISE EXCEPTION 'picker expected verified fallback %, got %', v_bank_fallback, row_to_json(v_selected);
  END IF;

  UPDATE public.vendor_banking_details
     SET is_active = false
   WHERE id = v_bank_fallback;

  SELECT count(*)
    INTO v_count
  FROM public.get_vendor_payment_account(v_vendor);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'picker expected no payable account, got % row(s)', v_count;
  END IF;

  RESET ROLE;
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.get_vendor_payment_account(v_vendor);
    RAISE EXCEPTION 'authenticated could execute get_vendor_payment_account';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  RAISE NOTICE 'Vendor banking default acceptance assertions passed';
END $$;

ROLLBACK;
