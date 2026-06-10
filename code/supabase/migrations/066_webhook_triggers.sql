-- Migration: 066_webhook_triggers
-- Description: Triggers for queuing webhooks and invoking the dispatcher

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.queue_webhook_event()
RETURNS TRIGGER AS $$
DECLARE
    v_event_type TEXT;
    v_org_id UUID;
    v_payload JSONB;
BEGIN
    v_event_type := TG_TABLE_NAME || '.' || lower(TG_OP); -- e.g., 'orders.insert'
    
    IF TG_OP = 'DELETE' THEN
        v_payload := row_to_json(OLD)::jsonb;
    ELSE
        v_payload := row_to_json(NEW)::jsonb;
    END IF;

    -- Try to get organization_id from the record
    BEGIN
        v_org_id := (v_payload->>'organization_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN COALESCE(NEW, OLD); -- Skip if no organization_id
    END;

    IF v_org_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Find endpoints subscribed to this event or '*'
    INSERT INTO public.webhook_events_queue (organization_id, endpoint_id, event_type, payload)
    SELECT we.organization_id, we.id, v_event_type, v_payload
    FROM public.webhook_endpoints we
    JOIN public.webhook_subscriptions ws ON we.id = ws.endpoint_id
    WHERE we.organization_id = v_org_id
      AND we.status = 'active'
      AND (ws.event_type = v_event_type OR ws.event_type = '*');

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to some core tables
CREATE TRIGGER webhook_profiles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_webhook_event();

CREATE TRIGGER webhook_employees_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.queue_webhook_event();

CREATE TRIGGER webhook_inventory_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.queue_webhook_event();

-- NOTE: To enable automatic dispatching via pg_net or pg_cron, you should create a trigger 
-- on webhook_events_queue or a cron job that calls your edge function.
-- Example:
-- CREATE TRIGGER invoke_dispatcher
-- AFTER INSERT ON public.webhook_events_queue
-- FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_dispatcher();
