-- Migration 057: AvT Variance RPC
-- Creates a function to aggregate inventory movements into an Actual vs Theoretical variance report

BEGIN;

CREATE OR REPLACE FUNCTION public.get_avt_variance_report(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    id UUID,
    ingredient TEXT,
    theoretical NUMERIC,
    actual NUMERIC,
    unit TEXT,
    "costPerUnit" NUMERIC,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.product_name AS ingredient,
        COALESCE(SUM(CASE WHEN im.movement_type = 'recipe_consumption' THEN ABS(im.quantity) ELSE 0 END), 0) AS theoretical,
        COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'wastage', 'spoilage', 'stock_count') AND im.quantity < 0 THEN ABS(im.quantity) WHEN im.movement_type = 'manual_adjustment' AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0) AS actual,
        i.current_unit AS unit,
        COALESCE(i.unit_cost, 0) AS "costPerUnit",
        CASE 
            WHEN COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'wastage', 'spoilage', 'stock_count') AND im.quantity < 0 THEN ABS(im.quantity) WHEN im.movement_type = 'manual_adjustment' AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0) > 
                 COALESCE(SUM(CASE WHEN im.movement_type = 'recipe_consumption' THEN ABS(im.quantity) ELSE 0 END), 0) * 1.10 THEN 'critical'
            WHEN COALESCE(SUM(CASE WHEN im.movement_type IN ('recipe_consumption', 'wastage', 'spoilage', 'stock_count') AND im.quantity < 0 THEN ABS(im.quantity) WHEN im.movement_type = 'manual_adjustment' AND im.quantity < 0 THEN ABS(im.quantity) ELSE 0 END), 0) > 
                 COALESCE(SUM(CASE WHEN im.movement_type = 'recipe_consumption' THEN ABS(im.quantity) ELSE 0 END), 0) * 1.05 THEN 'warning'
            ELSE 'good'
        END AS status
    FROM public.inventory i
    JOIN public.inventory_movements im 
        ON im.inventory_id = i.id 
        AND im.organization_id = i.organization_id
        AND DATE(im.created_at) >= p_start_date 
        AND DATE(im.created_at) <= p_end_date
    WHERE i.organization_id = public.get_auth_org()
    GROUP BY i.id, i.product_name, i.current_unit, i.unit_cost
    HAVING COALESCE(SUM(CASE WHEN im.movement_type = 'recipe_consumption' THEN ABS(im.quantity) ELSE 0 END), 0) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
