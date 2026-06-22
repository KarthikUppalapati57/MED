-- code/supabase/migrations/146_franchise_royalties.sql

CREATE TABLE IF NOT EXISTS public.franchise_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    child_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    royalty_percentage DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    marketing_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(parent_org_id, child_org_id)
);

CREATE TABLE IF NOT EXISTS public.royalty_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES public.franchise_agreements(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_sales DECIMAL(10,2) NOT NULL,
    royalty_fee DECIMAL(10,2) NOT NULL,
    marketing_fee DECIMAL(10,2) NOT NULL,
    total_due DECIMAL(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment, drafted, paid
    stripe_invoice_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.franchise_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage franchise agreements" ON public.franchise_agreements
    FOR ALL USING (parent_org_id IN (SELECT auth.get_user_orgs()) OR child_org_id IN (SELECT auth.get_user_orgs()));

CREATE POLICY "Users can view royalty invoices" ON public.royalty_invoices
    FOR ALL USING (agreement_id IN (SELECT id FROM public.franchise_agreements WHERE parent_org_id IN (SELECT auth.get_user_orgs()) OR child_org_id IN (SELECT auth.get_user_orgs())));

-- Triggers for updated_at
CREATE TRIGGER on_franchise_agreements_updated
    BEFORE UPDATE ON public.franchise_agreements
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
    
CREATE TRIGGER on_royalty_invoices_updated
    BEFORE UPDATE ON public.royalty_invoices
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
