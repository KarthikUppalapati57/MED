-- code/supabase/migrations/145_iot_sensors.sql

CREATE TABLE IF NOT EXISTS public.iot_sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    mac_address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sensor_type TEXT NOT NULL DEFAULT 'temperature', -- temperature, humidity, etc
    status TEXT NOT NULL DEFAULT 'online', -- online, offline, maintenance
    last_ping_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.temperature_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id UUID NOT NULL REFERENCES public.iot_sensors(id) ON DELETE CASCADE,
    temperature_f DECIMAL(5,2) NOT NULL,
    humidity_percent DECIMAL(5,2),
    is_alert BOOLEAN DEFAULT false,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.iot_sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temperature_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage IoT sensors" ON public.iot_sensors
    FOR ALL USING (organization_id IN (SELECT auth.get_user_orgs()));

CREATE POLICY "Users can view temperature logs" ON public.temperature_logs
    FOR ALL USING (sensor_id IN (SELECT id FROM public.iot_sensors WHERE organization_id IN (SELECT auth.get_user_orgs())));

-- Trigger for updated_at
CREATE TRIGGER on_iot_sensors_updated
    BEFORE UPDATE ON public.iot_sensors
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
