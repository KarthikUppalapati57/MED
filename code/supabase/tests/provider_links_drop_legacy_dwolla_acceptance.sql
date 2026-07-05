BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid;
  v_payment_account uuid;
  v_link record;
  v_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Provider Links Drop Legacy Org', 'provider-links-drop-legacy-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Provider Links Drop Legacy Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Provider Links Drop Legacy Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Links Drop Legacy Vendor', 'active')
  RETURNING id INTO v_vendor;

  INSERT INTO public.payment_accounts (
    organization_id,
    brand_id,
    location_id,
    name,
    account_type,
    dwolla_funding_source_url,
    is_active
  ) VALUES (
    v_org,
    v_brand,
    v_location,
    'Source Funding Account',
    'checking',
    'https://api-sandbox.dwolla.com/funding-sources/source-123',
    true
  )
  RETURNING id INTO v_payment_account;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    provider,
    provider_customer_ref,
    provider_status
  ) VALUES (
    v_vendor,
    'dwolla',
    'https://api-sandbox.dwolla.com/customers/destination-123',
    'verified'
  );

  SELECT *
    INTO v_link
  FROM public.get_vendor_provider_link(v_vendor, 'dwolla');

  IF v_link.provider_customer_ref <> 'https://api-sandbox.dwolla.com/customers/destination-123'
     OR v_link.provider_status <> 'verified'
     OR v_link.organization_id <> v_org
     OR v_link.brand_id <> v_brand
     OR v_link.location_id <> v_location THEN
    RAISE EXCEPTION 'provider-link helper did not resolve scoped Dwolla destination ref: %', row_to_json(v_link);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_accounts
    WHERE id = v_payment_account
      AND dwolla_funding_source_url = 'https://api-sandbox.dwolla.com/funding-sources/source-123'
  ) THEN
    RAISE EXCEPTION 'payment_accounts.dwolla_funding_source_url should remain source-side ref';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vendors'
    AND column_name IN ('dwolla_customer_url', 'dwolla_onboarding_status');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'legacy vendors.dwolla_* columns should be dropped, found %', v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'payment_accounts'
    AND column_name = 'dwolla_funding_source_url';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'payment_accounts.dwolla_funding_source_url should still exist, found %', v_count;
  END IF;

  RAISE NOTICE 'Provider links drop legacy Dwolla acceptance assertions passed';
END $$;

ROLLBACK;