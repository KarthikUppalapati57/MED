BEGIN;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_record_id UUID;
  v_row public.audit_logs%ROWTYPE;
  v_details TEXT;
BEGIN
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'Audit entry must be a JSON object';
  END IF;

  v_org_id := NULLIF(COALESCE(p_entry->>'organization_id', p_entry->>'org_id', p_entry->>'orgId'), '')::UUID;

  IF v_org_id IS NOT NULL THEN
    PERFORM public.assert_org_actor(v_org_id);
  ELSIF auth.role() <> 'service_role' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'organization_id is required for non-platform audit events';
  END IF;

  v_record_id := CASE
    WHEN COALESCE(p_entry->>'record_id', p_entry->>'recordId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN COALESCE(p_entry->>'record_id', p_entry->>'recordId')::UUID
    ELSE NULL
  END;

  v_details := CASE
    WHEN p_entry ? 'details' AND jsonb_typeof(p_entry->'details') IN ('object', 'array') THEN (p_entry->'details')::TEXT
    WHEN p_entry ? 'details' THEN p_entry->>'details'
    ELSE NULL
  END;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address,
    user_agent,
    entity_type,
    entity_id,
    module,
    field_changed,
    old_value,
    new_value,
    user_email,
    details
  ) VALUES (
    v_org_id,
    COALESCE(NULLIF(p_entry->>'user_id', '')::UUID, auth.uid()),
    COALESCE(NULLIF(p_entry->>'action', ''), 'audit'),
    COALESCE(NULLIF(p_entry->>'table_name', ''), NULLIF(p_entry->>'tableName', ''), NULLIF(p_entry->>'entity_type', ''), NULLIF(p_entry->>'entityType', ''), NULLIF(p_entry->>'module', ''), 'system'),
    v_record_id,
    CASE WHEN p_entry ? 'old_data' THEN p_entry->'old_data' WHEN p_entry ? 'oldData' THEN p_entry->'oldData' ELSE NULL END,
    CASE WHEN p_entry ? 'new_data' THEN p_entry->'new_data' WHEN p_entry ? 'newData' THEN p_entry->'newData' ELSE NULL END,
    NULLIF(p_entry->>'ip_address', ''),
    NULLIF(p_entry->>'user_agent', ''),
    COALESCE(NULLIF(p_entry->>'entity_type', ''), NULLIF(p_entry->>'entityType', ''), NULLIF(p_entry->>'action', ''), 'unknown'),
    COALESCE(NULLIF(p_entry->>'entity_id', ''), NULLIF(p_entry->>'entityId', ''), NULLIF(p_entry->>'target_user_id', ''), NULLIF(p_entry->>'record_id', ''), NULLIF(p_entry->>'recordId', '')),
    NULLIF(p_entry->>'module', ''),
    COALESCE(NULLIF(p_entry->>'field_changed', ''), NULLIF(p_entry->>'fieldChanged', '')),
    COALESCE(NULLIF(p_entry->>'old_value', ''), NULLIF(p_entry->>'oldValue', '')),
    COALESCE(NULLIF(p_entry->>'new_value', ''), NULLIF(p_entry->>'newValue', '')),
    COALESCE(NULLIF(p_entry->>'user_email', ''), NULLIF(p_entry->>'userEmail', '')),
    v_details
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_events(p_entries JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry JSONB;
  v_rows JSONB := '[]'::jsonb;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Audit entries must be a JSON array';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_rows := v_rows || public.log_audit_event(v_entry);
  END LOOP;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_audit_events(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_audit_events(JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_audit_event(JSONB) IS
  'Scoped audit writer. Normalizes audit payloads and enforces organization scope for authenticated users.';

COMMIT;
