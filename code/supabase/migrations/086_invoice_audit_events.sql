-- 086: Invoice Audit Events
-- Tracking lifecycle changes of invoices for compliance and debugging.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- e.g., 'created', 'status_changed', 'line_item_added', 'amount_updated', 'payment_scheduled', 'exported'
  description TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.invoice_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View invoice audit events" ON public.invoice_audit_events FOR SELECT USING (
  organization_id = public.get_my_org() OR public.is_platform_admin()
);
CREATE POLICY "Insert invoice audit events" ON public.invoice_audit_events FOR INSERT WITH CHECK (
  organization_id = public.get_my_org() OR public.is_platform_admin()
);

-- Function to record audit event
CREATE OR REPLACE FUNCTION public.log_invoice_audit_event(
  p_invoice_id UUID,
  p_action TEXT,
  p_description TEXT DEFAULT NULL,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  END IF;
END;
$$;

-- Trigger to auto-log status changes
CREATE OR REPLACE FUNCTION public.trigger_invoice_status_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_invoice_audit_event(
      NEW.id,
      'status_changed',
      'Invoice status changed from ' || COALESCE(OLD.status, 'none') || ' to ' || NEW.status,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_status_audit_trigger ON public.invoices;
CREATE TRIGGER invoice_status_audit_trigger
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_invoice_status_audit();

COMMIT;
