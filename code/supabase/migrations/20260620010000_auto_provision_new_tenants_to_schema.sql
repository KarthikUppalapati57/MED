-- Auto-provision new organizations into schema-per-tenant mode.
-- Existing tenants are intentionally untouched; this only applies to future
-- rows inserted into public.organizations.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_provision_new_tenant_schema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  schema_name TEXT;
  table_record RECORD;
  created_tables TEXT[] := ARRAY[]::TEXT[];
  skipped_tables TEXT[] := ARRAY[]::TEXT[];
  registry_record RECORD;
BEGIN
  schema_name := public.generate_tenant_schema_name(NEW.id, NEW.slug, NEW.name);

  IF schema_name !~ '^tenant_[a-z0-9_]+$' OR length(schema_name) > 63 THEN
    RAISE EXCEPTION 'Unsafe tenant schema name: %', schema_name;
  END IF;

  INSERT INTO public.tenant_registry (
    organization_id,
    schema_name,
    status,
    read_mode,
    write_mode,
    metadata
  )
  VALUES (
    NEW.id,
    schema_name,
    'provisioning',
    'tenant_schema',
    'tenant_schema',
    jsonb_build_object(
      'provisioned_by', 'auto_provision_new_tenant_schema',
      'provisioning_policy', 'new_tenant_schema_from_day_one'
    )
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET schema_name = EXCLUDED.schema_name,
      status = 'provisioning',
      read_mode = 'tenant_schema',
      write_mode = 'tenant_schema',
      metadata = public.tenant_registry.metadata || EXCLUDED.metadata || jsonb_build_object('last_auto_provision_attempt_at', now())
  RETURNING * INTO registry_record;

  schema_name := registry_record.schema_name;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', schema_name, 'Per-tenant operational schema for organization ' || NEW.id::text);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema_name);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon', schema_name);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM authenticated', schema_name);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', schema_name);

  FOR table_record IN
    SELECT table_name, is_required
    FROM public.tenant_template_tables
    ORDER BY copy_order, table_name
  LOOP
    IF to_regclass(format('tenant_template.%I', table_record.table_name)) IS NULL THEN
      IF table_record.is_required THEN
        RAISE EXCEPTION 'Required template table tenant_template.% is missing', table_record.table_name;
      END IF;

      skipped_tables := array_append(skipped_tables, table_record.table_name);
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.%I (LIKE tenant_template.%I INCLUDING ALL)',
      schema_name,
      table_record.table_name,
      table_record.table_name
    );

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_record.table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC', schema_name, table_record.table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', schema_name, table_record.table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM authenticated', schema_name, table_record.table_name);
    EXECUTE format('GRANT ALL ON TABLE %I.%I TO service_role', schema_name, table_record.table_name);
    EXECUTE format('COMMENT ON TABLE %I.%I IS %L', schema_name, table_record.table_name, 'Provisioned tenant table for organization ' || NEW.id::text);

    created_tables := array_append(created_tables, table_record.table_name);
  END LOOP;

  UPDATE public.tenant_registry
  SET status = 'active',
      read_mode = 'tenant_schema',
      write_mode = 'tenant_schema',
      provisioned_at = COALESCE(provisioned_at, now()),
      metadata = metadata || jsonb_build_object(
        'last_provisioned_at', now(),
        'created_table_count', coalesce(array_length(created_tables, 1), 0),
        'skipped_tables', skipped_tables,
        'new_tenant_schema_from_day_one', true
      )
  WHERE organization_id = NEW.id
  RETURNING * INTO registry_record;


  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.tenant_registry
    SET status = 'failed',
        metadata = metadata || jsonb_build_object(
          'last_error', SQLERRM,
          'last_failed_at', now(),
          'failed_during', 'auto_provision_new_tenant_schema'
        )
    WHERE organization_id = NEW.id;

    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS auto_provision_new_tenant_schema ON public.organizations;
CREATE TRIGGER auto_provision_new_tenant_schema
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.auto_provision_new_tenant_schema();

REVOKE ALL ON FUNCTION public.auto_provision_new_tenant_schema() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.auto_provision_new_tenant_schema() IS
  'Organization insert trigger that provisions future tenants directly into tenant_schema read/write mode.';
COMMENT ON TRIGGER auto_provision_new_tenant_schema ON public.organizations IS
  'Provision new tenant schemas from day one for newly created organizations.';

COMMIT;
