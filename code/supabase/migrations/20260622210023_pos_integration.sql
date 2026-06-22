BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('toast', 'square', 'aloha', 'clover')),
    api_key TEXT,
    webhook_secret TEXT,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, provider)
);

ALTER TABLE public.pos_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can manage pos_configurations" ON public.pos_configurations
    FOR ALL
    USING (organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role IN ('org_owner', 'admin', 'manager')
    ));

-- Create trigger for updated_at
CREATE TRIGGER update_pos_configurations_updated_at
    BEFORE UPDATE ON public.pos_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

COMMIT;
