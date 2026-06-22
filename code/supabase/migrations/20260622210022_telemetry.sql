BEGIN;

CREATE TABLE IF NOT EXISTS public.web_vitals_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC(10, 2) NOT NULL,
    metric_rating TEXT NOT NULL CHECK (metric_rating IN ('good', 'needs-improvement', 'poor')),
    navigation_type TEXT,
    page_url TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.web_vitals_telemetry ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert telemetry (insert only, no read/update/delete)
CREATE POLICY "Users can insert telemetry" ON public.web_vitals_telemetry FOR INSERT WITH CHECK (true);

-- Platform admins can read all telemetry
CREATE POLICY "Platform admins can read telemetry" ON public.web_vitals_telemetry FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin');

COMMIT;
