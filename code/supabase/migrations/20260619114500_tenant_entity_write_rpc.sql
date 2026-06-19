-- Phase: application write routing for schema-per-tenant data.
-- Adds narrow, manifest-whitelisted write RPCs for operational tenant tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_insert_row(
  p_table_name TEXT,
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
  result JSONB;
  sql TEXT;
  insert_columns TEXT[] := ARRAY[]::TEXT[];
  insert_values TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
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

  sanitized_payload := p_payload || jsonb_build_object('organization_id', target_org);

  FOR payload_key IN SELECT key FROM jsonb_each(sanitized_payload)
  LOOP
    IF payload_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
      RAISE EXCEPTION 'Unsafe payload column: %', payload_key;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = target_schema
        AND table_name = p_table_name
        AND column_name = payload_key
        AND is_generated = 'NEVER'
    ) INTO column_exists;

    IF NOT column_exists THEN
      RAISE EXCEPTION 'Payload column does not exist or is generated on %.%: %', target_schema, p_table_name, payload_key;
    END IF;

    insert_columns := insert_columns || format('%I', payload_key);
    insert_values := insert_values || format('source.%I', payload_key);
  END LOOP;

  IF array_length(insert_columns, 1) IS NULL THEN
    RAISE EXCEPTION 'No insert columns provided';
  END IF;

  sql := format(
    'WITH source AS (
       SELECT * FROM jsonb_populate_record(NULL::%I.%I, $1)
     ),
     inserted AS (
       INSERT INTO %I.%I (%s)
       SELECT %s FROM source
       RETURNING *
     )
     SELECT to_jsonb(inserted) FROM inserted',
    target_schema,
    p_table_name,
    target_schema,
    p_table_name,
    array_to_string(insert_columns, ', '),
    array_to_string(insert_values, ', ')
  );

  EXECUTE sql USING sanitized_payload INTO result;
  RETURN result;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.tenant_delete_row(
  p_table_name TEXT,
  p_id TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  target_org UUID;
  route JSONB;
  target_schema TEXT;
  has_deleted_at BOOLEAN;
  affected_count INTEGER := 0;
  sql TEXT;
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe table name: %', p_table_name;
  END IF;

  IF p_id IS NULL OR p_id = '' THEN
    RAISE EXCEPTION 'id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_template_tables WHERE table_name = p_table_name) THEN
    RAISE EXCEPTION 'Table is not tenant-routable: %', p_table_name;
  END IF;

  target_org := COALESCE(p_organization_id, public.get_my_org());
  PERFORM public.assert_tenant_scope(target_org, NULL, NULL);

  route := public.get_tenant_data_route(target_org, NULL, NULL);
  target_schema := COALESCE(route->>'write_target', 'public');

  IF target_schema <> 'public' AND target_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant target schema: %', target_schema;
  END IF;

  IF to_regclass(format('%I.%I', target_schema, p_table_name)) IS NULL THEN
    RAISE EXCEPTION 'Routed table does not exist: %.%', target_schema, p_table_name;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = target_schema AND table_name = p_table_name AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  IF p_soft_delete AND has_deleted_at THEN
    sql := format(
      'UPDATE %I.%I SET deleted_at = now() WHERE id::TEXT = $1 AND organization_id = $2',
      target_schema,
      p_table_name
    );
  ELSE
    sql := format(
      'DELETE FROM %I.%I WHERE id::TEXT = $1 AND organization_id = $2',
      target_schema,
      p_table_name
    );
  END IF;

  EXECUTE sql USING p_id, target_org;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_insert_row(TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tenant_update_row(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tenant_insert_row(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_update_row(TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.tenant_insert_row(TEXT, JSONB) IS
  'Manifest-whitelisted tenant insert RPC. Routes writes to public or tenant schema based on tenant_registry write_mode.';
COMMENT ON FUNCTION public.tenant_update_row(TEXT, TEXT, JSONB) IS
  'Manifest-whitelisted tenant update RPC. Routes writes to public or tenant schema based on tenant_registry write_mode.';
COMMENT ON FUNCTION public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN) IS
  'Manifest-whitelisted tenant delete RPC. Routes deletes to public or tenant schema based on tenant_registry write_mode.';

COMMIT;
