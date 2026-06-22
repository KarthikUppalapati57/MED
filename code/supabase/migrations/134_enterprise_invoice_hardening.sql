-- Migration: 134_enterprise_invoice_hardening.sql
-- Description: Creates tables and indexes for job processing, audit logging, and concurrency control.

BEGIN;

-- ========================================================
-- PHASE 4: Processing Job Management
-- ========================================================
CREATE TABLE IF NOT EXISTS public.invoice_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL, -- 'extraction', 'sync', 'validation'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'retrying'
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    processor_version TEXT DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_processing_jobs_invoice_id ON public.invoice_processing_jobs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_processing_jobs_status ON public.invoice_processing_jobs(status);

-- ========================================================
-- PHASE 8: Idempotency Protection
-- ========================================================
CREATE TABLE IF NOT EXISTS public.invoice_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    operation TEXT NOT NULL, -- e.g., 'inventory_sync', 'approval'
    hash TEXT NOT NULL,      -- Hash of the payload to detect duplicates
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(invoice_id, operation, hash) -- The idempotency key
);

CREATE INDEX IF NOT EXISTS idx_invoice_sync_log_invoice_id ON public.invoice_sync_log(invoice_id);

-- ========================================================
-- PHASE 9: Audit Logging
-- ========================================================
CREATE TABLE IF NOT EXISTS public.invoice_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'created', 'approved', 'rejected', 'price_variance_flagged'
    old_value JSONB,
    new_value JSONB,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_event_log_invoice_id ON public.invoice_event_log(invoice_id);

-- ========================================================
-- PHASE 10: Performance Indexing
-- ========================================================
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_vendor_items_vendor_id ON public.vendor_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices(organization_id);

-- ========================================================
-- PHASE 7: Concurrency Protection
-- ========================================================
-- Add version_number column to invoices if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'version_number') THEN
        ALTER TABLE public.invoices ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

COMMIT;
