-- Phase 8: Tenant write-switch controls.
-- Hardens write-mode cutover so tenant_schema writes are blocked until read cutover
-- and validation are ready. Does not switch any tenant.

BEGIN;

ALTER TABLE public.tenant_cutover_events
  ADD COLUMN IF NOT EXISTS cutover_type TEXT NOT NULL DEFAULT 'read';

ALTER TABLE public.tenant_cutover_events
  DROP CONSTRAINT IF EXISTS tenant_cutover_events_cutover_type_check;

ALTER TABLE public.tenant_cutover_events
  ADD CONSTRAINT tenant_cutover_events_cutover_type_check
  CHECK (cutover_type IN ('read', 'write'));

CREATE INDEX IF NOT EXISTS idx_tenant_cutover_events_type_org_created
  ON public.tenant_cutover_events(cutover_type, organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_tenant_write_cutover_status(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  read_status JSONB;
  blockers JSONB := '[]'::jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR p_organization_id = public.get_my_org()) THEN
    RAISE EXCEPTION 'Insufficient permissions to inspect tenant write cutover status';
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  read_status := public.get_tenant_cutover_status(p_organization_id);

  IF COALESCE((read_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false) IS NOT TRUE THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'tenant is not ready for tenant schema reads', 'read_status', read_status));
  END IF;

  IF registry_record.read_mode <> 'tenant_schema' THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'read_mode must be tenant_schema before tenant_schema writes', 'read_mode', registry_record.read_mode));
  END IF;

  IF registry_record.status NOT IN ('active', 'migrating') THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'tenant registry is not active', 'status', registry_record.status));
  END IF;

  IF registry_record.schema_name IS NULL OR registry_record.schema_name !~ '^tenant_[a-z0-9_]+$' THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'missing or unsafe tenant schema name'));
  ELSIF to_regnamespace(registry_record.schema_name) IS NULL THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'tenant schema does not exist', 'schema_name', registry_record.schema_name));
  END IF;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'schema_name', registry_record.schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode,
    'read_status', read_status,
    'ready_for_tenant_schema_writes', jsonb_array_length(blockers) = 0,
    'blockers', blockers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_write_mode(
  p_organization_id UUID,
  p_write_mode TEXT,
  p_read_mode TEXT DEFAULT NULL,
  p_force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  previous_read_mode TEXT;
  previous_write_mode TEXT;
  write_status JSONB;
  ready BOOLEAN;
  event_status TEXT;
  event_id UUID;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can set tenant write mode';
  END IF;

  IF p_write_mode NOT IN ('public', 'dual', 'tenant_schema') THEN
    RAISE EXCEPTION 'Invalid write mode: %', p_write_mode;
  END IF;

  IF p_read_mode IS NOT NULL AND p_read_mode NOT IN ('public', 'dual', 'tenant_schema') THEN
    RAISE EXCEPTION 'Invalid read mode: %', p_read_mode;
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  previous_read_mode := registry_record.read_mode;
  previous_write_mode := registry_record.write_mode;
  write_status := public.get_tenant_write_cutover_status(p_organization_id);
  ready := COALESCE((write_status->>'ready_for_tenant_schema_writes')::BOOLEAN, false);

  IF p_write_mode = 'tenant_schema' AND NOT ready AND NOT p_force THEN
    INSERT INTO public.tenant_cutover_events (
      cutover_type,
      organization_id,
      schema_name,
      previous_read_mode,
      new_read_mode,
      previous_write_mode,
      new_write_mode,
      status,
      validation
    ) VALUES (
      'write',
      p_organization_id,
      registry_record.schema_name,
      previous_read_mode,
      COALESCE(p_read_mode, previous_read_mode),
      previous_write_mode,
      p_write_mode,
      'blocked',
      write_status
    ) RETURNING id INTO event_id;

    RETURN jsonb_build_object(
      'success', false,
      'event_id', event_id,
      'organization_id', p_organization_id,
      'requested_write_mode', p_write_mode,
      'current_write_mode', previous_write_mode,
      'blocked', true,
      'write_cutover_status', write_status
    );
  END IF;

  IF p_write_mode IN ('dual', 'tenant_schema') AND registry_record.status NOT IN ('active', 'migrating') THEN
    RAISE EXCEPTION 'Tenant schema must be active before enabling % write mode. Current status: %', p_write_mode, registry_record.status;
  END IF;

  UPDATE public.tenant_registry
  SET write_mode = p_write_mode,
      read_mode = COALESCE(p_read_mode, read_mode),
      metadata = metadata || jsonb_build_object(
        'last_write_mode_change_at', now(),
        'last_write_mode', p_write_mode,
        'last_mode_change_at', now()
      )
  WHERE organization_id = p_organization_id
  RETURNING * INTO registry_record;

  event_status := CASE
    WHEN p_write_mode = 'public' THEN 'rolled_back'
    ELSE 'applied'
  END;

  INSERT INTO public.tenant_cutover_events (
    cutover_type,
    organization_id,
    schema_name,
    previous_read_mode,
    new_read_mode,
    previous_write_mode,
    new_write_mode,
    status,
    validation
  ) VALUES (
    'write',
    p_organization_id,
    registry_record.schema_name,
    previous_read_mode,
    registry_record.read_mode,
    previous_write_mode,
    p_write_mode,
    event_status,
    write_status
  ) RETURNING id INTO event_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', event_id,
    'organization_id', registry_record.organization_id,
    'schema_name', registry_record.schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode,
    'forced', p_force,
    'write_cutover_status', write_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_write_cutover_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_write_cutover_status(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_tenant_write_cutover_status(UUID) IS
  'Returns whether a tenant is ready for tenant_schema writes. Requires tenant_schema reads and validation readiness.';
COMMENT ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN) IS
  'Safely changes tenant write mode. tenant_schema mode is blocked unless read cutover and validation pass, unless force is true.';

COMMIT;