BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor uuid;
  v_missing_vendor uuid;
  v_null_ref_vendor uuid;
  v_onboarding_vendor uuid;
  v_link record;
  v_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Provider Link Edge Rewire Org', 'provider-link-edge-rewire-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Provider Link Edge Rewire Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Provider Link Edge Rewire Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Link Payout Vendor', 'active')
  RETURNING id INTO v_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Link Missing Vendor', 'active')
  RETURNING id INTO v_missing_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Link Null Ref Vendor', 'active')
  RETURNING id INTO v_null_ref_vendor;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Link Onboarding Vendor', 'active')
  RETURNING id INTO v_onboarding_vendor;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    provider,
    provider_customer_ref,
    provider_status
  ) VALUES (
    v_vendor,
    'dwolla',
    'https://api-sandbox.dwolla.com/customers/edge-rewire-destination',
    'verified'
  );

  SELECT *
    INTO v_link
  FROM public.get_vendor_provider_link(v_vendor, 'dwolla');

  IF v_link.provider_customer_ref <> 'https://api-sandbox.dwolla.com/customers/edge-rewire-destination'
     OR v_link.provider_status <> 'verified' THEN
    RAISE EXCEPTION 'provider-link helper did not resolve seeded Dwolla ref: %', row_to_json(v_link);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.get_vendor_provider_link(v_missing_vendor, 'dwolla');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'missing provider-link should resolve to zero rows, got %', v_count;
  END IF;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    provider,
    provider_customer_ref,
    provider_status
  ) VALUES (
    v_null_ref_vendor,
    'dwolla',
    NULL,
    'verified'
  );

  SELECT *
    INTO v_link
  FROM public.get_vendor_provider_link(v_null_ref_vendor, 'dwolla');

  IF v_link.id IS NULL OR v_link.provider_customer_ref IS NOT NULL THEN
    RAISE EXCEPTION 'null-ref provider-link setup did not resolve as expected: %', row_to_json(v_link);
  END IF;

  UPDATE public.vendor_payment_provider_links
     SET provider_status = 'suspended', is_active = false
   WHERE vendor_id = v_vendor AND provider = 'dwolla';

  UPDATE public.vendor_payment_provider_links
     SET provider_status = 'verified', updated_at = now()
   WHERE provider = 'dwolla'
     AND provider_customer_ref = 'https://api-sandbox.dwolla.com/customers/edge-rewire-destination'
     AND deleted_at IS NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_payment_provider_links
    WHERE vendor_id = v_vendor
      AND provider = 'dwolla'
      AND provider_status = 'verified'
      AND is_active = false
  ) THEN
    RAISE EXCEPTION 'webhook-shaped update should find inactive non-deleted provider link by ref';
  END IF;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    provider,
    provider_status
  ) VALUES (
    v_onboarding_vendor,
    'dwolla',
    'document_required'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_payment_provider_links
    WHERE vendor_id = v_onboarding_vendor
      AND provider = 'dwolla'
      AND provider_status = 'document_required'
      AND organization_id = v_org
      AND brand_id = v_brand
      AND location_id = v_location
  ) THEN
    RAISE EXCEPTION 'onboarding-shaped insert did not derive provider-link scope from vendor';
  END IF;

  RAISE NOTICE 'Provider links edge rewire acceptance assertions passed';
END $$;

ROLLBACK;