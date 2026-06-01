-- Migration 049: Menu Engineering PMIX Data
-- Adds an RPC to aggregate POS sales and calculate profitability vs volume.

CREATE OR REPLACE FUNCTION public.get_menu_engineering_data(
    p_org_id UUID, 
    p_start_date DATE DEFAULT NULL, 
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    pos_item_id UUID,
    item_name TEXT,
    category TEXT,
    total_quantity_sold NUMERIC,
    total_revenue NUMERIC,
    total_theoretical_cost NUMERIC,
    total_profit NUMERIC
) AS $$
BEGIN
    -- Check permissions
    IF NOT (public.is_manager_or_above() AND p_org_id = public.get_my_org()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        pi.id AS pos_item_id,
        pi.item_name,
        COALESCE(r.category, 'uncategorized') AS category,
        COALESCE(SUM(ps.quantity_sold), 0) AS total_quantity_sold,
        COALESCE(SUM(ps.revenue), 0) AS total_revenue,
        COALESCE(SUM(ps.quantity_sold * COALESCE(r.cost_per_serving, 0)), 0) AS total_theoretical_cost,
        COALESCE(SUM(ps.revenue), 0) - COALESCE(SUM(ps.quantity_sold * COALESCE(r.cost_per_serving, 0)), 0) AS total_profit
    FROM public.pos_items pi
    LEFT JOIN public.pos_sales_data ps ON ps.pos_item_id = pi.id
        AND (p_start_date IS NULL OR ps.date >= p_start_date)
        AND (p_end_date IS NULL OR ps.date <= p_end_date)
    LEFT JOIN public.pos_menu_mapping pmm ON pmm.pos_item_id = pi.id
    LEFT JOIN public.recipes r ON r.id = pmm.recipe_id
    WHERE pi.organization_id = p_org_id
    GROUP BY pi.id, pi.item_name, r.category;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
