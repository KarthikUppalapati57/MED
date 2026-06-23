-- Fix invoices_status_check constraint to allow extracting and extract_failed
BEGIN;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('extracting', 'extract_failed', 'pending_review', 'validated', 'pending_approval', 'approved', 'scheduled', 'partially_paid', 'paid', 'rejected', 'duplicate', 'flagged'));

DO $$
DECLARE
  schema_record RECORD;
BEGIN
  FOR schema_record IN SELECT schema_name FROM public.tenant_registry LOOP
    EXECUTE format('ALTER TABLE %I.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD CONSTRAINT invoices_status_check CHECK (status IN (''extracting'', ''extract_failed'', ''pending_review'', ''validated'', ''pending_approval'', ''approved'', ''scheduled'', ''partially_paid'', ''paid'', ''rejected'', ''duplicate'', ''flagged''));', schema_record.schema_name);
  END LOOP;
END $$;

COMMIT;
