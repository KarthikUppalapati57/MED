-- ============================================================
-- Migration 106: Schema Hardening & "Perfect Tables"
-- ============================================================
-- This migration ties up loose architectural ends by enforcing strict 
-- Referential Integrity across the database WITHOUT modifying frontend column names.

BEGIN;

-- 1. Enforce strict relationships on Vendors -> Invoices -> Payments
ALTER TABLE public.invoices 
  DROP CONSTRAINT IF EXISTS invoices_vendor_id_fkey,
  ADD CONSTRAINT invoices_vendor_id_fkey 
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE public.payments 
  DROP CONSTRAINT IF EXISTS payments_vendor_id_fkey,
  ADD CONSTRAINT payments_vendor_id_fkey 
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE public.payments 
  DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey,
  ADD CONSTRAINT payments_invoice_id_fkey 
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

-- 2. Link Inventory to Products using true UUID Foreign Keys
--    Since the frontend text product_ids contain legacy duplicates (e.g., PRD-1028019),
--    we cannot enforce UNIQUE constraints on the text column. 
--    Instead, we add a true internal UUID column to build the perfect relational architecture
--    while leaving the frontend's text column perfectly intact.

ALTER TABLE public.inventory 
  ADD COLUMN IF NOT EXISTS internal_product_id UUID;

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS fk_inventory_internal_product_id,
  ADD CONSTRAINT fk_inventory_internal_product_id 
  FOREIGN KEY (internal_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Backfill the internal UUIDs safely by grabbing the most recently created matching product
UPDATE public.inventory i
SET internal_product_id = (
  SELECT p.id FROM public.products p 
  WHERE p.product_id = i.product_id 
  ORDER BY p.created_at DESC 
  LIMIT 1
)
WHERE internal_product_id IS NULL AND product_id IS NOT NULL;


-- 3. Link Invoice Line Items to Products using true UUID Foreign Keys
ALTER TABLE public.invoice_line_items 
  ADD COLUMN IF NOT EXISTS internal_product_id UUID;

ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS fk_invoice_line_item_internal_product_id,
  ADD CONSTRAINT fk_invoice_line_item_internal_product_id 
  FOREIGN KEY (internal_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Backfill the internal UUIDs for Line Items
UPDATE public.invoice_line_items li
SET internal_product_id = (
  SELECT p.id FROM public.products p 
  WHERE p.product_id = li.inventory_item_id 
  ORDER BY p.created_at DESC 
  LIMIT 1
)
WHERE internal_product_id IS NULL AND inventory_item_id IS NOT NULL;


-- 4. Clean up missing cascades on Line Items
ALTER TABLE public.invoice_line_items 
  DROP CONSTRAINT IF EXISTS invoice_line_items_invoice_id_fkey,
  ADD CONSTRAINT invoice_line_items_invoice_id_fkey 
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

COMMIT;
