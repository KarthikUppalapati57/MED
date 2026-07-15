-- 20260719000003: Drop products.preferred_vendor_id
--
-- Dead column: defined in 001_initial_schema.sql, never read or written by any app code,
-- edge function, or RPC (confirmed by full-repo grep). The real product<->vendor bridge is
-- vendor_items + vendor_item_mappings (081_vendor_item_matching.sql), which supports a
-- product being sourced from multiple vendors -- a single preferred_vendor_id FK can't model
-- that and nothing in the app ever populated it.

BEGIN;

ALTER TABLE public.products DROP COLUMN IF EXISTS preferred_vendor_id;

COMMIT;
