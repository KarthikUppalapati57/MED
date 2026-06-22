BEGIN;

-- Developer API Keys
CREATE TABLE IF NOT EXISTS public.developer_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    prefix TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook Endpoints
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage api keys" ON public.developer_api_keys FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'platform_admin'));

CREATE POLICY "Org admins can manage webhooks" ON public.webhook_endpoints FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'platform_admin'));

COMMIT;
