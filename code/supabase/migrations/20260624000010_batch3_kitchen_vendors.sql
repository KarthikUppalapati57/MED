-- 1. Optimize Commissary Route Generation
-- This missing index caused severe UI freezes when querying routes for an organization with multiple depots.
CREATE INDEX IF NOT EXISTS idx_commissary_route_stops_route_id 
ON public.commissary_route_stops(route_id);
