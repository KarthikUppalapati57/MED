-- 098: Vendor item price intelligence and invoice line mapping
-- Adds the fields needed to turn invoice lines into reusable vendor catalog data.

BEGIN;

ALTER TABLE public.vendor_items
  ADD COLUMN IF NOT EXISTS previous_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS last_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_invoice_line_id UUID REFERENCES public.invoice_line_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_purchased_at DATE,
  ADD COLUMN IF NOT EXISTS last_price_change_percent NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS price_variance_threshold_percent NUMERIC(8,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS mapping_status TEXT DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped', 'suggested', 'verified')),
  ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT 0;

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_item_id UUID REFERENCES public.vendor_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_item_code TEXT,
  ADD COLUMN IF NOT EXISTS vendor_unit TEXT,
  ADD COLUMN IF NOT EXISTS price_variance_percent NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS price_variance_flag BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendor_items_price_variance
  ON public.vendor_items(organization_id, vendor_id, price_variance_flag);

CREATE INDEX IF NOT EXISTS idx_vendor_items_mapping_status
  ON public.vendor_items(organization_id, mapping_status);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_vendor_item
  ON public.invoice_line_items(vendor_item_id);

CREATE OR REPLACE FUNCTION public.refresh_vendor_item_mapping_status(p_vendor_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified_count INTEGER;
  v_suggested_count INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE is_verified = true),
    COUNT(*)
  INTO v_verified_count, v_suggested_count
  FROM public.vendor_item_mappings
  WHERE vendor_item_id = p_vendor_item_id;

  UPDATE public.vendor_items
  SET mapping_status = CASE
      WHEN v_verified_count > 0 THEN 'verified'
      WHEN v_suggested_count > 0 THEN 'suggested'
      ELSE 'unmapped'
    END,
    updated_at = now()
  WHERE id = p_vendor_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_vendor_item_mapping_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_item_id UUID;
BEGIN
  v_vendor_item_id := COALESCE(NEW.vendor_item_id, OLD.vendor_item_id);
  PERFORM public.refresh_vendor_item_mapping_status(v_vendor_item_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_item_mapping_status_insert ON public.vendor_item_mappings;
CREATE TRIGGER trg_vendor_item_mapping_status_insert
  AFTER INSERT OR UPDATE ON public.vendor_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_item_mapping_status();

DROP TRIGGER IF EXISTS trg_vendor_item_mapping_status_delete ON public.vendor_item_mappings;
CREATE TRIGGER trg_vendor_item_mapping_status_delete
  AFTER DELETE ON public.vendor_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_item_mapping_status();

COMMIT;
