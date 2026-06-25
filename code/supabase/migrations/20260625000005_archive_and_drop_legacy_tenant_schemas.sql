DO $$
DECLARE
  missing_rows BIGINT;
  row_count_only_tables BIGINT;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(a.missing_by_id, 0)), 0),
    COUNT(*) FILTER (WHERE a.compare_mode = 'row_count_only' AND a.tenant_rows > 0)
  INTO missing_rows, row_count_only_tables
  FROM public.audit_tenant_schema_backmigration() a;

  IF missing_rows <> 0 OR row_count_only_tables <> 0 THEN
    RAISE EXCEPTION
      'Refusing to drop tenant schemas. missing_rows=%, row_count_only_tables_with_data=%',
      missing_rows,
      row_count_only_tables;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tenant_schema_retirement_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_name TEXT NOT NULL,
  organization_id UUID,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_count BIGINT NOT NULL DEFAULT 0,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.tenant_schema_retirement_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_schema_retirement_archive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tenant_schema_retirement_archive TO service_role;

DO $$
DECLARE
  schema_record RECORD;
  table_record RECORD;
  row_count_value BIGINT;
  rows_value JSONB;
BEGIN
  FOR schema_record IN
    SELECT
      n.nspname AS schema_name,
      tr.organization_id
    FROM pg_namespace n
    LEFT JOIN public.tenant_registry tr
      ON tr.schema_name = n.nspname
    WHERE n.nspname ~ '^tenant_[a-z0-9_]+$'
    ORDER BY n.nspname
  LOOP
    FOR table_record IN
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = schema_record.schema_name
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    LOOP
      EXECUTE format(
        'SELECT count(*), COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %I.%I t',
        schema_record.schema_name,
        table_record.table_name
      )
      INTO row_count_value, rows_value;

      INSERT INTO public.tenant_schema_retirement_archive (
        migration_name,
        organization_id,
        schema_name,
        table_name,
        row_count,
        rows_json,
        metadata
      )
      VALUES (
        '20260625000005_archive_and_drop_legacy_tenant_schemas',
        schema_record.organization_id,
        schema_record.schema_name,
        table_record.table_name,
        row_count_value,
        rows_value,
        jsonb_build_object('archived_before_drop', true)
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.tenant_schema_retirement_archive IS
  'Service-role-only evidence archive of legacy tenant schema table rows captured immediately before dropping schema-per-tenant storage.';
