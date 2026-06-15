-- 091: Add Period Budgets

BEGIN;

CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    gl_category TEXT NOT NULL,
    budget_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(organization_id, location_id, gl_category)
);

-- RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view budgets in their org"
    ON public.budgets FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Admins can manage budgets"
    ON public.budgets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE user_id = auth.uid() AND organization_id = budgets.organization_id AND role IN ('owner', 'admin', 'manager')
        )
    );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_budgets_modtime
    BEFORE UPDATE ON public.budgets
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

COMMIT;
