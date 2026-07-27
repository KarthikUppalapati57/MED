-- 20260727030000: Final batch of the same class of gap from 20260727010000/20260727020000.
-- emit_domain_event had no check at all and is authenticated-callable -- any logged-in user
-- could inject a fake domain event tagged with another organization's id, which the realtime
-- dispatch (useRealtimeEvents.js listens on event_logs inserts) and the webhook queue both
-- trust as real, letting a caller spoof events/webhooks into a victim org's stream.
-- generate_daily_theoretical_usage had no check and EXECUTE granted to anon -- a completely
-- unauthenticated caller could pull recipe ingredient usage and cost data for any organization.

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_domain_event(p_event_name text, p_entity_type text, p_entity_id uuid, p_org_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event_id UUID;
BEGIN
    IF p_org_id IS NOT NULL AND NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
        RAISE EXCEPTION 'Cannot emit domain events for another organization';
    END IF;

    INSERT INTO public.event_logs (event_name, entity_type, entity_id, organization_id, payload)
    VALUES (p_event_name, p_entity_type, p_entity_id, p_org_id, p_payload)
    RETURNING id INTO v_event_id;

    -- Automatically queue a webhook if there are active subscriptions
    -- This unifies Real-Time UI events and Webhooks!
    IF p_org_id IS NOT NULL THEN
        INSERT INTO public.webhook_events_queue (organization_id, endpoint_id, event_type, payload)
        SELECT we.organization_id, we.id, p_event_name, p_payload
        FROM public.webhook_endpoints we
        JOIN public.webhook_subscriptions ws ON we.id = ws.endpoint_id
        WHERE we.organization_id = p_org_id
          AND we.status = 'active'
          AND (ws.event_type = p_event_name OR ws.event_type = '*');
    END IF;

    RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_daily_theoretical_usage(p_org_id uuid, p_date date)
 RETURNS TABLE(ingredient_id uuid, ingredient_name text, unit text, theoretical_usage numeric, cost_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_platform_admin() AND p_org_id != public.get_auth_org() THEN
    RAISE EXCEPTION 'Access Denied: Tenant context violation.';
  END IF;

  RETURN QUERY
  WITH daily_sales AS (
    SELECT psd.pos_item_id, SUM(psd.quantity_sold) AS total_sold
    FROM public.pos_sales_data psd
    WHERE psd.organization_id = p_org_id
      AND psd.date = p_date
    GROUP BY psd.pos_item_id
  ),
  mapped_recipes AS (
    SELECT ds.pos_item_id, ds.total_sold, pmm.recipe_id
    FROM daily_sales ds
    JOIN public.pos_menu_mapping pmm
      ON pmm.pos_item_id = ds.pos_item_id
     AND pmm.organization_id = p_org_id
  ),
  recipe_ingredients_exploded AS (
    SELECT
      ri.product_id AS ingredient_id,
      (ri.quantity * mr.total_sold) AS ingredient_usage,
      p.name AS ingredient_name,
      COALESCE(ri.unit, p.base_unit, 'ea') AS unit,
      COALESCE(p.latest_price, p.average_price, 0) AS cost_per_unit
    FROM mapped_recipes mr
    JOIN public.recipe_ingredients ri ON ri.recipe_id = mr.recipe_id
    JOIN public.products p ON p.id = ri.product_id
  )
  SELECT
    rie.ingredient_id,
    rie.ingredient_name,
    rie.unit,
    SUM(rie.ingredient_usage) AS theoretical_usage,
    SUM(rie.ingredient_usage * rie.cost_per_unit) AS cost_value
  FROM recipe_ingredients_exploded rie
  GROUP BY rie.ingredient_id, rie.ingredient_name, rie.unit
  ORDER BY theoretical_usage DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_daily_theoretical_usage(uuid, date) FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
