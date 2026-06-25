CREATE OR REPLACE FUNCTION public.inspect_database_architecture()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', now(),
    'schemas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'schema_name', n.nspname,
        'owner', pg_catalog.pg_get_userbyid(n.nspowner)
      ) ORDER BY n.nspname), '[]'::jsonb)
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname NOT LIKE 'pg_%'
        AND n.nspname <> 'information_schema'
    ),
    'extensions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'extension_name', e.extname,
        'schema_name', ns.nspname,
        'version', e.extversion
      ) ORDER BY e.extname), '[]'::jsonb)
      FROM pg_catalog.pg_extension e
      JOIN pg_catalog.pg_namespace ns ON ns.oid = e.extnamespace
    ),
    'tables', (
      SELECT COALESCE(jsonb_agg(table_payload ORDER BY table_payload->>'schema_name', table_payload->>'table_name'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'schema_name', ns.nspname,
          'table_name', c.relname,
          'kind', CASE c.relkind
            WHEN 'r' THEN 'table'
            WHEN 'p' THEN 'partitioned_table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized_view'
            WHEN 'f' THEN 'foreign_table'
            ELSE c.relkind::TEXT
          END,
          'owner', pg_catalog.pg_get_userbyid(c.relowner),
          'rls_enabled', c.relrowsecurity,
          'rls_forced', c.relforcerowsecurity,
          'estimated_rows', c.reltuples::BIGINT,
          'columns', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'column_name', a.attname,
              'ordinal', a.attnum,
              'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
              'not_null', a.attnotnull,
              'default', pg_catalog.pg_get_expr(ad.adbin, ad.adrelid),
              'identity', a.attidentity,
              'generated', a.attgenerated
            ) ORDER BY a.attnum), '[]'::jsonb)
            FROM pg_catalog.pg_attribute a
            LEFT JOIN pg_catalog.pg_attrdef ad
              ON ad.adrelid = a.attrelid
             AND ad.adnum = a.attnum
            WHERE a.attrelid = c.oid
              AND a.attnum > 0
              AND NOT a.attisdropped
          ),
          'policies', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'policy_name', p.polname,
              'command', CASE p.polcmd
                WHEN 'r' THEN 'select'
                WHEN 'a' THEN 'insert'
                WHEN 'w' THEN 'update'
                WHEN 'd' THEN 'delete'
                WHEN '*' THEN 'all'
                ELSE p.polcmd::TEXT
              END,
              'permissive', p.polpermissive,
              'roles', (
                SELECT COALESCE(jsonb_agg(r.rolname ORDER BY r.rolname), '[]'::jsonb)
                FROM unnest(p.polroles) AS role_oid
                JOIN pg_catalog.pg_roles r ON r.oid = role_oid
              ),
              'using_expression', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
              'check_expression', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
            ) ORDER BY p.polname), '[]'::jsonb)
            FROM pg_catalog.pg_policy p
            WHERE p.polrelid = c.oid
          ),
          'triggers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'trigger_name', t.tgname,
              'enabled', t.tgenabled,
              'is_internal', t.tgisinternal,
              'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
            ) ORDER BY t.tgname), '[]'::jsonb)
            FROM pg_catalog.pg_trigger t
            WHERE t.tgrelid = c.oid
              AND NOT t.tgisinternal
          )
        ) AS table_payload
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname NOT LIKE 'pg_%'
          AND ns.nspname <> 'information_schema'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ) table_rows
    ),
    'indexes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'schema_name', schemaname,
        'table_name', tablename,
        'index_name', indexname,
        'definition', indexdef
      ) ORDER BY schemaname, tablename, indexname), '[]'::jsonb)
      FROM pg_catalog.pg_indexes
      WHERE schemaname NOT LIKE 'pg_%'
        AND schemaname <> 'information_schema'
    ),
    'constraints', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'schema_name', ns.nspname,
        'table_name', c.relname,
        'constraint_name', con.conname,
        'constraint_type', con.contype,
        'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
      ) ORDER BY ns.nspname, c.relname, con.conname), '[]'::jsonb)
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname NOT LIKE 'pg_%'
        AND ns.nspname <> 'information_schema'
    ),
    'functions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'schema_name', ns.nspname,
        'function_name', p.proname,
        'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
        'result_type', pg_catalog.pg_get_function_result(p.oid),
        'language', l.lanname,
        'security_definer', p.prosecdef,
        'volatility', p.provolatile,
        'parallel', p.proparallel,
        'owner', pg_catalog.pg_get_userbyid(p.proowner)
      ) ORDER BY ns.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE ns.nspname NOT LIKE 'pg_%'
        AND ns.nspname <> 'information_schema'
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.inspect_database_architecture() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_database_architecture() TO service_role;

COMMENT ON FUNCTION public.inspect_database_architecture() IS
  'Service-role-only metadata inspection RPC for architecture audits. Returns schemas, tables, columns, RLS policies, triggers, functions, indexes, constraints, and extensions.';
