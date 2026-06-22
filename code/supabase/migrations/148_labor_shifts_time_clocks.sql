BEGIN;

-- Time Clocks Table
CREATE TABLE IF NOT EXISTS public.time_clocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    employee_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    clock_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    clock_out_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'clocked_in' CHECK (status IN ('clocked_in', 'clocked_out', 'break')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shift Schedules Table
CREATE TABLE IF NOT EXISTS public.shift_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    employee_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    role TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Labor Forecasts Table
CREATE TABLE IF NOT EXISTS public.labor_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    forecast_date DATE NOT NULL,
    predicted_sales NUMERIC(10, 2) NOT NULL DEFAULT 0,
    recommended_labor_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
    actual_labor_hours NUMERIC(10, 2),
    variance NUMERIC(10, 2),
    ai_confidence INTEGER CHECK (ai_confidence BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.time_clocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read time clocks" ON public.time_clocks FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can insert time clocks" ON public.time_clocks FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can update time clocks" ON public.time_clocks FOR UPDATE USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read shift schedules" ON public.shift_schedules FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org managers can insert shift schedules" ON public.shift_schedules FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'location_manager'));
CREATE POLICY "Org managers can update shift schedules" ON public.shift_schedules FOR UPDATE USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('org_owner', 'location_manager'));

CREATE POLICY "Org users can read labor forecasts" ON public.labor_forecasts FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify labor forecasts" ON public.labor_forecasts FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;
