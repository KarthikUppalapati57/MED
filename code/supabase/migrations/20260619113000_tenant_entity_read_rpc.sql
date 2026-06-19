-- Phase: application read routing for schema-per-tenant data.
-- Provides a narrow, manifest-whitelisted read RPC for tenant operational tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_select_rows(
  p_table_name TEXT,
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_gte JSONB DEFAULT '{}'::jsonb,
  p_lte JSONB DEFAULT '{}'::jsonb,
  p_search_column TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_order_by TEXT DEFAULT NULL,
  p_ascending BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT NULL,
  p_include_deleted BOOLEAN DEFAULT FALSE,
  p_single BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  caller_org UUID;
  target_org UUID;
  brand_filter UUID;
  location_filter UUID;
  route JSONB;
  source_schema TEXT;
  where_clauses TEXT[] := ARRAY[]::TEXT[];
  order_clause TEXT := '';
  limit_clause TEXT := '';
  offset_clause TEXT := '';
  sql TEXT;
  result JSONB;
  filter_key TEXT;
  filter_value JSONB;
  text_value TEXT;
  column_exists BOOLEAN;
  has_org_column BOOLEAN;
  has_deleted_at BOOLEAN;
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_template_tables ttt
    WHERE ttt.table_name = p_table_name
  ) THEN
    RAISE EXCEPTION 'Table is not tenant-routable: %', p_table_name;
  END IF;

  caller_org := public.get_my_org();
  target_org := COALESCE(NULLIF(p_filters->>'organization_id', '')::UUID, caller_org);
  brand_filter := NULLIF(p_filters->>'brand_id', '')::UUID;
  location_filter := NULLIF(p_filters->>'location_id', '')::UUID;

  PERFORM public.assert_tenant_scope(target_org, brand_filter, location_filter);

  route := public.get_tenant_data_route(target_org, brand_filter, location_filter);
  source_schema := COALESCE(route->>'read_source', 'public');

  IF source_schema <> 'public' AND source_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant source schema: %', source_schema;
  END IF;

  IF to_regclass(format('%I.%I', source_schema, p_table_name)) IS NULL THEN
    RAISE EXCEPTION 'Routed table does not exist: %.%', source_schema, p_table_name;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = source_schema
      AND table_name = p_table_name
      AND column_name = 'organization_id'
  ) INTO has_org_column;

  IF NOT has_org_column THEN
    RAISE EXCEPTION 'Tenant-routed table must include organization_id: %', p_table_name;
  END IF;

  where_clauses := where_clauses || format('%I = %L', 'organization_id', target_org::TEXT);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = source_schema
      AND table_name = p_table_name
      AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  IF has_deleted_at AND NOT p_include_deleted THEN
    where_clauses := where_clauses || format('%I IS NULL', 'deleted_at');
  END IF;

  FOR filter_key, filter_value IN SELECT key, value FROM jsonb_each(COALESCE(p_filters, '{}'::jsonb))
  LOOP
    IF filter_key = 'organization_id' THEN
      CONTINUE;
    END IF;
    IF filter_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe filter column: %', filter_key;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = source_schema
        AND table_name = p_table_name
        AND column_name = filter_key
    ) INTO column_exists;

    IF NOT column_exists THEN
      RAISE EXCEPTION 'Filter column does not exist on %.%: %', source_schema, p_table_name, filter_key;
    END IF;

    IF jsonb_typeof(filter_value) = 'null' THEN
      where_clauses := where_clauses || format('%I IS NULL', filter_key);
    ELSE
      text_value := trim(both '"' from filter_value::TEXT);
      where_clauses := where_clauses || format('%I = %L', filter_key, text_value);
    END IF;
  END LOOP;

  FOR filter_key, filter_value IN SELECT key, value FROM jsonb_each(COALESCE(p_gte, '{}'::jsonb))
  LOOP
    IF filter_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe gte column: %', filter_key;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = source_schema AND table_name = p_table_name AND column_name = filter_key
    ) INTO column_exists;
    IF NOT column_exists THEN
      RAISE EXCEPTION 'GTE column does not exist on %.%: %', source_schema, p_table_name, filter_key;
    END IF;
    IF jsonb_typeof(filter_value) <> 'null' THEN
      text_value := trim(both '"' from filter_value::TEXT);
      where_clauses := where_clauses || format('%I >= %L', filter_key, text_value);
    END IF;
  END LOOP;

  FOR filter_key, filter_value IN SELECT key, value FROM jsonb_each(COALESCE(p_lte, '{}'::jsonb))
  LOOP
    IF filter_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe lte column: %', filter_key;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = source_schema AND table_name = p_table_name AND column_name = filter_key
    ) INTO column_exists;
    IF NOT column_exists THEN
      RAISE EXCEPTION 'LTE column does not exist on %.%: %', source_schema, p_table_name, filter_key;
    END IF;
    IF jsonb_typeof(filter_value) <> 'null' THEN
      text_value := trim(both '"' from filter_value::TEXT);
      where_clauses := where_clauses || format('%I <= %L', filter_key, text_value);
    END IF;
  END LOOP;

  IF p_search IS NOT NULL AND p_search_column IS NOT NULL AND p_search_column <> '' THEN
    IF p_search_column !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe search column: %', p_search_column;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = source_schema AND table_name = p_table_name AND column_name = p_search_column
    ) INTO column_exists;
    IF NOT column_exists THEN
      RAISE EXCEPTION 'Search column does not exist on %.%: %', source_schema, p_table_name, p_search_column;
    END IF;
    where_clauses := where_clauses || format('%I::TEXT ILIKE %L', p_search_column, '%' || p_search || '%');
  END IF;

  IF p_order_by IS NOT NULL AND p_order_by <> '' THEN
    IF p_order_by !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe order column: %', p_order_by;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = source_schema AND table_name = p_table_name AND column_name = p_order_by
    ) INTO column_exists;
    IF column_exists THEN
      order_clause := format(' ORDER BY %I %s', p_order_by, CASE WHEN p_ascending THEN 'ASC' ELSE 'DESC' END);
    END IF;
  END IF;

  IF p_single THEN
    limit_clause := ' LIMIT 1';
  ELSIF p_limit IS NOT NULL THEN
    limit_clause := format(' LIMIT %s', LEAST(GREATEST(p_limit, 1), 500));
  END IF;

  IF p_offset IS NOT NULL AND p_offset > 0 THEN
    offset_clause := format(' OFFSET %s', LEAST(p_offset, 100000));
  END IF;

  IF p_single THEN
    sql := format(
      'SELECT COALESCE((SELECT to_jsonb(t) FROM (SELECT * FROM %I.%I WHERE %s%s%s%s) t), ''null''::jsonb)',
      source_schema,
      p_table_name,
      array_to_string(where_clauses, ' AND '),
      order_clause,
      limit_clause,
      offset_clause
    );
  ELSE
    sql := format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (SELECT * FROM %I.%I WHERE %s%s%s%s) t',
      source_schema,
      p_table_name,
      array_to_string(where_clauses, ' AND '),
      order_clause,
      limit_clause,
      offset_clause
    );
  END IF;

  EXECUTE sql INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN) IS
  'Manifest-whitelisted tenant read RPC. Routes simple full-row reads to public or tenant schema based on tenant_registry read_mode.';

COMMIT;
