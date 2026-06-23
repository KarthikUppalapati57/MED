-- Restore invoice extraction webhooks after tenant-schema cutover.
-- The previous drop migration removed the only backend-owned starter for invoice extraction.

BEGIN;

DROP TRIGGER IF EXISTS trg_invoices_webhook ON public.invoices;
CREATE TRIGGER trg_invoices_webhook
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('invoice-processing');

DROP TRIGGER IF EXISTS trg_invoices_webhook ON tenant_template.invoices;
CREATE TRIGGER trg_invoices_webhook
  AFTER INSERT OR UPDATE ON tenant_template.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('invoice-processing');

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

    EXECUTE format(
      'CREATE TRIGGER trg_invoices_webhook AFTER INSERT OR UPDATE ON %I.invoices FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function(''invoice-processing'');',
      schema_record.schema_name
    );
  END LOOP;
END;
$$;

COMMIT;