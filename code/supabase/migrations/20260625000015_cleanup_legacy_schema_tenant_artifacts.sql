ALTER TABLE public.tenant_registry
  ALTER COLUMN schema_name DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS tenant_registry_schema_unique,
  DROP CONSTRAINT IF EXISTS tenant_registry_schema_name_safe;

UPDATE public.tenant_registry
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'retired_schema_name', schema_name,
      'tenant_schema_dropped_at', now(),
      'tenant_schema_drop_migration', '20260625000015_cleanup_legacy_schema_tenant_artifacts'
    ),
    schema_name = NULL,
    read_mode = 'public',
    write_mode = 'public',
    status = CASE WHEN status = 'archived' THEN status ELSE 'active' END,
    updated_at = now()
WHERE schema_name IS NOT NULL
   OR read_mode IS DISTINCT FROM 'public'
   OR write_mode IS DISTINCT FROM 'public';

CREATE OR REPLACE FUNCTION public.auto_register_new_tenant_shared_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.tenant_registry (
    organization_id, schema_name, status, read_mode, write_mode, metadata
  )
  VALUES (
    NEW.id, NULL, 'active', 'public', 'public',
    jsonb_build_object(
      'tenancy_model', 'shared_public',
      'registered_by', 'auto_register_new_tenant_shared_public',
      'schema_per_tenant_removed_at', now()
    )
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET status = CASE
        WHEN public.tenant_registry.status = 'archived' THEN public.tenant_registry.status
        ELSE 'active'
      END,
      schema_name = NULL,
      read_mode = 'public',
      write_mode = 'public',
      metadata = public.tenant_registry.metadata || jsonb_build_object(
        'tenancy_model', 'shared_public',
        'registered_by', 'auto_register_new_tenant_shared_public',
        'schema_per_tenant_removed_at', now(),
        'previous_read_mode', public.tenant_registry.read_mode,
        'previous_write_mode', public.tenant_registry.write_mode
      );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_register_new_tenant_shared_public() FROM PUBLIC, anon, authenticated;

DROP SCHEMA IF EXISTS tenant_template CASCADE;

DROP FUNCTION IF EXISTS public.audit_tenant_schema_backmigration();
DROP FUNCTION IF EXISTS public.backfill_tenant_schema_missing_rows(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.provision_planned_tenant_schemas(INTEGER);
DROP FUNCTION IF EXISTS public.provision_tenant_schema(UUID);
DROP FUNCTION IF EXISTS public.backfill_planned_tenant_schemas(INTEGER);
DROP FUNCTION IF EXISTS public.backfill_tenant_schema(UUID);
DROP FUNCTION IF EXISTS public.validate_tenant_backfill_counts(UUID);
DROP FUNCTION IF EXISTS public.generate_tenant_schema_name(UUID, TEXT, TEXT);

DROP TABLE IF EXISTS public.tenant_pilot_cutovers CASCADE;
DROP TABLE IF EXISTS public.tenant_reporting_snapshots CASCADE;
DROP TABLE IF EXISTS public.tenant_cutover_events CASCADE;
DROP TABLE IF EXISTS public.tenant_backfill_runs CASCADE;
DROP TABLE IF EXISTS public.tenant_template_tables CASCADE;

COMMENT ON TABLE public.tenant_registry IS
  'Historical shared-public tenancy registry. Legacy schema-per-tenant schemas were archived into public.tenant_schema_retirement_archive and dropped.';
COMMENT ON COLUMN public.tenant_registry.schema_name IS
  'Deprecated. Null after schema-per-tenant retirement; prior schema names are retained in metadata.retired_schema_name.';
