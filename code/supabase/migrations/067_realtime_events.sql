-- Migration: 067_realtime_events
-- Description: Implement platform-wide event logging and real-time broadcasting infrastructure

CREATE TABLE IF NOT EXISTS public.event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- Read policies for UI real-time subscription
CREATE POLICY "Users can view their organization events" ON public.event_logs
    FOR SELECT USING (organization_id = public.get_my_org());

CREATE POLICY "Platform admins can view all events" ON public.event_logs
    FOR SELECT USING (public.is_platform_admin());

-- Add the table to the supabase_realtime publication to enable WebSocket broadcasting
ALTER PUBLICATION supabase_realtime ADD TABLE event_logs;

-- Function to emit a domain event from backend/database triggers
CREATE OR REPLACE FUNCTION public.emit_domain_event(
    p_event_name TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_org_id UUID,
    p_payload JSONB
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure RPC for the frontend to emit an event (only within their own organization)
CREATE OR REPLACE FUNCTION public.log_frontend_event(
    p_event_name TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_payload JSONB
) RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
BEGIN
    -- Check if authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_org_id := public.get_my_org();
    v_role := public.get_my_role();

    IF v_org_id IS NULL AND v_role != 'platform_admin' THEN
        RAISE EXCEPTION 'Cannot emit event without organization context';
    END IF;

    RETURN public.emit_domain_event(p_event_name, p_entity_type, p_entity_id, v_org_id, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Special RPC for logging an invitation open (unauthenticated users clicking signup link)
CREATE OR REPLACE FUNCTION public.log_invitation_opened(p_token TEXT)
RETURNS VOID AS $$
DECLARE
    v_invite RECORD;
BEGIN
    SELECT * INTO v_invite FROM public.invitations WHERE token = p_token;
    
    IF FOUND THEN
        -- Only log if it hasn't been accepted or expired
        IF v_invite.accepted_at IS NULL AND v_invite.expires_at > now() THEN
            -- Update the invitation status if we want to track it directly
            -- but for this architecture, we emit the domain event:
            PERFORM public.emit_domain_event(
                'user.invitation.opened',
                'invitation',
                v_invite.id,
                v_invite.organization_id, -- Note: could be NULL for platform invites
                jsonb_build_object('email', v_invite.email, 'role', v_invite.role)
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing trigger function to emit domain events (which will handle BOTH event_logs AND webhook_events_queue)
CREATE OR REPLACE FUNCTION public.queue_webhook_event()
RETURNS TRIGGER AS $$
DECLARE
    v_event_type TEXT;
    v_org_id UUID;
    v_payload JSONB;
BEGIN
    v_event_type := TG_TABLE_NAME || '.' || lower(TG_OP);
    
    IF TG_OP = 'DELETE' THEN
        v_payload := row_to_json(OLD)::jsonb;
    ELSE
        v_payload := row_to_json(NEW)::jsonb;
    END IF;

    BEGIN
        v_org_id := (v_payload->>'organization_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN COALESCE(NEW, OLD);
    END;

    IF v_org_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Emitting the domain event will log it to event_logs AND queue the webhook
    PERFORM public.emit_domain_event(
        v_event_type,
        TG_TABLE_NAME,
        (v_payload->>'id')::UUID,
        v_org_id,
        v_payload
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
