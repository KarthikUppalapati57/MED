-- Fix lint warning in tenant_update_row after write RPC deployment.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_update_row(
  p_table_name TEXT,
  p_id TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  target_org UUID;
  brand_filter UUID;
  location_filter UUID;
  route JSONB;
  target_schema TEXT;
  sanitized_payload JSONB;
  payload_key TEXT;
  column_exists BOOLEAN;
  has_org_column BOOLEAN;
  set_clauses TEXT[] := ARRAY[]::TEXT[];
  result JSONB;
  sql TEXT;
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
  END IF;

  IF p_id IS NULL OR p_id = '' THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload must be a JSON object';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_template_tables WHERE table_name = p_table_name) THEN
    RAISE EXCEPTION 'Table is not tenant-routable: %', p_table_name;
  END IF;

  target_org := COALESCE(NULLIF(p_payload->>'organization_id', '')::UUID, public.get_my_org());
  brand_filter := NULLIF(p_payload->>'brand_id', '')::UUID;
  location_filter := NULLIF(p_payload->>'location_id', '')::UUID;

  PERFORM public.assert_tenant_scope(target_org, brand_filter, location_filter);

  route := public.get_tenant_data_route(target_org, brand_filter, location_filter);
  target_schema := COALESCE(route->>'write_target', 'public');

  IF target_schema <> 'public' AND target_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant target schema: %', target_schema;
  END IF;

  IF to_regclass(format('%I.%I', target_schema, p_table_name)) IS NULL THEN
    RAISE EXCEPTION 'Routed table does not exist: %.%', target_schema, p_table_name;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = p_table_name AND column_name = 'organization_id'
  ) INTO has_org_column;

  IF NOT has_org_column THEN
    RAISE EXCEPTION 'Tenant-routed table must include organization_id: %', p_table_name;
  END IF;

  sanitized_payload := p_payload - 'id' - 'created_at';

  FOR payload_key IN SELECT key FROM jsonb_each(sanitized_payload)
  LOOP
    IF payload_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe payload column: %', payload_key;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = target_schema AND table_name = p_table_name AND column_name = payload_key
    ) INTO column_exists;

    IF NOT column_exists THEN
      RAISE EXCEPTION 'Payload column does not exist on %.%: %', target_schema, p_table_name, payload_key;
    END IF;

    set_clauses := set_clauses || format('%I = source.%I', payload_key, payload_key);
  END LOOP;

  IF array_length(set_clauses, 1) IS NULL THEN
    RAISE EXCEPTION 'No update columns provided';
  END IF;

  sql := format(
    'WITH source AS (
       SELECT * FROM jsonb_populate_record(NULL::%I.%I, $1)
     ),
     updated AS (
       UPDATE %I.%I AS target
       SET %s
       FROM source
       WHERE target.id::TEXT = $2
         AND target.organization_id = $3
       RETURNING target.*
     )
     SELECT COALESCE((SELECT to_jsonb(updated) FROM updated), ''null''::jsonb)',
    target_schema,
    p_table_name,
    target_schema,
    p_table_name,
    array_to_string(set_clauses, ', ')
  );

  EXECUTE sql USING sanitized_payload, p_id, target_org INTO result;
  RETURN result;
END;
$$;

COMMIT;
