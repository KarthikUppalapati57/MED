-- 100: Scheduled Payments
-- Supports the AP Bill Pay workflow by grouping invoices into batches.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id),
    payment_account_id UUID REFERENCES public.payment_accounts(id),
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    scheduled_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('draft', 'scheduled', 'processing', 'paid', 'failed', 'canceled')),
    payment_method TEXT DEFAULT 'ach', -- 'ach', 'check', 'virtual_card', 'manual'
    external_transfer_id TEXT, -- For Stripe Treasury/Modern Treasury mapping
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scheduled payments"
    ON public.scheduled_payments FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage scheduled payments"
    ON public.scheduled_payments FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- Link invoices to a scheduled payment via an intersection table (so one payment can cover multiple invoices, or partial)
CREATE TABLE IF NOT EXISTS public.scheduled_payment_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheduled_payment_id UUID NOT NULL REFERENCES public.scheduled_payments(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount_applied NUMERIC(12,2) NOT NULL, -- allows partial payments
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(scheduled_payment_id, invoice_id)
);

-- RLS for intersection
ALTER TABLE public.scheduled_payment_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scheduled payment invoices"
    ON public.scheduled_payment_invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.scheduled_payments sp
            WHERE sp.id = scheduled_payment_id
            AND (sp.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

CREATE POLICY "Manage scheduled payment invoices"
    ON public.scheduled_payment_invoices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.scheduled_payments sp
            WHERE sp.id = scheduled_payment_id
            AND (sp.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

-- Trigger to update updated_at
CREATE TRIGGER update_scheduled_payments_modtime
    BEFORE UPDATE ON public.scheduled_payments
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- RPC for bulk scheduling
CREATE OR REPLACE FUNCTION public.schedule_payment_batch(
    p_vendor_id UUID,
    p_payment_account_id UUID,
    p_scheduled_date DATE,
    p_invoice_ids UUID[],
    p_amounts NUMERIC[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scheduled_payment_id UUID;
    v_total NUMERIC := 0;
    i INT;
BEGIN
    -- Calculate total
    FOR i IN 1 .. array_length(p_amounts, 1) LOOP
        v_total := v_total + p_amounts[i];
    END LOOP;

    -- Create scheduled payment record
    INSERT INTO public.scheduled_payments (
        organization_id,
        vendor_id,
        payment_account_id,
        total_amount,
        scheduled_date,
        status,
        created_by
    ) VALUES (
        public.get_my_org(),
        p_vendor_id,
        p_payment_account_id,
        v_total,
        p_scheduled_date,
        'scheduled',
        auth.uid()
    ) RETURNING id INTO v_scheduled_payment_id;

    -- Insert intersection records
    FOR i IN 1 .. array_length(p_invoice_ids, 1) LOOP
        INSERT INTO public.scheduled_payment_invoices (
            scheduled_payment_id,
            invoice_id,
            amount_applied
        ) VALUES (
            v_scheduled_payment_id,
            p_invoice_ids[i],
            p_amounts[i]
        );
        
        -- Update invoice status
        UPDATE public.invoices 
        SET scheduled_payment_date = p_scheduled_date,
            status = 'scheduled'
        WHERE id = p_invoice_ids[i];
    END LOOP;

    RETURN v_scheduled_payment_id;
END;
$$;

COMMIT;
