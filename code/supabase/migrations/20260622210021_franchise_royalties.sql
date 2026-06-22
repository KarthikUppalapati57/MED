BEGIN;

-- Franchise Agreements
CREATE TABLE IF NOT EXISTS public.franchise_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    franchisee_name TEXT NOT NULL,
    royalty_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    marketing_fee_percentage NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add organization_id if it doesn't exist (table may have been created in an earlier migration without it)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'franchise_agreements' AND column_name = 'organization_id') THEN
        ALTER TABLE public.franchise_agreements ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Franchise Invoices (Royalties billed to the franchisee)
CREATE TABLE IF NOT EXISTS public.franchise_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id UUID NOT NULL REFERENCES public.franchise_agreements(id) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    gross_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
    royalty_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    marketing_fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'overdue')),
    due_date DATE NOT NULL,
    stripe_invoice_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.franchise_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can manage franchise agreements" ON public.franchise_agreements;
CREATE POLICY "Org admins can manage franchise agreements" ON public.franchise_agreements FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner'));

DROP POLICY IF EXISTS "Org admins can view franchise invoices" ON public.franchise_invoices;
CREATE POLICY "Org admins can view franchise invoices" ON public.franchise_invoices FOR SELECT USING (agreement_id IN (SELECT id FROM public.franchise_agreements WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

COMMIT;
