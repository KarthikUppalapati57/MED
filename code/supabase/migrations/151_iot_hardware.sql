BEGIN;

-- Temperature Logs
CREATE TABLE IF NOT EXISTS public.temperature_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    sensor_id TEXT NOT NULL,
    sensor_name TEXT,
    temperature NUMERIC(5, 2) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'F' CHECK (unit IN ('F', 'C')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_alert BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read temp logs" ON public.temperature_logs FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify temp logs" ON public.temperature_logs FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;
