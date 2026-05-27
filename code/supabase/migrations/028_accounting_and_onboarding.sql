-- Migration 028: Accounting and Onboarding
-- Creates accounting_sync_logs, integrations, and onboarding_progress tables

-- 1. Onboarding Progress Table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    current_step TEXT DEFAULT 'signup',
    completed_steps TEXT[] DEFAULT '{}',
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Integrations Table
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero', 'netsuite', 'stripe', 'other')),
    access_token TEXT,
    refresh_token TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Accounting Sync Logs Table
CREATE TABLE IF NOT EXISTS public.accounting_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment', 'vendor', 'inventory')),
    entity_id UUID, -- Can be invoice_id, payment_id, etc.
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'success', 'failed')),
    error_message TEXT,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.onboarding_progress;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.onboarding_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.integrations;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable RLS
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_sync_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Onboarding Progress
DROP POLICY IF EXISTS "Users can view onboarding" ON public.onboarding_progress;
CREATE POLICY "Users can view onboarding" ON public.onboarding_progress 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Users can manage onboarding" ON public.onboarding_progress;
CREATE POLICY "Users can manage onboarding" ON public.onboarding_progress 
    FOR ALL USING (organization_id = public.get_auth_org());

-- Integrations
DROP POLICY IF EXISTS "Users can view integrations" ON public.integrations;
CREATE POLICY "Users can view integrations" ON public.integrations 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "Admin can manage integrations" ON public.integrations;
CREATE POLICY "Admin can manage integrations" ON public.integrations 
    FOR ALL USING (is_owner_or_admin() AND organization_id = public.get_auth_org());

-- Accounting Sync Logs
DROP POLICY IF EXISTS "Users can view sync logs" ON public.accounting_sync_logs;
CREATE POLICY "Users can view sync logs" ON public.accounting_sync_logs 
    FOR SELECT USING (organization_id = public.get_auth_org());

DROP POLICY IF EXISTS "System can insert sync logs" ON public.accounting_sync_logs;
CREATE POLICY "System can insert sync logs" ON public.accounting_sync_logs 
    FOR INSERT WITH CHECK (organization_id = public.get_auth_org());

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_org_id ON public.onboarding_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_id ON public.integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounting_logs_org_id ON public.accounting_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounting_logs_entity ON public.accounting_sync_logs(entity_type, entity_id);
