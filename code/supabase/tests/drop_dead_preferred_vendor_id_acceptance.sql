-- Acceptance test for 20260719000003_drop_dead_preferred_vendor_id.sql
--
-- Verifies: (1) products.preferred_vendor_id column no longer exists, (2) the
-- products_preferred_vendor_id_fkey constraint is gone with it, (3) products can still be
-- created and read normally (the drop didn't break the table).

BEGIN;

CREATE TEMP TABLE dpv_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

INSERT INTO dpv_results
SELECT 'column_dropped',
       NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'preferred_vendor_id'
       ),
       'preferred_vendor_id column presence checked';

INSERT INTO dpv_results
SELECT 'fkey_dropped',
       NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'products_preferred_vendor_id_fkey'
       ),
       'products_preferred_vendor_id_fkey constraint presence checked';

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_product_id uuid;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'DPV Test Org', 'dpv-test-org-' || v_org);

  INSERT INTO public.products (organization_id, name, category)
  VALUES (v_org, 'DPV Test Product', 'food')
  RETURNING id INTO v_product_id;

  INSERT INTO dpv_results VALUES (
    'product_insert_still_works',
    v_product_id IS NOT NULL,
    'inserted product id=' || v_product_id
  );
END $$;

SELECT * FROM dpv_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM dpv_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'drop_dead_preferred_vendor_id_acceptance failed';
  END IF;
END $$;

ROLLBACK;
