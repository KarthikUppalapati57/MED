-- code/supabase/migrations/147_delivery_aggregation.sql

CREATE TABLE IF NOT EXISTS public.delivery_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- ubereats, doordash, grubhub
    store_id TEXT NOT NULL, -- 3rd party store ID
    api_key TEXT,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(location_id, provider)
);

CREATE TABLE IF NOT EXISTS public.menu_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES public.delivery_channels(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- update_price, 86_item, 68_item
    status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage delivery channels" ON public.delivery_channels
    FOR ALL USING (organization_id = public.get_auth_org());

CREATE POLICY "Users can view menu sync logs" ON public.menu_sync_logs
    FOR ALL USING (channel_id IN (SELECT id FROM public.delivery_channels WHERE organization_id = public.get_auth_org()));

-- Trigger for updated_at
CREATE TRIGGER on_delivery_channels_updated
    BEFORE UPDATE ON public.delivery_channels
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
