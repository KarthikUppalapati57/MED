-- 101: Vendor Statements Reconciliation
-- Supports uploading vendor statements and auto-matching them to invoices.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    statement_date DATE NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'needs_review' CHECK (status IN ('matched', 'needs_review', 'disputed')),
    file_url TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.vendor_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vendor statements"
    ON public.vendor_statements FOR SELECT
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

CREATE POLICY "Manage vendor statements"
    ON public.vendor_statements FOR ALL
    USING (organization_id = public.get_my_org() OR public.is_platform_admin());

-- Statement Lines Table (links statement line to an internal invoice)
CREATE TABLE IF NOT EXISTS public.vendor_statement_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement_id UUID NOT NULL REFERENCES public.vendor_statements(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    invoice_date DATE,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched', 'disputed', 'missing_credit')),
    matched_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.vendor_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vendor statement lines"
    ON public.vendor_statement_lines FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.vendor_statements vs
            WHERE vs.id = statement_id
            AND (vs.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

CREATE POLICY "Manage vendor statement lines"
    ON public.vendor_statement_lines FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.vendor_statements vs
            WHERE vs.id = statement_id
            AND (vs.organization_id = public.get_my_org() OR public.is_platform_admin())
        )
    );

-- Trigger to update updated_at
CREATE TRIGGER update_vendor_statements_modtime
    BEFORE UPDATE ON public.vendor_statements
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- RPC for auto-matching statement lines to invoices
CREATE OR REPLACE FUNCTION public.auto_match_statement_lines(p_statement_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor_id UUID;
    v_org_id UUID;
    v_matched_count INTEGER := 0;
    v_line RECORD;
    v_invoice_id UUID;
BEGIN
    SELECT vendor_id, organization_id INTO v_vendor_id, v_org_id 
    FROM public.vendor_statements WHERE id = p_statement_id;

    FOR v_line IN SELECT * FROM public.vendor_statement_lines WHERE statement_id = p_statement_id AND status = 'unmatched' LOOP
        -- Try to find an exact match on invoice_number and amount and vendor
        SELECT id INTO v_invoice_id
        FROM public.invoices
        WHERE organization_id = v_org_id 
          AND vendor_id = v_vendor_id
          AND invoice_number = v_line.invoice_number
          AND total_amount = v_line.amount
        LIMIT 1;

        IF v_invoice_id IS NOT NULL THEN
            UPDATE public.vendor_statement_lines
            SET status = 'matched', matched_invoice_id = v_invoice_id
            WHERE id = v_line.id;
            
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;

    -- Update parent statement status if all lines are matched
    IF NOT EXISTS (SELECT 1 FROM public.vendor_statement_lines WHERE statement_id = p_statement_id AND status != 'matched') THEN
        UPDATE public.vendor_statements SET status = 'matched' WHERE id = p_statement_id;
    ELSE
        UPDATE public.vendor_statements SET status = 'needs_review' WHERE id = p_statement_id;
    END IF;

    RETURN v_matched_count;
END;
$$;

COMMIT;
