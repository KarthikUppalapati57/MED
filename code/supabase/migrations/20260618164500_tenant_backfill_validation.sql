-- Phase 6: Tenant schema backfill and validation.
-- Adds guarded RPCs to copy existing public tenant rows into provisioned tenant schemas
-- and validate counts. Does not switch read/write modes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_backfill_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  requested_by UUID DEFAULT auth.uid(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tenant_backfill_runs_status_check CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.tenant_backfill_table_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.tenant_backfill_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  public_count BIGINT NOT NULL DEFAULT 0,
  tenant_count BIGINT NOT NULL DEFAULT 0,
  affected_rows BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_backfill_table_results_status_check CHECK (status IN ('copied', 'validated', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_backfill_runs_org ON public.tenant_backfill_runs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_backfill_table_results_run ON public.tenant_backfill_table_results(run_id);
CREATE INDEX IF NOT EXISTS idx_tenant_backfill_table_results_org_table ON public.tenant_backfill_table_results(organization_id, table_name);

ALTER TABLE public.tenant_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_backfill_table_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_backfill_runs_platform_admin_all" ON public.tenant_backfill_runs;
CREATE POLICY "tenant_backfill_runs_platform_admin_all"
ON public.tenant_backfill_runs
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_backfill_runs_org_read" ON public.tenant_backfill_runs;
CREATE POLICY "tenant_backfill_runs_org_read"
ON public.tenant_backfill_runs
FOR SELECT
USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "tenant_backfill_results_platform_admin_all" ON public.tenant_backfill_table_results;
CREATE POLICY "tenant_backfill_results_platform_admin_all"
ON public.tenant_backfill_table_results
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_backfill_results_org_read" ON public.tenant_backfill_table_results;
CREATE POLICY "tenant_backfill_results_org_read"
ON public.tenant_backfill_table_results
FOR SELECT
USING (organization_id = public.get_my_org());

CREATE OR REPLACE FUNCTION public.backfill_tenant_schema(
  p_organization_id UUID,
  p_table_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  run_id UUID;
  table_record RECORD;
  table_reg REGCLASS;
  target_reg REGCLASS;
  has_org_id BOOLEAN;
  has_id BOOLEAN;
  column_list TEXT;
  update_list TEXT;
  public_count BIGINT;
  tenant_count BIGINT;
  affected_rows BIGINT;
  copied_tables TEXT[] := ARRAY[]::TEXT[];
  skipped_tables JSONB := '[]'::jsonb;
  failed_tables JSONB := '[]'::jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can backfill tenant schemas';
  END IF;

  IF p_table_name IS NOT NULL AND p_table_name !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF registry_record.organization_id IS NULL OR registry_record.status IN ('planned', 'failed') THEN
    PERFORM public.provision_tenant_schema(p_organization_id);
    SELECT * INTO registry_record
    FROM public.tenant_registry
    WHERE organization_id = p_organization_id
    FOR UPDATE;
  END IF;

  IF registry_record.status NOT IN ('active', 'migrating') THEN
    RAISE EXCEPTION 'Tenant schema must be active before backfill. Current status: %', registry_record.status;
  END IF;

  IF registry_record.schema_name !~ '^tenant_[a-z0-9_]+$' OR length(registry_record.schema_name) > 63 THEN
    RAISE EXCEPTION 'Unsafe tenant schema name: %', registry_record.schema_name;
  END IF;

  INSERT INTO public.tenant_backfill_runs (organization_id, schema_name, status, metadata)
  VALUES (
    p_organization_id,
    registry_record.schema_name,
    'running',
    jsonb_build_object('table_name', p_table_name, 'started_from', 'backfill_tenant_schema')
  )
  RETURNING id INTO run_id;

  UPDATE public.tenant_registry
  SET status = 'migrating',
      metadata = metadata || jsonb_build_object('last_backfill_started_at', now(), 'last_backfill_run_id', run_id)
  WHERE organization_id = p_organization_id;

  FOR table_record IN
    SELECT tmt.table_name
    FROM public.tenant_mirror_tables tmt
    WHERE tmt.enabled = true
      AND (p_table_name IS NULL OR tmt.table_name = p_table_name)
    ORDER BY tmt.table_name
  LOOP
    BEGIN
      table_reg := to_regclass(format('public.%I', table_record.table_name));
      target_reg := to_regclass(format('%I.%I', registry_record.schema_name, table_record.table_name));

      IF table_reg IS NULL OR target_reg IS NULL THEN
        skipped_tables := skipped_tables || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'reason', 'missing source or target table'));
        INSERT INTO public.tenant_backfill_table_results (run_id, organization_id, schema_name, table_name, status, error_message)
        VALUES (run_id, p_organization_id, registry_record.schema_name, table_record.table_name, 'skipped', 'missing source or target table');
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'organization_id' AND attnum > 0 AND NOT attisdropped
      ) INTO has_org_id;

      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'id' AND attnum > 0 AND NOT attisdropped
      ) INTO has_id;

      IF NOT has_org_id OR NOT has_id THEN
        skipped_tables := skipped_tables || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'reason', 'requires id and organization_id columns'));
        INSERT INTO public.tenant_backfill_table_results (run_id, organization_id, schema_name, table_name, status, error_message)
        VALUES (run_id, p_organization_id, registry_record.schema_name, table_record.table_name, 'skipped', 'requires id and organization_id columns');
        CONTINUE;
      END IF;

      SELECT
        string_agg(format('%I', source_columns.column_name), ', ' ORDER BY source_columns.ordinal_position),
        string_agg(format('%I = EXCLUDED.%I', source_columns.column_name, source_columns.column_name), ', ' ORDER BY source_columns.ordinal_position)
      INTO column_list, update_list
      FROM information_schema.columns source_columns
      INNER JOIN information_schema.columns target_columns
        ON target_columns.table_schema = registry_record.schema_name
       AND target_columns.table_name = table_record.table_name
       AND target_columns.column_name = source_columns.column_name
      WHERE source_columns.table_schema = 'public'
        AND source_columns.table_name = table_record.table_name
        AND source_columns.is_generated = 'NEVER'
        AND source_columns.is_identity = 'NO';

      IF column_list IS NULL THEN
        skipped_tables := skipped_tables || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'reason', 'no copyable columns'));
        INSERT INTO public.tenant_backfill_table_results (run_id, organization_id, schema_name, table_name, status, error_message)
        VALUES (run_id, p_organization_id, registry_record.schema_name, table_record.table_name, 'skipped', 'no copyable columns');
        CONTINUE;
      END IF;

      SELECT
        string_agg(format('%I = EXCLUDED.%I', source_columns.column_name, source_columns.column_name), ', ' ORDER BY source_columns.ordinal_position)
      INTO update_list
      FROM information_schema.columns source_columns
      INNER JOIN information_schema.columns target_columns
        ON target_columns.table_schema = registry_record.schema_name
       AND target_columns.table_name = table_record.table_name
       AND target_columns.column_name = source_columns.column_name
      WHERE source_columns.table_schema = 'public'
        AND source_columns.table_name = table_record.table_name
        AND source_columns.column_name <> 'id'
        AND source_columns.is_generated = 'NEVER'
        AND source_columns.is_identity = 'NO';

      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', table_record.table_name)
      INTO public_count
      USING p_organization_id;

      IF update_list IS NULL THEN
        EXECUTE format(
          'INSERT INTO %I.%I (%s) SELECT %s FROM public.%I WHERE organization_id = $1 ON CONFLICT (id) DO NOTHING',
          registry_record.schema_name,
          table_record.table_name,
          column_list,
          column_list,
          table_record.table_name
        )
        USING p_organization_id;
      ELSE
        EXECUTE format(
          'INSERT INTO %I.%I (%s) SELECT %s FROM public.%I WHERE organization_id = $1 ON CONFLICT (id) DO UPDATE SET %s',
          registry_record.schema_name,
          table_record.table_name,
          column_list,
          column_list,
          table_record.table_name,
          update_list
        )
        USING p_organization_id;
      END IF;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;

      EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id = $1', registry_record.schema_name, table_record.table_name)
      INTO tenant_count
      USING p_organization_id;

      INSERT INTO public.tenant_backfill_table_results (
        run_id,
        organization_id,
        schema_name,
        table_name,
        public_count,
        tenant_count,
        affected_rows,
        status
      ) VALUES (
        run_id,
        p_organization_id,
        registry_record.schema_name,
        table_record.table_name,
        public_count,
        tenant_count,
        affected_rows,
        CASE WHEN tenant_count >= public_count THEN 'validated' ELSE 'failed' END
      );

      IF tenant_count >= public_count THEN
        copied_tables := array_append(copied_tables, table_record.table_name);
      ELSE
        failed_tables := failed_tables || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'public_count', public_count, 'tenant_count', tenant_count));
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        failed_tables := failed_tables || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'error', SQLERRM));
        INSERT INTO public.tenant_backfill_table_results (run_id, organization_id, schema_name, table_name, status, error_message)
        VALUES (run_id, p_organization_id, registry_record.schema_name, table_record.table_name, 'failed', SQLERRM);
    END;
  END LOOP;

  IF jsonb_array_length(failed_tables) > 0 THEN
    UPDATE public.tenant_backfill_runs
    SET status = 'failed', completed_at = now(), metadata = metadata || jsonb_build_object('failed_tables', failed_tables, 'skipped_tables', skipped_tables)
    WHERE id = run_id;

    UPDATE public.tenant_registry
    SET status = 'failed',
        metadata = metadata || jsonb_build_object('last_backfill_failed_at', now(), 'last_backfill_run_id', run_id, 'failed_tables', failed_tables)
    WHERE organization_id = p_organization_id;
  ELSE
    UPDATE public.tenant_backfill_runs
    SET status = 'completed', completed_at = now(), metadata = metadata || jsonb_build_object('copied_tables', copied_tables, 'skipped_tables', skipped_tables)
    WHERE id = run_id;

    UPDATE public.tenant_registry
    SET status = 'active',
        migrated_at = COALESCE(migrated_at, now()),
        last_validated_at = now(),
        metadata = metadata || jsonb_build_object('last_backfill_completed_at', now(), 'last_backfill_run_id', run_id)
    WHERE organization_id = p_organization_id;
  END IF;

  RETURN jsonb_build_object(
    'success', jsonb_array_length(failed_tables) = 0,
    'run_id', run_id,
    'organization_id', p_organization_id,
    'schema_name', registry_record.schema_name,
    'copied_tables', copied_tables,
    'skipped_tables', skipped_tables,
    'failed_tables', failed_tables
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tenant_backfill_counts(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  table_record RECORD;
  table_reg REGCLASS;
  target_reg REGCLASS;
  public_count BIGINT;
  tenant_count BIGINT;
  mismatches JSONB := '[]'::jsonb;
  checked_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR p_organization_id = public.get_my_org()) THEN
    RAISE EXCEPTION 'Insufficient permissions to validate tenant schema';
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  FOR table_record IN
    SELECT table_name
    FROM public.tenant_mirror_tables
    WHERE enabled = true
    ORDER BY table_name
  LOOP
    table_reg := to_regclass(format('public.%I', table_record.table_name));
    target_reg := to_regclass(format('%I.%I', registry_record.schema_name, table_record.table_name));

    IF table_reg IS NULL OR target_reg IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'organization_id' AND attnum > 0 AND NOT attisdropped
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', table_record.table_name)
    INTO public_count
    USING p_organization_id;

    EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id = $1', registry_record.schema_name, table_record.table_name)
    INTO tenant_count
    USING p_organization_id;

    checked_tables := array_append(checked_tables, table_record.table_name);

    IF tenant_count < public_count THEN
      mismatches := mismatches || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'public_count', public_count, 'tenant_count', tenant_count));
    END IF;
  END LOOP;

  IF jsonb_array_length(mismatches) = 0 THEN
    UPDATE public.tenant_registry
    SET last_validated_at = now(),
        metadata = metadata || jsonb_build_object('last_count_validation_at', now())
    WHERE organization_id = p_organization_id;
  END IF;

  RETURN jsonb_build_object(
    'success', jsonb_array_length(mismatches) = 0,
    'organization_id', p_organization_id,
    'schema_name', registry_record.schema_name,
    'checked_tables', checked_tables,
    'mismatches', mismatches
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_planned_tenant_schemas(p_limit INTEGER DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  results JSONB := '[]'::jsonb;
  backfill_result JSONB;
  max_count INTEGER;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can backfill tenant schemas';
  END IF;

  max_count := greatest(1, least(coalesce(p_limit, 5), 50));

  FOR registry_record IN
    SELECT organization_id
    FROM public.tenant_registry
    WHERE read_mode = 'public'
      AND write_mode = 'public'
      AND status IN ('planned', 'active', 'failed')
    ORDER BY created_at
    LIMIT max_count
  LOOP
    backfill_result := public.backfill_tenant_schema(registry_record.organization_id);
    results := results || jsonb_build_array(backfill_result);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'results', results);
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_tenant_schema(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_tenant_schema(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_tenant_backfill_counts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_tenant_backfill_counts(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.backfill_planned_tenant_schemas(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_planned_tenant_schemas(INTEGER) TO authenticated, service_role;

COMMENT ON TABLE public.tenant_backfill_runs IS
  'Audit records for tenant schema backfill runs from public shared tables.';
COMMENT ON TABLE public.tenant_backfill_table_results IS
  'Per-table results and count validation from tenant schema backfill runs.';
COMMENT ON FUNCTION public.backfill_tenant_schema(UUID, TEXT) IS
  'Copies one organization from public operational tables into its provisioned tenant schema. Does not change read/write modes.';
COMMENT ON FUNCTION public.validate_tenant_backfill_counts(UUID) IS
  'Compares public and tenant schema row counts for one organization.';
COMMENT ON FUNCTION public.backfill_planned_tenant_schemas(INTEGER) IS
  'Batch helper for backfilling planned/active/failed tenant registry entries that still read/write public tables.';

COMMIT;
