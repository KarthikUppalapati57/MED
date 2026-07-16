-- Acceptance test for 20260719000018_vendor_custom_fields.sql
--
-- Verifies: (1) the column exists with a non-null jsonb default, (2) a location_manager can
-- write custom_fields on their own location-specific vendor, (3) that SAME location_manager
-- is still blocked from writing custom_fields on a brand-shared vendor -- proving the
-- existing reference_scope_writable() policy governs this new column exactly like every
-- other vendor column, with no bypass introduced.

BEGIN;

SELECT plan(4);

CREATE TEMP TABLE vcf_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE vcf_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON vcf_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vcf_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_vendor_location_specific uuid;
  v_vendor_brand_shared uuid;
BEGIN
  INSERT INTO vcf_ids(key, value) VALUES ('org', v_org), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'VCF Org', 'vcf-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'VCF Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'VCF Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_location_manager, 'authenticated', 'authenticated', 'vcf-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id)
  VALUES (v_location_manager, 'vcf-location-manager@example.test', 'VCF Location Manager', 'location_manager', 'active', v_org, v_brand, v_location)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name)
  VALUES (v_org, v_brand, v_location, 'VCF Location-Specific Vendor')
  RETURNING id INTO v_vendor_location_specific;

  INSERT INTO public.vendors (organization_id, brand_id, location_id, name)
  VALUES (v_org, v_brand, NULL, 'VCF Brand-Shared Vendor')
  RETURNING id INTO v_vendor_brand_shared;

  INSERT INTO vcf_ids(key, value) VALUES
    ('vendor_location_specific', v_vendor_location_specific),
    ('vendor_brand_shared', v_vendor_brand_shared);
END $$;

INSERT INTO vcf_results
SELECT 'custom_fields_column_exists_with_default',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'vendors'
           AND column_name = 'custom_fields' AND data_type = 'jsonb' AND is_nullable = 'NO'
       ),
       'checked information_schema for a non-nullable jsonb column';

INSERT INTO vcf_results
SELECT 'new_vendor_defaults_to_empty_object',
       custom_fields = '{}'::jsonb,
       'custom_fields=' || custom_fields::text
FROM public.vendors WHERE id = (SELECT value FROM vcf_ids WHERE key = 'vendor_location_specific');

-- ===== location_manager can write custom_fields on their own location-specific vendor =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM vcf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.vendors SET custom_fields = '{"preferred_delivery_window": "6am-8am", "loyalty_tier": "gold"}'::jsonb
WHERE id = (SELECT value FROM vcf_ids WHERE key = 'vendor_location_specific');

RESET ROLE;

INSERT INTO vcf_results
SELECT 'location_manager_writes_own_location_vendor',
       custom_fields->>'loyalty_tier' = 'gold',
       'custom_fields=' || custom_fields::text
FROM public.vendors WHERE id = (SELECT value FROM vcf_ids WHERE key = 'vendor_location_specific');

-- ===== that SAME location_manager is blocked from writing a brand-shared vendor's custom_fields =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM vcf_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE public.vendors SET custom_fields = '{"should_not_apply": true}'::jsonb
WHERE id = (SELECT value FROM vcf_ids WHERE key = 'vendor_brand_shared');

RESET ROLE;

INSERT INTO vcf_results
SELECT 'location_manager_blocked_on_brand_shared_vendor',
       custom_fields = '{}'::jsonb,
       'custom_fields=' || custom_fields::text
FROM public.vendors WHERE id = (SELECT value FROM vcf_ids WHERE key = 'vendor_brand_shared');

-- ===================== verdict =====================

SELECT ok(passed, test_name) FROM vcf_results ORDER BY test_name;

SELECT * FROM finish();

ROLLBACK;
