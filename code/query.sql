DO $$
DECLARE
  schema_record RECORD;
  result RECORD;
BEGIN
  FOR schema_record IN SELECT schema_name FROM public.tenant_registry LOOP
    FOR result IN EXECUTE format('SELECT id, status, vendor_name, created_at FROM %I.invoices WHERE created_at > now() - interval ''1 hour'' ORDER BY created_at DESC LIMIT 5;', schema_record.schema_name)
    LOOP
      RAISE NOTICE 'Found in schema %: id=%, status=%, vendor=%, created_at=%', schema_record.schema_name, result.id, result.status, result.vendor_name, result.created_at;
    END LOOP;
  END LOOP;
END $$;
