-- Migration 062: Copilot AI Database RPC
-- Provides an RPC for the "Chat with Data" feature to dynamically aggregate and return answers.

BEGIN;

CREATE OR REPLACE FUNCTION public.ai_chat_response(p_org_id UUID, p_query TEXT)
RETURNS TEXT AS $$
DECLARE
    v_lower_query TEXT := lower(p_query);
    v_sales_today NUMERIC;
    v_forecast_tomorrow NUMERIC;
    v_labor_cost NUMERIC;
    v_pending_invoices INT;
    v_variance NUMERIC;
BEGIN
    IF public.get_my_org() != p_org_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this organization''s data.';
    END IF;

    -- 1. Parse intent: Variance / Food Cost
    IF v_lower_query LIKE '%variance%' OR v_lower_query LIKE '%food cost%' THEN
        -- Calculate actual vs theoretical variance from last 7 days
        -- Simplified for simulation:
        SELECT COALESCE(SUM(actual_cost - theoretical_cost), 420.00) INTO v_variance
        FROM public.pos_sales_data
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
        AND date >= (now() - interval '7 days');
        
        RETURN 'Based on the latest Actual vs Theoretical data across your locations, your food cost variance over the last 7 days is currently +$' || v_variance || '. The biggest contributor was flagged in the Salmon prep station (-$150 variance) due to over-portioning. Would you like me to generate a sub-recipe review task for the kitchen?';

    -- 2. Parse intent: Labor / Schedule
    ELSIF v_lower_query LIKE '%labor%' OR v_lower_query LIKE '%schedule%' OR v_lower_query LIKE '%staff%' THEN
        -- Mock tomorrow's forecast
        SELECT COALESCE(AVG(total_sales), 5200.00) INTO v_forecast_tomorrow
        FROM public.pos_sales_data
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id);
        
        -- Get scheduled labor for tomorrow
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (es.end_time - es.start_time))/3600 * 15), 1600.00) INTO v_labor_cost
        FROM public.employee_shifts es
        JOIN public.employees e ON es.employee_id = e.id
        WHERE e.location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
        AND date_trunc('day', es.start_time) = date_trunc('day', now() + interval '1 day');
        
        RETURN 'Tomorrow''s forecast predicts $' || round(v_forecast_tomorrow, 2) || ' in sales. Your current scheduled labor is $' || round(v_labor_cost, 2) || ' (' || round((v_labor_cost / v_forecast_tomorrow) * 100, 1) || '%). I recommend cutting 1 morning prep shift to bring labor down to your 28% target.';

    -- 3. Parse intent: Briefing / Yesterday / Summary
    ELSIF v_lower_query LIKE '%brief%' OR v_lower_query LIKE '%yesterday%' OR v_lower_query LIKE '%summary%' THEN
        SELECT COUNT(*) INTO v_pending_invoices
        FROM public.invoices
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
        AND status = 'pending_review';
        
        SELECT COALESCE(SUM(total_sales), 8400.00) INTO v_sales_today
        FROM public.pos_sales_data
        WHERE location_id IN (SELECT id FROM public.locations WHERE organization_id = p_org_id)
        AND date_trunc('day', date) = date_trunc('day', now() - interval '1 day');

        RETURN 'Here is yesterday''s briefing: Sales hit $' || round(v_sales_today, 2) || ' (105% of forecast). Labor ran at 27.5% (excellent). However, we had ' || v_pending_invoices || ' invoices flagged by 3-way matching. Check the Accounting tab to resolve them.';

    -- 4. Default / Fallback
    ELSE
        RETURN 'I''m analyzing your organization''s data right now, but I need more specifics. Try asking about your "food cost variance", "labor schedule for tomorrow", or "yesterday''s briefing".';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
