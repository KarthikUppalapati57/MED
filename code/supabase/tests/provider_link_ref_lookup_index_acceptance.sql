BEGIN;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_vendor_a uuid;
  v_vendor_b uuid;
  v_link_a uuid;
  v_indexdef text;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Provider Ref Index Org', 'provider-ref-index-' || replace(v_org::text, '-', ''));

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Provider Ref Index Brand');

  INSERT INTO public.locations (id, organization_id, brand_id, name)
  VALUES (v_location, v_org, v_brand, 'Provider Ref Index Location');

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Ref Vendor A', 'active')
  RETURNING id INTO v_vendor_a;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name, status)
  VALUES (v_org, v_brand, v_location, 'Provider Ref Vendor B', 'active')
  RETURNING id INTO v_vendor_b;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    organization_id,
    provider,
    provider_customer_ref,
    provider_status,
    is_active
  ) VALUES (
    v_vendor_a,
    v_org,
    'dwolla',
    'https://api-sandbox.dwolla.com/customers/ref-index-1',
    'verified',
    false
  )
  RETURNING id INTO v_link_a;

  BEGIN
    INSERT INTO public.vendor_payment_provider_links (
      vendor_id,
      organization_id,
      provider,
      provider_customer_ref,
      provider_status,
      is_active
    ) VALUES (
      v_vendor_b,
      v_org,
      'dwolla',
      'https://api-sandbox.dwolla.com/customers/ref-index-1',
      'verified',
      true
    );
    RAISE EXCEPTION 'duplicate provider_customer_ref was allowed while first link is inactive';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  UPDATE public.vendor_payment_provider_links
     SET deleted_at = now()
   WHERE id = v_link_a;

  INSERT INTO public.vendor_payment_provider_links (
    vendor_id,
    organization_id,
    provider,
    provider_customer_ref,
    provider_status,
    is_active
  ) VALUES (
    v_vendor_b,
    v_org,
    'dwolla',
    'https://api-sandbox.dwolla.com/customers/ref-index-1',
    'verified',
    true
  );

  SELECT indexdef
    INTO v_indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'vendor_payment_provider_links'
    AND indexname = 'vendor_payment_provider_links_provider_customer_ref_uidx';

  IF v_indexdef IS NULL
     OR v_indexdef NOT ILIKE '%UNIQUE INDEX%'
     OR v_indexdef NOT ILIKE '%provider_customer_ref%'
     OR v_indexdef NOT ILIKE '%deleted_at IS NULL%'
     OR v_indexdef ILIKE '%is_active%' THEN
    RAISE EXCEPTION 'provider ref lookup index has wrong shape: %', v_indexdef;
  END IF;

  RAISE NOTICE 'Provider link ref lookup index acceptance assertions passed';
END $$;

ROLLBACK;