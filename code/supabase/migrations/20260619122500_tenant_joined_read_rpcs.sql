-- Tenant-safe adapters for joined reads that cannot use the generic row RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_select_vendor_statements(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  route JSONB;
  source_schema TEXT;
  result JSONB;
  sql TEXT;
BEGIN
  PERFORM public.assert_tenant_scope(p_organization_id, NULL, NULL);

  route := public.get_tenant_data_route(p_organization_id, NULL, NULL);
  source_schema := COALESCE(route->>'read_source', 'public');

  IF source_schema <> 'public' AND source_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant source schema: %', source_schema;
  END IF;

  IF to_regclass(format('%I.vendor_statements', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed vendor_statements table does not exist: %', source_schema;
  END IF;

  IF to_regclass(format('%I.vendor_statement_lines', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed vendor_statement_lines table does not exist: %', source_schema;
  END IF;

  IF to_regclass(format('%I.vendors', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed vendors table does not exist: %', source_schema;
  END IF;

  sql := format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(statement_row)), ''[]''::jsonb)
     FROM (
       SELECT
         vs.*,
         jsonb_build_object(''name'', v.name) AS vendor,
         COALESCE((
           SELECT jsonb_agg(to_jsonb(vsl) ORDER BY vsl.created_at ASC)
           FROM %I.vendor_statement_lines vsl
           WHERE vsl.statement_id = vs.id
         ), ''[]''::jsonb) AS lines
       FROM %I.vendor_statements vs
       LEFT JOIN %I.vendors v ON v.id = vs.vendor_id
       WHERE vs.organization_id = $1
       ORDER BY vs.statement_date DESC
     ) statement_row',
    source_schema,
    source_schema,
    source_schema
  );

  EXECUTE sql USING p_organization_id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_select_webhook_delivery_logs(
  p_organization_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  route JSONB;
  source_schema TEXT;
  result JSONB;
  safe_limit INTEGER;
  sql TEXT;
BEGIN
  PERFORM public.assert_tenant_scope(p_organization_id, NULL, NULL);

  route := public.get_tenant_data_route(p_organization_id, NULL, NULL);
  source_schema := COALESCE(route->>'read_source', 'public');
  safe_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  IF source_schema <> 'public' AND source_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant source schema: %', source_schema;
  END IF;

  IF to_regclass(format('%I.webhook_delivery_logs', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed webhook_delivery_logs table does not exist: %', source_schema;
  END IF;

  IF to_regclass(format('%I.webhook_events_queue', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed webhook_events_queue table does not exist: %', source_schema;
  END IF;

  IF to_regclass(format('%I.webhook_endpoints', source_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed webhook_endpoints table does not exist: %', source_schema;
  END IF;

  sql := format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(log_row)), ''[]''::jsonb)
     FROM (
       SELECT
         wdl.*,
         jsonb_build_object(''event_type'', weq.event_type, ''payload'', weq.payload) AS webhook_events_queue,
         jsonb_build_object(''url'', we.url) AS webhook_endpoints
       FROM %I.webhook_delivery_logs wdl
       JOIN %I.webhook_endpoints we ON we.id = wdl.endpoint_id
       LEFT JOIN %I.webhook_events_queue weq ON weq.id = wdl.event_id
       WHERE we.organization_id = $1
       ORDER BY wdl.created_at DESC
       LIMIT %s
     ) log_row',
    source_schema,
    source_schema,
    source_schema,
    safe_limit
  );

  EXECUTE sql USING p_organization_id INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_select_vendor_statements(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_select_vendor_statements(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tenant_select_webhook_delivery_logs(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_select_webhook_delivery_logs(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.tenant_select_vendor_statements(UUID) IS
  'Tenant-routed joined read for vendor statements with vendor display data and statement lines.';

COMMENT ON FUNCTION public.tenant_select_webhook_delivery_logs(UUID, INTEGER) IS
  'Tenant-routed joined read for webhook delivery logs through scoped webhook endpoints.';

COMMIT;