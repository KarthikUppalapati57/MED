BEGIN;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'uploading',
    'extracting',
    'extract_failed',
    'pending_review',
    'validated',
    'pending_approval',
    'approved',
    'scheduled',
    'partially_paid',
    'paid',
    'rejected',
    'duplicate',
    'flagged'
  )
);

COMMIT;
