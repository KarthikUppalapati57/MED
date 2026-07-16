-- 9.9: route invoice audit events through the common log_audit_event path (in addition to
-- the existing invoice_audit_events insert, which stays for InvoiceAuditLog.jsx).
-- 9.10: dispatch audit_logs inserts through the existing webhook-trigger pattern
-- (queue_webhook_event -> webhook_events_queue -> notify_webhook_dispatcher pg_net call),
-- reusing 066_webhook_triggers.sql / 120_native_workflow_triggers.sql infrastructure as-is.

CREATE OR REPLACE FUNCTION public.log_invoice_audit_event(p_invoice_id uuid, p_action text, p_description text DEFAULT NULL::text, p_old_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.invoices WHERE id = p_invoice_id;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.invoice_audit_events (
      invoice_id, organization_id, user_id, action, description, old_value, new_value
    ) VALUES (
      p_invoice_id, v_org_id, auth.uid(), p_action, p_description, p_old_value, p_new_value
    );

    -- Best-effort mirror into the common audit_logs ledger. Must never block the invoice
    -- write itself: log_audit_event requires an authenticated/service-role actor context
    -- (assert_org_actor), which isn't present for direct-SQL/cron-driven invoice updates.
    BEGIN
      PERFORM public.log_audit_event(jsonb_build_object(
        'organization_id', v_org_id,
        'action', p_action,
        'table_name', 'invoices',
        'record_id', p_invoice_id::text,
        'entity_type', 'invoice',
        'entity_id', p_invoice_id::text,
        'old_data', p_old_value,
        'new_data', p_new_value,
        'details', p_description
      ));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$function$;

-- Fix a latent bug in queue_webhook_event() (066_webhook_triggers.sql): on a partitioned
-- table, a row-level trigger cloned onto a partition fires with TG_TABLE_NAME set to the
-- PARTITION's name (e.g. 'audit_logs_y2026'), not the parent's ('audit_logs'), so event_type
-- never matched an exact subscription. Never surfaced before because none of the previously
-- wired tables (profiles, employees, inventory) are partitioned; audit_logs is. Resolve via
-- the partition root, which is a no-op for non-partitioned tables (falls back to TG_RELID).
CREATE OR REPLACE FUNCTION public.queue_webhook_event()
RETURNS TRIGGER AS $$
DECLARE
    v_event_type TEXT;
    v_org_id UUID;
    v_payload JSONB;
    v_table_name TEXT;
BEGIN
    SELECT relname INTO v_table_name FROM pg_class WHERE oid = pg_partition_root(TG_RELID);
    v_event_type := COALESCE(v_table_name, TG_TABLE_NAME) || '.' || lower(TG_OP);

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

DROP TRIGGER IF EXISTS webhook_audit_logs_trigger ON public.audit_logs;
CREATE TRIGGER webhook_audit_logs_trigger
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.queue_webhook_event();
