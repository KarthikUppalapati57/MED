-- Acceptance test for 20260724000003_product_module_production_hardening.sql
--
-- Verifies the production-critical product module contracts called out by the
-- tester checklist: database constraints, RPC overload cleanup, anon grant
-- removal, missing feature RPCs/tables, audit/price-history triggers, and the
-- invoice-product sync trigger attachment.

BEGIN;

CREATE TEMP TABLE pmph_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

INSERT INTO pmph_results
SELECT 'product_status_check_exists',
       EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = 'public.products'::regclass
           AND conname = 'products_status_check'
       ),
       'products_status_check constraint should exist';

INSERT INTO pmph_results
SELECT 'product_accounting_category_check_exists',
       EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conrelid = 'public.products'::regclass
           AND conname = 'products_accounting_category_check'
       ),
       'products_accounting_category_check constraint should exist';

INSERT INTO pmph_results
SELECT 'single_update_product_details_signature',
       count(*) = 1,
       'update_product_details overload count=' || count(*)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'update_product_details';

INSERT INTO pmph_results
SELECT 'core_product_rpcs_not_granted_to_anon',
       NOT EXISTS (
         SELECT 1
         FROM information_schema.routine_privileges rp
         WHERE rp.specific_schema = 'public'
           AND rp.grantee IN ('anon', 'PUBLIC')
           AND rp.routine_name IN (
             'create_product_details',
             'update_product_details',
             'soft_delete_product_safe',
             'set_product_inventory_tracking'
           )
       ),
       'anon/PUBLIC must not retain EXECUTE on core product write RPCs';

INSERT INTO pmph_results
SELECT 'product_audit_trigger_exists',
       EXISTS (
         SELECT 1
         FROM pg_trigger
         WHERE tgrelid = 'public.products'::regclass
           AND tgname = 'audit_product_change'
           AND NOT tgisinternal
       ),
       'audit_product_change trigger should exist';

INSERT INTO pmph_results
SELECT 'product_price_history_trigger_exists',
       EXISTS (
         SELECT 1
         FROM pg_trigger
         WHERE tgrelid = 'public.products'::regclass
           AND tgname = 'capture_product_price_history'
           AND NOT tgisinternal
       ),
       'capture_product_price_history trigger should exist';

INSERT INTO pmph_results
SELECT 'invoice_product_sync_trigger_attached',
       EXISTS (
         SELECT 1
         FROM pg_trigger
         WHERE tgrelid = 'public.invoices'::regclass
           AND tgname = 'trigger_sync_invoice_products'
           AND NOT tgisinternal
       ),
       'trigger_sync_invoice_products should be attached to invoices';

INSERT INTO pmph_results
SELECT 'new_product_feature_tables_exist',
       bool_and(to_regclass(table_name) IS NOT NULL),
       string_agg(table_name, ', ' ORDER BY table_name)
FROM (VALUES
  ('public.product_barcodes'),
  ('public.product_import_jobs'),
  ('public.product_import_rows')
) AS expected(table_name);

INSERT INTO pmph_results
SELECT 'new_product_feature_rpcs_exist',
       count(*) = 8,
       'found=' || count(*)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'restore_product',
    'upsert_product_barcode',
    'remove_product_barcode',
    'verify_vendor_item_mapping',
    'merge_products',
    'find_duplicate_products',
    'stage_product_import',
    'commit_product_import'
  );

INSERT INTO pmph_results
SELECT 'derive_product_category_type_has_rich_taxonomy',
       public.derive_product_category_type('PINOT NOIR', 'Wine', '5210') = 'Wine'
       AND public.derive_product_category_type('IPA KEG', 'Beer', '5200') = 'Beer'
       AND public.derive_product_category_type('VODKA', 'Liquor', '5220') = 'Liquor'
       AND public.derive_product_category_type('SODA WATER', 'N-A Bev', '5230') = 'N-A Bev',
       'taxonomy should include Wine/Beer/Liquor/N-A Bev buckets';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pmph_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Product module production hardening acceptance failed: %',
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY test_name) FROM pmph_results r WHERE NOT passed);
  END IF;
END $$;

SELECT * FROM pmph_results ORDER BY test_name;

ROLLBACK;
