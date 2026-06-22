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

-- Add organization_id column if it doesn't exist (table may have been created in an earlier migration without it)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temperature_logs' AND column_name = 'organization_id') THEN
        ALTER TABLE public.temperature_logs ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org users can read temp logs" ON public.temperature_logs;
CREATE POLICY "Org users can read temp logs" ON public.temperature_logs FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Org users can modify temp logs" ON public.temperature_logs;
CREATE POLICY "Org users can modify temp logs" ON public.temperature_logs FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;
