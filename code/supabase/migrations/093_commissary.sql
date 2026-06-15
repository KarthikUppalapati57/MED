-- 093: Add Commissary Kitchens and Inter-Company Transfers

BEGIN;

-- Add is_commissary flag to locations
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS is_commissary BOOLEAN DEFAULT false;

-- Create intercompany transfers table
CREATE TABLE IF NOT EXISTS public.intercompany_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    from_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    to_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    markup_percentage DECIMAL(5,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers in their org"
    ON public.intercompany_transfers FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert transfers in their org"
    ON public.intercompany_transfers FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Admins and managers can update transfers"
    ON public.intercompany_transfers FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE user_id = auth.uid() AND organization_id = intercompany_transfers.organization_id AND role IN ('owner', 'admin', 'manager')
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_intercompany_transfers_modtime
    BEFORE UPDATE ON public.intercompany_transfers
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

COMMIT;
