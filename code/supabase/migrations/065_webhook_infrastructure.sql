-- Migration: 065_webhook_infrastructure
-- Description: Core schema for webhook endpoints, API keys, and delivery logs

CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(endpoint_id, event_type)
);

CREATE TABLE IF NOT EXISTS public.webhook_events_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.webhook_events_queue(id) ON DELETE SET NULL,
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    response_code INT,
    response_body TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Policies for api_keys
CREATE POLICY "Users can view api keys" ON public.api_keys 
    FOR SELECT USING (organization_id = public.get_my_org());
CREATE POLICY "Managers can manage api keys" ON public.api_keys 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_endpoints
CREATE POLICY "Users can view webhook endpoints" ON public.webhook_endpoints 
    FOR SELECT USING (organization_id = public.get_my_org());
CREATE POLICY "Managers can manage webhook endpoints" ON public.webhook_endpoints 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_subscriptions
CREATE POLICY "Users can view webhook subscriptions" ON public.webhook_subscriptions 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));
CREATE POLICY "Managers can manage webhook subscriptions" ON public.webhook_subscriptions 
    FOR ALL USING (is_manager_or_above() AND EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));

-- Policies for webhook_events_queue
CREATE POLICY "Users can view webhook events" ON public.webhook_events_queue 
    FOR SELECT USING (organization_id = public.get_my_org());
CREATE POLICY "Managers can manage webhook events" ON public.webhook_events_queue 
    FOR ALL USING (is_manager_or_above() AND organization_id = public.get_my_org());

-- Policies for webhook_delivery_logs
CREATE POLICY "Users can view webhook delivery logs" ON public.webhook_delivery_logs 
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.webhook_endpoints WHERE id = endpoint_id AND organization_id = public.get_my_org()));
