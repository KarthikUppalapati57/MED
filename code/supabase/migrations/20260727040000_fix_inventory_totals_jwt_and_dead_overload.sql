-- 20260727040000: Two cleanup items from the final pass of the SECURITY DEFINER audit.
--
-- 1. get_inventory_totals checked p_org_id against auth.jwt() ->> 'organization_id' -- the exact
--    JWT/app_metadata read pattern this codebase's Phase 1/2a work already replaced everywhere
--    else, specifically because JWT claims can drift from profiles (the two-source-of-truth
--    bug). Switched to the same get_auth_org() comparison every other guarded function in this
--    codebase uses. No other logic changed.
--
-- 2. can_access_dashboard_scope exists as two overloaded functions with different parameter
--    order: (p_org_id, p_scope, p_brand_id, p_location_id) and (p_org_id, p_brand_id,
--    p_location_id, p_scope). Checked every live RLS policy that calls it (19 policies across 6
--    dashboard_* tables) -- all of them call it positionally as (organization_id, brand_id,
--    location_id, scope), which only matches the second overload's types. The first overload is
--    unreachable dead code (also confirmed zero references anywhere in src/). Dropping it so
--    there's only one definition to read, edit, and reason about.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_inventory_totals(p_org_id uuid, p_search_term text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload JSONB;
BEGIN
  -- Strict multi-tenant enforcement
  IF NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
    RAISE EXCEPTION 'Access Denied: Tenant Context Violations Precluded Processing.';
  END IF;

  WITH filtered_inventory AS (
    SELECT *
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND (p_search_term IS NULL OR p_search_term = '' OR product_name ILIKE '%' || p_search_term || '%')
  ),
  filtered_wastage AS (
    SELECT value
    FROM public.wastage_logs
    WHERE organization_id = p_org_id
      AND (p_location_id IS NULL OR location_id = p_location_id)
      AND created_at >= date_trunc('month', now())
  )
  SELECT jsonb_build_object(
    'totalItems', count(*),
    'totalValue', coalesce(sum(current_quantity * unit_cost), 0),
    'lowStock', count(*) FILTER (WHERE current_quantity <= coalesce(reorder_point, 5)),
    'totalWastageValue', coalesce((SELECT sum(value) FROM filtered_wastage), 0)
  )
  INTO v_payload
  FROM filtered_inventory;

  RETURN v_payload;
END;
$function$;

DROP FUNCTION IF EXISTS public.can_access_dashboard_scope(uuid, text, uuid, uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';
