-- Migration: 060_edi_routing
-- Description: Add EDI transmission logs and triggers for automated PO routing

CREATE TABLE IF NOT EXISTS public.edi_transmissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.auto_orders(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.vendors(id),
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ
);

ALTER TABLE public.edi_transmissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view EDI transmissions" ON public.edi_transmissions 
    FOR SELECT USING (organization_id = public.get_my_org());

-- Function to queue an EDI transmission when an order is approved
CREATE OR REPLACE FUNCTION public.queue_edi_transmission()
RETURNS TRIGGER AS $$
BEGIN
    -- Only queue for approved orders that are being sent
    IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
        -- Insert a pending EDI transmission log
        INSERT INTO public.edi_transmissions (
            organization_id,
            order_id,
            payload,
            status
        ) VALUES (
            NEW.organization_id,
            NEW.id,
            jsonb_build_object(
                'po_number', NEW.order_number,
                'vendor', NEW.vendor_name,
                'total', NEW.total_amount,
                'items', NEW.items,
                'timestamp', now()
            ),
            'pending'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to fire on order update
DROP TRIGGER IF EXISTS trg_queue_edi_transmission ON public.auto_orders;
CREATE TRIGGER trg_queue_edi_transmission
    AFTER UPDATE OF status ON public.auto_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.queue_edi_transmission();
