BEGIN;

UPDATE public.invoices
SET
  status = 'extracting',
  ap_status = 'processing',
  extraction_started_at = NULL,
  validation_results = jsonb_set(
    COALESCE(validation_results, '{}'::jsonb),
    '{upload_state}',
    '"stored"'::jsonb,
    true
  ),
  updated_at = now()
WHERE source IN ('manual_upload', 'camera')
  AND invoice_number LIKE 'PENDING-%'
  AND file_url IS NOT NULL
  AND raw_text IS NULL
  AND extraction_started_at IS NULL
  AND status = 'paid';

COMMIT;
