-- code/supabase/migrations/144_commissary_orders.sql

CREATE TABLE IF NOT EXISTS public.intercompany_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    from_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    to_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    items_json JSONB NOT NULL DEFAULT '[]',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, fulfilled, cancelled
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage intercompany transfers" ON public.intercompany_transfers
    FOR ALL USING (organization_id = public.get_auth_org());

-- Trigger for updated_at
CREATE TRIGGER on_intercompany_transfers_updated
    BEFORE UPDATE ON public.intercompany_transfers
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
