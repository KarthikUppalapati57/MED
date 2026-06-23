-- Migration to attach the webhook trigger to tenant schemas
BEGIN;

-- 1. Ensure the trigger exists on the tenant_template schema so new tenants get it automatically
DROP TRIGGER IF EXISTS trg_invoices_webhook ON tenant_template.invoices;
CREATE TRIGGER trg_invoices_webhook
  AFTER INSERT OR UPDATE ON tenant_template.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('invoice-processing');

-- 2. Propagate to all existing active tenant schemas
DO $$
DECLARE
  schema_record RECORD;
BEGIN
  FOR schema_record IN 
    SELECT schema_name 
    FROM public.tenant_registry 
    WHERE status = 'active'
  LOOP
    -- Safely execute the trigger creation in each schema
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_invoices_webhook ON %I.invoices;',
      schema_record.schema_name
    );
    
    EXECUTE format(
      'CREATE TRIGGER trg_invoices_webhook AFTER INSERT OR UPDATE ON %I.invoices FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function(''invoice-processing'');',
      schema_record.schema_name
    );
  END LOOP;
END;
$$;

COMMIT;
