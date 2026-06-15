-- 102: Accounting Sync
-- Supports exporting AP ledger to QBO/Xero

BEGIN;

-- Add accounting vendor ID to vendors
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS accounting_vendor_id TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS accounting_vendor_name TEXT;

-- Export Queue Table
CREATE TABLE IF NOT EXISTS public.accounting_export_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment', 'journal_entry')),
    entity_id UUID NOT NULL, -- references invoices(id) or payments(id)
    status TEXT NOT NULL DEFAULT 'not_ready' CHECK (status IN ('not_ready', 'ready', 'synced', 'failed')),
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE,
    external_reference_id TEXT, -- ID from QBO/Xero
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.accounting_export_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View export queue"
    ON public.accounting_export_queue FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage export queue"
    ON public.accounting_export_queue FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- Trigger to update updated_at
CREATE TRIGGER update_accounting_export_queue_modtime
    BEFORE UPDATE ON public.accounting_export_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- Function to queue an invoice for export when it's approved
CREATE OR REPLACE FUNCTION public.queue_approved_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If status changed to approved and it's not already in the queue
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        INSERT INTO public.accounting_export_queue (
            organization_id,
            entity_type,
            entity_id,
            status
        ) VALUES (
            NEW.organization_id,
            'invoice',
            NEW.id,
            'ready'
        ) ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_approved_invoice ON public.invoices;
CREATE TRIGGER trigger_queue_approved_invoice
    AFTER UPDATE OF status ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.queue_approved_invoice();

COMMIT;
