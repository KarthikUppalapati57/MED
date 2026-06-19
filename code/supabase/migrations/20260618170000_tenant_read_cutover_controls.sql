-- Phase 7: Tenant read-switch controls.
-- Adds guarded cutover helpers for moving one tenant at a time from public reads
-- to tenant schema reads after backfill validation. Does not switch any tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_cutover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schema_name TEXT,
  previous_read_mode TEXT,
  new_read_mode TEXT NOT NULL,
  previous_write_mode TEXT,
  new_write_mode TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_cutover_events_status_check CHECK (status IN ('requested', 'applied', 'blocked', 'rolled_back')),
  CONSTRAINT tenant_cutover_events_read_mode_check CHECK (new_read_mode IN ('public', 'dual', 'tenant_schema')),
  CONSTRAINT tenant_cutover_events_write_mode_check CHECK (new_write_mode IS NULL OR new_write_mode IN ('public', 'dual', 'tenant_schema'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_cutover_events_org_created ON public.tenant_cutover_events(organization_id, created_at DESC);

ALTER TABLE public.tenant_cutover_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_cutover_events_platform_admin_all" ON public.tenant_cutover_events;
CREATE POLICY "tenant_cutover_events_platform_admin_all"
ON public.tenant_cutover_events
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_cutover_events_org_read" ON public.tenant_cutover_events;
CREATE POLICY "tenant_cutover_events_org_read"
ON public.tenant_cutover_events
FOR SELECT
USING (organization_id = public.get_my_org());

CREATE OR REPLACE FUNCTION public.get_tenant_cutover_status(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  validation_result JSONB;
  latest_run RECORD;
  blockers JSONB := '[]'::jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR p_organization_id = public.get_my_org()) THEN
    RAISE EXCEPTION 'Insufficient permissions to inspect tenant cutover status';
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  IF registry_record.status NOT IN ('active', 'migrating') THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'tenant registry is not active', 'status', registry_record.status));
  END IF;

  IF registry_record.schema_name IS NULL OR registry_record.schema_name !~ '^tenant_[a-z0-9_]+$' THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'missing or unsafe tenant schema name'));
  ELSIF to_regnamespace(registry_record.schema_name) IS NULL THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'tenant schema does not exist', 'schema_name', registry_record.schema_name));
  END IF;

  SELECT * INTO latest_run
  FROM public.tenant_backfill_runs
  WHERE organization_id = p_organization_id
    AND schema_name = registry_record.schema_name
  ORDER BY started_at DESC
  LIMIT 1;

  IF latest_run.id IS NULL THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'no backfill run found'));
  ELSIF latest_run.status <> 'completed' THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'latest backfill run is not completed', 'run_id', latest_run.id, 'status', latest_run.status));
  END IF;

  validation_result := public.validate_tenant_backfill_counts(p_organization_id);

  IF COALESCE((validation_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('reason', 'count validation failed', 'validation', validation_result));
  END IF;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'schema_name', registry_record.schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode,
    'latest_backfill_run_id', latest_run.id,
    'latest_backfill_status', latest_run.status,
    'validation', validation_result,
    'ready_for_tenant_schema_reads', jsonb_array_length(blockers) = 0,
    'blockers', blockers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_read_mode(
  p_organization_id UUID,
  p_read_mode TEXT,
  p_force BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  cutover_status JSONB;
  ready BOOLEAN;
  event_status TEXT;
  event_id UUID;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF p_read_mode NOT IN ('public', 'dual', 'tenant_schema') THEN
    RAISE EXCEPTION 'Invalid read mode: %', p_read_mode;
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can set tenant read mode';
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  cutover_status := public.get_tenant_cutover_status(p_organization_id);
  ready := COALESCE((cutover_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false);

  IF p_read_mode = 'tenant_schema' AND NOT ready AND NOT p_force THEN
    INSERT INTO public.tenant_cutover_events (
      organization_id,
      schema_name,
      previous_read_mode,
      new_read_mode,
      previous_write_mode,
      new_write_mode,
      status,
      validation
    ) VALUES (
      p_organization_id,
      registry_record.schema_name,
      registry_record.read_mode,
      p_read_mode,
      registry_record.write_mode,
      registry_record.write_mode,
      'blocked',
      cutover_status
    ) RETURNING id INTO event_id;

    RETURN jsonb_build_object(
      'success', false,
      'event_id', event_id,
      'organization_id', p_organization_id,
      'requested_read_mode', p_read_mode,
      'current_read_mode', registry_record.read_mode,
      'blocked', true,
      'cutover_status', cutover_status
    );
  END IF;

  UPDATE public.tenant_registry
  SET read_mode = p_read_mode,
      metadata = metadata || jsonb_build_object('last_read_mode_change_at', now(), 'last_read_mode', p_read_mode)
  WHERE organization_id = p_organization_id
  RETURNING * INTO registry_record;

  event_status := CASE
    WHEN p_read_mode = 'public' THEN 'rolled_back'
    ELSE 'applied'
  END;

  INSERT INTO public.tenant_cutover_events (
    organization_id,
    schema_name,
    previous_read_mode,
    new_read_mode,
    previous_write_mode,
    new_write_mode,
    status,
    validation
  ) VALUES (
    p_organization_id,
    registry_record.schema_name,
    cutover_status->>'read_mode',
    p_read_mode,
    registry_record.write_mode,
    registry_record.write_mode,
    event_status,
    cutover_status
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
    'cutover_status', cutover_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_cutover_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_cutover_status(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_read_mode(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_read_mode(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

COMMENT ON TABLE public.tenant_cutover_events IS
  'Audit trail for tenant read-mode cutover attempts and rollbacks.';
COMMENT ON FUNCTION public.get_tenant_cutover_status(UUID) IS
  'Returns whether a tenant is ready for tenant_schema reads based on provisioning and backfill validation.';
COMMENT ON FUNCTION public.set_tenant_read_mode(UUID, TEXT, BOOLEAN) IS
  'Safely changes tenant read mode. tenant_schema mode is blocked unless validation passes, unless force is true.';

COMMIT;