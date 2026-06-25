BEGIN;

CREATE OR REPLACE FUNCTION public.audit_tenant_schema_backmigration()
RETURNS TABLE (
  organization_id UUID,
  schema_name TEXT,
  table_name TEXT,
  tenant_rows BIGINT,
  public_rows_for_org BIGINT,
  missing_by_id BIGINT,
  compare_mode TEXT,
  sample_missing_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  table_record RECORD;
  tenant_count BIGINT;
  public_count BIGINT;
  missing_count BIGINT;
  missing_ids UUID[];
  tenant_has_id BOOLEAN;
  public_has_id BOOLEAN;
  public_has_org BOOLEAN;
  tenant_table_regclass REGCLASS;
  public_table_regclass REGCLASS;
BEGIN
  FOR registry_record IN
    SELECT tr.organization_id, tr.schema_name
    FROM public.tenant_registry tr
    WHERE tr.schema_name IS NOT NULL
      AND tr.schema_name ~ '^tenant_[a-z0-9_]+$'
      AND to_regnamespace(tr.schema_name) IS NOT NULL
    ORDER BY tr.schema_name
  LOOP
    FOR table_record IN
      SELECT ttt.table_name
      FROM public.tenant_template_tables ttt
      ORDER BY ttt.copy_order, ttt.table_name
    LOOP
      tenant_table_regclass := to_regclass(format('%I.%I', registry_record.schema_name, table_record.table_name));
      public_table_regclass := to_regclass(format('public.%I', table_record.table_name));

      IF tenant_table_regclass IS NULL OR public_table_regclass IS NULL THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = registry_record.schema_name
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO tenant_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'id'
      )
      INTO public_has_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = table_record.table_name
          AND c.column_name = 'organization_id'
      )
      INTO public_has_org;

      EXECUTE format('SELECT count(*) FROM %I.%I', registry_record.schema_name, table_record.table_name)
        INTO tenant_count;

      IF public_has_org THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', table_record.table_name)
          INTO public_count
          USING registry_record.organization_id;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I', table_record.table_name)
          INTO public_count;
      END IF;

      missing_count := NULL;
      missing_ids := ARRAY[]::UUID[];

      IF tenant_has_id AND public_has_id AND public_has_org THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.%I t
            WHERE NOT EXISTS (
              SELECT 1
                FROM public.%I p
               WHERE p.id = t.id
                 AND p.organization_id = $1
            )',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_count
        USING registry_record.organization_id;

        EXECUTE format(
          'SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
             FROM (
               SELECT t.id
                 FROM %I.%I t
                WHERE NOT EXISTS (
                  SELECT 1
                    FROM public.%I p
                   WHERE p.id = t.id
                     AND p.organization_id = $1
                )
                ORDER BY t.id
                LIMIT 10
             ) missing',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_ids
        USING registry_record.organization_id;
      ELSIF tenant_has_id AND public_has_id THEN
        EXECUTE format(
          'SELECT count(*)
             FROM %I.%I t
            WHERE NOT EXISTS (
              SELECT 1 FROM public.%I p WHERE p.id = t.id
            )',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_count;

        EXECUTE format(
          'SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
             FROM (
               SELECT t.id
                 FROM %I.%I t
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.%I p WHERE p.id = t.id
                )
                ORDER BY t.id
                LIMIT 10
             ) missing',
          registry_record.schema_name,
          table_record.table_name,
          table_record.table_name
        )
        INTO missing_ids;
      END IF;

      organization_id := registry_record.organization_id;
      schema_name := registry_record.schema_name;
      table_name := table_record.table_name;
      tenant_rows := tenant_count;
      public_rows_for_org := public_count;
      missing_by_id := missing_count;
      compare_mode := CASE
        WHEN tenant_has_id AND public_has_id AND public_has_org THEN 'id_and_organization_id'
        WHEN tenant_has_id AND public_has_id THEN 'id_only'
        ELSE 'row_count_only'
      END;
      sample_missing_ids := missing_ids;

      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM anon;
REVOKE ALL ON FUNCTION public.audit_tenant_schema_backmigration() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_tenant_schema_backmigration() TO service_role;

COMMENT ON FUNCTION public.audit_tenant_schema_backmigration() IS
  'Read-only service-role audit for comparing legacy tenant schema rows against shared public canonical tables before back-migration.';

COMMIT;
