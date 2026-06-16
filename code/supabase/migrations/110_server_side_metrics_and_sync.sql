-- Migration 110: Server-Side Metrics and POS Sync (Phase 3 Thin Client Optimization)
-- NOTE: Do not wrap in BEGIN/COMMIT because CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- 1. Trigram Indexing for blazing-fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_inventory_product_name_trgm 
ON public.inventory USING GIN (product_name extensions.gin_trgm_ops);

-- 2. get_inventory_totals RPC
CREATE OR REPLACE FUNCTION public.get_inventory_totals(
  p_org_id UUID,
  p_search_term TEXT DEFAULT NULL,
  p_location_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Strict multi-tenant enforcement
  IF NOT public.is_platform_admin() AND p_org_id::text != (auth.jwt() ->> 'organization_id') THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. calculate_theoretical_depletion RPC
CREATE OR REPLACE FUNCTION public.calculate_theoretical_depletion(
  p_org_id UUID,
  p_sales_json JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() AND p_org_id::text != (auth.jwt() ->> 'organization_id') THEN
    RAISE EXCEPTION 'Access Denied: Tenant Context Violations Precluded Processing.';
  END IF;

  WITH sales AS (
    SELECT 
      (elem->>'name')::TEXT as sale_name,
      (elem->>'qty')::NUMERIC as sale_qty
    FROM jsonb_array_elements(p_sales_json) elem
  ),
  matched_recipes AS (
    SELECT 
      s.sale_qty,
      r.id as recipe_id,
      r.name as recipe_name
    FROM sales s
    JOIN public.recipes r ON lower(trim(r.name)) = lower(trim(s.sale_name))
    WHERE r.organization_id = p_org_id
  ),
  depletions AS (
    SELECT 
      ri.product_id,
      ri.name as product_name,
      sum(ri.quantity * mr.sale_qty) as total_used,
      max(ri.unit) as unit
    FROM matched_recipes mr
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mr.recipe_id
    WHERE ri.organization_id = p_org_id
    GROUP BY ri.product_id, ri.name
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', d.product_id,
      'product_name', d.product_name,
      'total_used', d.total_used,
      'unit', d.unit
    ) ORDER BY d.total_used DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM depletions d;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. execute_inventory_depletion RPC
CREATE OR REPLACE FUNCTION public.execute_inventory_depletion(
  p_org_id UUID,
  p_depletion_json JSONB
) RETURNS VOID AS $$
DECLARE
  v_elem JSONB;
  v_inv_id UUID;
  v_old_qty NUMERIC;
  v_new_qty NUMERIC;
BEGIN
  IF NOT public.is_platform_admin() AND p_org_id::text != (auth.jwt() ->> 'organization_id') THEN
    RAISE EXCEPTION 'Access Denied: Tenant Context Violations Precluded Processing.';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_depletion_json)
  LOOP
    SELECT id, current_quantity INTO v_inv_id, v_old_qty
    FROM public.inventory
    WHERE organization_id = p_org_id
      AND product_id = (v_elem->>'product_id')::TEXT
    LIMIT 1;

    IF v_inv_id IS NOT NULL THEN
      v_new_qty := greatest(0, coalesce(v_old_qty, 0) - (v_elem->>'total_used')::NUMERIC);

      UPDATE public.inventory
      SET current_quantity = v_new_qty, previous_quantity = v_old_qty
      WHERE id = v_inv_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
