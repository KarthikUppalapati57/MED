-- Phase 3: Secure tenant schema provisioning.
-- Creates per-tenant schemas from tenant_template without switching app reads/writes yet.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_tenant_schema_name(
  p_organization_id UUID,
  p_org_slug TEXT DEFAULT NULL,
  p_org_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  base_name TEXT;
  suffix TEXT;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  base_name := lower(coalesce(nullif(p_org_slug, ''), nullif(p_org_name, ''), p_organization_id::text));
  base_name := regexp_replace(base_name, '[^a-z0-9]+', '_', 'g');
  base_name := regexp_replace(base_name, '^_+|_+$', '', 'g');

  IF base_name = '' THEN
    base_name := replace(p_organization_id::text, '-', '_');
  END IF;

  suffix := replace(left(p_organization_id::text, 8), '-', '');
  RETURN left('tenant_' || base_name || '_' || suffix, 63);
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_record RECORD;
  registry_record RECORD;
  schema_name TEXT;
  table_record RECORD;
  created_tables TEXT[] := ARRAY[]::TEXT[];
  skipped_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can provision tenant schemas';
  END IF;

  SELECT id, name, slug
  INTO org_record
  FROM public.organizations
  WHERE id = p_organization_id;

  IF org_record.id IS NULL THEN
    RAISE EXCEPTION 'Organization % does not exist', p_organization_id;
  END IF;

  SELECT *
  INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF registry_record.organization_id IS NULL THEN
    schema_name := public.generate_tenant_schema_name(org_record.id, org_record.slug, org_record.name);

    INSERT INTO public.tenant_registry (
      organization_id,
      schema_name,
      status,
      read_mode,
      write_mode,
      metadata
    )
    VALUES (
      org_record.id,
      schema_name,
      'provisioning',
      'public',
      'public',
      jsonb_build_object('provisioned_by', 'provision_tenant_schema')
    )
    RETURNING * INTO registry_record;
  ELSE
    schema_name := registry_record.schema_name;

    IF registry_record.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot provision archived tenant registry for organization %', p_organization_id;
    END IF;

    UPDATE public.tenant_registry
    SET status = 'provisioning',
        metadata = metadata || jsonb_build_object('last_provision_attempt_at', now())
    WHERE organization_id = p_organization_id
    RETURNING * INTO registry_record;
  END IF;

  IF schema_name !~ '^tenant_[a-z0-9_]+$' OR length(schema_name) > 63 THEN
    RAISE EXCEPTION 'Unsafe tenant schema name: %', schema_name;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', schema_name, 'Per-tenant operational schema for organization ' || p_organization_id::text);
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
    EXECUTE format('COMMENT ON TABLE %I.%I IS %L', schema_name, table_record.table_name, 'Provisioned tenant table for organization ' || p_organization_id::text);

    created_tables := array_append(created_tables, table_record.table_name);
  END LOOP;

  UPDATE public.tenant_registry
  SET status = 'active',
      provisioned_at = COALESCE(provisioned_at, now()),
      metadata = metadata || jsonb_build_object(
        'last_provisioned_at', now(),
        'created_table_count', coalesce(array_length(created_tables, 1), 0),
        'skipped_tables', skipped_tables
      )
  WHERE organization_id = p_organization_id
  RETURNING * INTO registry_record;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'schema_name', schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode,
    'created_tables', created_tables,
    'skipped_tables', skipped_tables
  );
EXCEPTION
  WHEN OTHERS THEN
    IF p_organization_id IS NOT NULL THEN
      UPDATE public.tenant_registry
      SET status = 'failed',
          metadata = metadata || jsonb_build_object(
            'last_error', SQLERRM,
            'last_failed_at', now()
          )
      WHERE organization_id = p_organization_id;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_planned_tenant_schemas(p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_record RECORD;
  results JSONB := '[]'::jsonb;
  provision_result JSONB;
  max_count INTEGER;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can provision tenant schemas';
  END IF;

  max_count := greatest(1, least(coalesce(p_limit, 10), 100));

  FOR org_record IN
    SELECT organization_id
    FROM public.tenant_registry
    WHERE status IN ('planned', 'failed')
    ORDER BY created_at
    LIMIT max_count
  LOOP
    provision_result := public.provision_tenant_schema(org_record.organization_id);
    results := results || jsonb_build_array(provision_result);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'results', results);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_tenant_schema_name(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tenant_schema_name(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.provision_tenant_schema(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant_schema(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_planned_tenant_schemas(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_planned_tenant_schemas(INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.provision_tenant_schema(UUID) IS
  'Creates a tenant schema from tenant_template for one organization. Does not switch read/write modes.';
COMMENT ON FUNCTION public.provision_planned_tenant_schemas(INTEGER) IS
  'Batch helper to provision planned/failed tenant_registry entries. Use cautiously from platform admin or service role contexts.';

COMMIT;