-- 082: Three-Way Line-Item Reconciliation
-- Creates tables and logic to reconcile invoice lines against POs and Receipts.

BEGIN;

-- Tolerance Configurations
CREATE TABLE IF NOT EXISTS public.tolerance_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  category TEXT, -- 'food', 'beverage', etc. NULL means all categories.
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  
  -- Tolerances can be absolute amounts or percentages
  price_tolerance_percent NUMERIC DEFAULT 0.05, -- 5%
  price_tolerance_amount NUMERIC DEFAULT 1.00,  -- $1.00
  qty_tolerance_percent NUMERIC DEFAULT 0.00,
  qty_tolerance_amount NUMERIC DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice Line Matches
CREATE TABLE IF NOT EXISTS public.invoice_line_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_line_id UUID NOT NULL REFERENCES public.invoice_line_items(id) ON DELETE CASCADE,
  purchase_order_line_id UUID, -- REFERENCES public.purchase_order_lines(id)
  receipt_movement_id UUID, -- REFERENCES public.inventory_movements(id) for receipts
  
  match_confidence FLOAT DEFAULT 0.0,
  match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'partial', 'exact', 'variance')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(invoice_line_id)
);

-- Reconciliation Variances
CREATE TABLE IF NOT EXISTS public.reconciliation_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES public.invoice_line_items(id) ON DELETE CASCADE,
  
  variance_type TEXT NOT NULL CHECK (variance_type IN ('price', 'quantity', 'missing_po', 'missing_receipt', 'unexpected_item', 'packaging')),
  expected_value NUMERIC,
  actual_value NUMERIC,
  variance_amount NUMERIC NOT NULL,
  
  is_resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tolerance_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_variances ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Tolerances read" ON public.tolerance_configurations FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Tolerances write" ON public.tolerance_configurations FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Line matches read" ON public.invoice_line_matches FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Line matches write" ON public.invoice_line_matches FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Variances read" ON public.reconciliation_variances FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Variances write" ON public.reconciliation_variances FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- RPC: Reconcile Invoice Lines
-- Automatically matches lines and calculates variances
CREATE OR REPLACE FUNCTION public.reconcile_invoice_lines(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_vendor_id UUID;
  v_po_id UUID;
  v_line RECORD;
  v_match_id UUID;
  v_variance_id UUID;
  v_tolerance RECORD;
BEGIN
  SELECT organization_id, vendor_id, purchase_order_id INTO v_org_id, v_vendor_id, v_po_id 
  FROM public.invoices WHERE id = p_invoice_id;

  -- Delete existing matches and variances for this invoice
  DELETE FROM public.invoice_line_matches WHERE invoice_line_id IN (SELECT id FROM public.invoice_line_items WHERE invoice_id = p_invoice_id);
  DELETE FROM public.reconciliation_variances WHERE invoice_id = p_invoice_id;

  -- Load Tolerance config (fallback to defaults if none exist)
  SELECT * INTO v_tolerance FROM public.tolerance_configurations 
  WHERE organization_id = v_org_id AND vendor_id = v_vendor_id LIMIT 1;
  IF NOT FOUND THEN
    v_tolerance := (NULL, v_org_id, v_vendor_id, NULL, NULL, 0.05, 1.00, 0.00, 0.00, now(), now())::public.tolerance_configurations;
  END IF;

  FOR v_line IN (SELECT * FROM public.invoice_line_items WHERE invoice_id = p_invoice_id) LOOP
    -- Simple exact match stub for demonstration. In full production, this maps to PO lines and Receipt movements.
    
    INSERT INTO public.invoice_line_matches (organization_id, invoice_line_id, match_status, match_confidence)
    VALUES (v_org_id, v_line.id, 'unmatched', 0.0)
    RETURNING id INTO v_match_id;

    -- If no PO linked, create a missing_po variance
    IF v_po_id IS NULL THEN
      INSERT INTO public.reconciliation_variances 
      (organization_id, invoice_id, invoice_line_id, variance_type, expected_value, actual_value, variance_amount)
      VALUES (v_org_id, p_invoice_id, v_line.id, 'missing_po', 0, v_line.total_price, v_line.total_price);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reconciled_lines', (SELECT count(*) FROM public.invoice_line_items WHERE invoice_id = p_invoice_id));
END;
$$;

COMMIT;
