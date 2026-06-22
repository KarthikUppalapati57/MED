-- code/supabase/migrations/143_custom_reports.sql

CREATE TABLE IF NOT EXISTS public.custom_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    query_config JSONB NOT NULL DEFAULT '{}', -- stores selected metrics, date ranges, filters
    schedule_cron TEXT, -- optional cron expression for emailing
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom reports for their org" ON public.custom_reports
    FOR ALL USING (organization_id = public.get_auth_org());

-- Trigger for updated_at
CREATE TRIGGER on_custom_reports_updated
    BEFORE UPDATE ON public.custom_reports
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
