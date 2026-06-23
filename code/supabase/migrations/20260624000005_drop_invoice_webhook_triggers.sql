BEGIN;

-- Drop trigger from public.invoices
DROP TRIGGER IF EXISTS trg_invoices_webhook ON public.invoices;

-- Drop trigger from tenant_template.invoices
DROP TRIGGER IF EXISTS trg_invoices_webhook ON tenant_template.invoices;

-- Propagate to all existing active tenant schemas
DO $$
DECLARE
  schema_record RECORD;
BEGIN
  FOR schema_record IN 
    SELECT schema_name 
    FROM public.tenant_registry 
    WHERE status = 'active'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_invoices_webhook ON %I.invoices;',
      schema_record.schema_name
    );
  END LOOP;
END;
$$;

COMMIT;
