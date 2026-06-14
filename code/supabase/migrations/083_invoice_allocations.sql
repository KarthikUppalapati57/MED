-- 083: Invoice Allocations for Category Summary and Split Coding
-- Creates tables and logic to allocate invoice totals to GL accounts/categories.

BEGIN;

-- Invoice Allocations Table
CREATE TABLE IF NOT EXISTS public.invoice_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  -- 'line_items' (COGS), 'tax', 'delivery', 'fuel', 'other', etc.
  allocation_type TEXT NOT NULL, 
  
  -- Sourced from gl_mappings if exists, otherwise free text
  category_name TEXT,
  gl_code TEXT,
  
  -- Optional location splitting
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  
  amount NUMERIC NOT NULL DEFAULT 0.0,
  
  -- For split coding logic
  percentage NUMERIC, -- e.g., 50 for 50%. Null if flat amount split.
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Invoice allocations read" ON public.invoice_allocations FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);
CREATE POLICY "Invoice allocations write" ON public.invoice_allocations FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- RPC: Calculate Default Invoice Allocations
-- Automatically buckets line items and fees into their default GL categories
CREATE OR REPLACE FUNCTION public.calculate_invoice_allocations(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_tax NUMERIC;
  v_fuel NUMERIC;
  v_delivery NUMERIC;
  v_other NUMERIC;
  
  v_cat_record RECORD;
BEGIN
  -- Get invoice details
  SELECT organization_id, tax_amount, fuel_surcharge, delivery_fee, other_charges 
  INTO v_org_id, v_tax, v_fuel, v_delivery, v_other
  FROM public.invoices WHERE id = p_invoice_id;

  -- Clear existing auto-generated allocations (this could be enhanced to preserve manual splits in the future)
  DELETE FROM public.invoice_allocations WHERE invoice_id = p_invoice_id;

  -- 1. Aggregate Line Items by Product Category
  FOR v_cat_record IN (
    SELECT 
      COALESCE(p.category, 'uncategorized') as cat_name, 
      SUM(ili.extended_price) as total_amount
    FROM public.invoice_line_items ili
    LEFT JOIN public.products p ON ili.product_id = p.id
    WHERE ili.invoice_id = p_invoice_id
    GROUP BY COALESCE(p.category, 'uncategorized')
  ) LOOP
    IF v_cat_record.total_amount > 0 THEN
      -- Attempt to find a matching GL code
      INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, gl_code, amount)
      SELECT 
        v_org_id, p_invoice_id, 'line_items', v_cat_record.cat_name, 
        (SELECT gl_code FROM public.gl_mappings WHERE organization_id = v_org_id AND LOWER(category) = LOWER(v_cat_record.cat_name) LIMIT 1),
        v_cat_record.total_amount;
    END IF;
  END LOOP;

  -- 2. Add Tax
  IF v_tax > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'tax', 'Tax', v_tax);
  END IF;

  -- 3. Add Delivery
  IF v_delivery > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'delivery', 'Delivery Fee', v_delivery);
  END IF;

  -- 4. Add Fuel
  IF v_fuel > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'fuel', 'Fuel Surcharge', v_fuel);
  END IF;

  -- 5. Add Other
  IF v_other > 0 THEN
    INSERT INTO public.invoice_allocations (organization_id, invoice_id, allocation_type, category_name, amount)
    VALUES (v_org_id, p_invoice_id, 'other', 'Other Charges', v_other);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Allocations calculated');
END;
$$;

COMMIT;
