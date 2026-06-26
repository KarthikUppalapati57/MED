BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_extracting_started_at
  ON public.invoices (organization_id, status, extraction_started_at)
  WHERE status = 'extracting';

COMMIT;