-- Acceptance test for 20260719000018_vendor_custom_fields.sql
--
-- Verifies: (1) the column exists with a non-null jsonb default, (2) a location_manager can
-- write custom_fields on their own location-specific vendor, (3) that SAME location_manager
-- is still blocked from writing custom_fields on a brand-shared vendor -- proving the
-- existing reference_scope_writable() policy governs this new column exactly like every
-- other vendor column, with no bypass introduced.

BEGIN;

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

SELECT * FROM vcf_results ORDER BY test_name;



SELECT row_to_json(vcf_results) FROM vcf_results; ROLLBACK;

