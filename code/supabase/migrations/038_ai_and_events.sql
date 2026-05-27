-- Migration 038: AI and Event Architecture (Phase 2)
-- Infrastructure for async pipelines and persistent AI storage.

-- 1. AI Insights Table
CREATE TABLE IF NOT EXISTS public.ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Domain Events Table (Event Sourcing)
CREATE TABLE IF NOT EXISTS public.domain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Processing Jobs (Worker queues and observability)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    payload JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Users can view ai_insights" ON public.ai_insights FOR SELECT USING (organization_id = public.get_my_org());
CREATE POLICY "System can insert ai_insights" ON public.ai_insights FOR INSERT WITH CHECK (organization_id = public.get_my_org());
CREATE POLICY "Manager+ can resolve ai_insights" ON public.ai_insights FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

CREATE POLICY "System can manage domain_events" ON public.domain_events FOR ALL USING (organization_id = public.get_my_org());
CREATE POLICY "System can manage processing_jobs" ON public.processing_jobs FOR ALL USING (organization_id = public.get_my_org());

-- 6. Indexes
CREATE INDEX idx_ai_insights_org ON public.ai_insights(organization_id);
CREATE INDEX idx_domain_events_org ON public.domain_events(organization_id);
CREATE INDEX idx_processing_jobs_org ON public.processing_jobs(organization_id);
