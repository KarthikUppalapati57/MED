-- Create the vendor tax details table for encrypted/secure storage
CREATE TABLE IF NOT EXISTS public.vendor_tax_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    encrypted_tax_id TEXT,
    w9_document_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add onboarding-specific columns to vendors
ALTER TABLE public.vendors 
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tax_magic_link_token TEXT,
  ADD COLUMN IF NOT EXISTS tax_magic_link_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_magic_link_token TEXT,
  ADD COLUMN IF NOT EXISTS bank_magic_link_expires_at TIMESTAMPTZ;

-- Ensure RLS is enabled for the new table
ALTER TABLE public.vendor_tax_details ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy for vendor_tax_details
CREATE POLICY "Tenant isolation for vendor_tax_details"
    ON public.vendor_tax_details
    FOR ALL
    USING (
        vendor_id IN (
            SELECT id FROM public.vendors 
            WHERE organization_id = (current_setting('app.current_tenant_id', true))::uuid
        )
    );

-- Also allow service role full access
CREATE POLICY "Service role full access for vendor_tax_details"
    ON public.vendor_tax_details
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');
