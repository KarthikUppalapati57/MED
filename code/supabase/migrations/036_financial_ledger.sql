-- Migration 036: Financial Ledger System (Phase 2)
-- Implements double-entry accounting foundation.

-- 1. Ledger Bills Table (Aligns with existing invoices system)
CREATE TABLE IF NOT EXISTS public.ledger_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    subtotal NUMERIC(12,2) DEFAULT 0,
    tax NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2) DEFAULT 0,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'voided')),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ledger Payments Table
CREATE TABLE IF NOT EXISTS public.ledger_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.ledger_bills(id) ON DELETE CASCADE,
    payment_account_id UUID,
    payment_method TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_date TIMESTAMPTZ,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ledger Entries Table (Double-Entry Core)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    debit NUMERIC(12,2) DEFAULT 0,
    credit NUMERIC(12,2) DEFAULT 0,
    reference_type TEXT CHECK (reference_type IN ('invoice', 'bill', 'payment', 'adjustment')),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.ledger_bills;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.ledger_bills 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS Policies
ALTER TABLE public.ledger_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Ledger Bills
CREATE POLICY "Users can view ledger_bills" ON public.ledger_bills FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);
CREATE POLICY "Manager+ can manage ledger_bills" ON public.ledger_bills FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Payments
CREATE POLICY "Users can view ledger_payments" ON public.ledger_payments FOR SELECT USING (organization_id = public.get_my_org() AND deleted_at IS NULL);
CREATE POLICY "Manager+ can manage ledger_payments" ON public.ledger_payments FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Ledger Entries (Immutable Audit)
CREATE POLICY "Users can view ledger_entries" ON public.ledger_entries FOR SELECT USING (organization_id = public.get_my_org());
CREATE POLICY "System can insert ledger_entries" ON public.ledger_entries FOR INSERT WITH CHECK (organization_id = public.get_my_org());
-- No UPDATE or DELETE on ledger_entries to preserve accounting integrity.

-- 6. Indexes
CREATE INDEX idx_ledger_bills_org ON public.ledger_bills(organization_id);
CREATE INDEX idx_ledger_payments_org ON public.ledger_payments(organization_id);
CREATE INDEX idx_ledger_entries_org ON public.ledger_entries(organization_id);
CREATE INDEX idx_ledger_entries_account ON public.ledger_entries(account_code);
