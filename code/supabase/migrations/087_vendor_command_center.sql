-- 087: Vendor Command Center & Health Scores
-- Adds fields to support Phase 2 & 3 of Vendor Command Center

BEGIN;

-- 1. Add fields to vendors table for Accounting Controls and Health Scores
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS health_score NUMERIC(5,2) DEFAULT 100.00;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS default_expense_category TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS default_payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS file_routing_preference TEXT DEFAULT 'storage' CHECK (file_routing_preference IN ('storage', 'payments', 'accounting'));
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS unpaid_ap NUMERIC(12,2) DEFAULT 0;

-- 2. Add Order Guide fields to vendor_items
ALTER TABLE public.vendor_items ADD COLUMN IF NOT EXISTS on_order_guide BOOLEAN DEFAULT false;
ALTER TABLE public.vendor_items ADD COLUMN IF NOT EXISTS preferred_quantity NUMERIC(10,2) DEFAULT 1;
ALTER TABLE public.vendor_items ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE public.vendor_items ADD COLUMN IF NOT EXISTS last_price NUMERIC(10,2);
ALTER TABLE public.vendor_items ADD COLUMN IF NOT EXISTS price_variance_flag BOOLEAN DEFAULT false;

-- 3. Create a Vendor Issues log for the Communication Hub
CREATE TABLE IF NOT EXISTS public.vendor_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('late_delivery', 'missing_item', 'price_mismatch', 'invoice_dispute', 'other')),
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  reported_by UUID REFERENCES auth.users(id),
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vendor_issues ENABLE ROW LEVEL SECURITY;

-- 4. RLS for vendor_issues
DROP POLICY IF EXISTS "Vendor issues read" ON public.vendor_issues;
CREATE POLICY "Vendor issues read" ON public.vendor_issues FOR SELECT USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Vendor issues write" ON public.vendor_issues;
CREATE POLICY "Vendor issues write" ON public.vendor_issues FOR ALL USING (
  public.is_platform_admin() OR organization_id = public.get_my_org() OR organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

-- 5. Trigger to auto-update vendor total spent when an invoice is paid or approved
CREATE OR REPLACE FUNCTION public.update_vendor_metrics_on_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.vendors 
    SET total_spent = total_spent + NEW.total_amount,
        unpaid_ap = unpaid_ap + NEW.total_amount
    WHERE id = NEW.vendor_id;
  END IF;

  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
    UPDATE public.vendors 
    SET unpaid_ap = GREATEST(unpaid_ap - NEW.total_amount, 0)
    WHERE id = NEW.vendor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_vendor_metrics ON public.invoices;
CREATE TRIGGER trg_update_vendor_metrics
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_vendor_metrics_on_invoice();

COMMIT;
