BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_wrong_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid;
  v_link_id uuid;
  v_link record;
  v_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org, 'Provider Link Consolidation Org', 'provider-link-consolidation-' || replace(v_org::text, '-', '')),
    (v_wrong_org, 'Provider Link Wrong Org', 'provider-link-wrong-' || replace(v_wrong_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Provider Link Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Provider Link Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Link Supplier', 'active')
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    provider,
    provider_customer_ref,
    provider_status
  ) VALUES (
    v_vendor,
    v_wrong_org,
    NULL,
    NULL,
    'checkbook',
    'checkbook-recipient-ref',
    'linked'
  )
  RETURNING id INTO v_link_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_payment_provider_links
    WHERE id = v_link_id
      AND provider = 'checkbook'
      AND organization_id = v_org
      AND brand_id = v_brand
      AND location_id = v_location
  ) THEN
    RAISE EXCEPTION 'checkbook provider was accepted but scope derive did not stamp from vendor';
  END IF;

  BEGIN
    INSERT INTO public.vendor_payment_provider_links (
      vendor_id,
      organization_id,
      provider,
      provider_customer_ref
    ) VALUES (
      v_vendor,
      v_org,
      'boguspay',
      'bad-ref'
    );
    RAISE EXCEPTION 'invalid provider bypassed provider CHECK';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    provider,
    provider_customer_ref,
    provider_status
  ) VALUES (
    v_vendor,
    'dwolla',
    'https://api-sandbox.dwolla.com/customers/provider-link-current',
    'verified'
  );

  SELECT *
    INTO v_link
  FROM public.get_vendor_provider_link(v_vendor, 'dwolla');

  IF v_link.provider_customer_ref <> 'https://api-sandbox.dwolla.com/customers/provider-link-current'
     OR v_link.provider_status <> 'verified'
     OR v_link.organization_id <> v_org
     OR v_link.brand_id <> v_brand
     OR v_link.location_id <> v_location THEN
    RAISE EXCEPTION 'get_vendor_provider_link returned wrong scoped Dwolla ref: %', row_to_json(v_link);
  END IF;

  SELECT count(*)
    INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'payment_accounts'
    AND column_name = 'dwolla_funding_source_url';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'payment_accounts.dwolla_funding_source_url should remain source-side funding ref';
  END IF;

  RAISE NOTICE 'Provider links consolidation acceptance assertions passed';
END $$;

ROLLBACK;