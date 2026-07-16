-- 20260719000012: Widen products.accounting_category to also accept GL codes
--
-- Discovered while verifying the newly-added create_product_details RPC end-to-end: the Add
-- Product dialog's "Accounting Category" dropdown (code/src/modules/products/pages/
-- Products.jsx:2004-2009) offers GL codes from code/src/lib/accountingConfig.js
-- (5100, 5110, ..., 5300), not the legacy enum products_accounting_category_check still only
-- accepts ('food', 'beverage', 'supplies', 'equipment', 'packaging', 'cleaning', 'other'). Any
-- product creation through the real UI's own dropdown has been failing this constraint. The GL
-- code set matches exactly what normalize_global_vendor_category() (20260625000028) already
-- hardcodes elsewhere in the DB, confirming this is the already-intended target vocabulary --
-- the products table constraint is the one piece that was never updated to match.
--
-- Widened, not replaced: existing rows using the old enum values keep working; this only adds
-- the GL codes as additional valid values, non-destructively.

BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_accounting_category_check;

ALTER TABLE public.products ADD CONSTRAINT products_accounting_category_check
  CHECK (
    accounting_category IS NULL
    OR accounting_category = ANY (ARRAY[
      'food', 'beverage', 'supplies', 'equipment', 'packaging', 'cleaning', 'other',
      '5100', '5110', '5120', '5130', '5140', '5150', '5160', '5170', '5190',
      '5200', '5210', '5220', '5230', '5240', '5290',
      '5300'
    ])
  );

COMMIT;
