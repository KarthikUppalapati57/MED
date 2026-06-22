BEGIN;

-- Procurement Bids
CREATE TABLE IF NOT EXISTS public.procurement_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    global_item_id UUID,
    requested_quantity NUMERIC(10, 2) NOT NULL,
    bid_price NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commissary Routes
CREATE TABLE IF NOT EXISTS public.commissary_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    origin_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    driver_name TEXT,
    vehicle_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    departure_time TIMESTAMPTZ,
    estimated_arrival_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Route Stops
CREATE TABLE IF NOT EXISTS public.commissary_route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.commissary_routes(id) ON DELETE CASCADE,
    destination_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    stop_sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'arrived', 'delivered', 'skipped')),
    actual_arrival_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(route_id, stop_sequence)
);

-- RLS Policies
ALTER TABLE public.procurement_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissary_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissary_route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can read bids" ON public.procurement_bids FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify bids" ON public.procurement_bids FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read routes" ON public.commissary_routes FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org users can modify routes" ON public.commissary_routes FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org users can read route stops" ON public.commissary_route_stops FOR SELECT USING (route_id IN (SELECT id FROM public.commissary_routes WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY "Org users can modify route stops" ON public.commissary_route_stops FOR ALL USING (route_id IN (SELECT id FROM public.commissary_routes WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())));

COMMIT;
