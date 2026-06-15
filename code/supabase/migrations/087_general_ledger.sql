-- Create general_ledger_entries table
CREATE TABLE IF NOT EXISTS public.general_ledger_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    date TIMESTAMPTZ DEFAULT now(),
    reference TEXT NOT NULL,
    description TEXT,
    debit_account TEXT NOT NULL,
    credit_account TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.general_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete general_ledger_entries for their organizations"
    ON public.general_ledger_entries FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
    );


