-- Phase 11: Pilot tenant cutover controls.
-- Adds explicit pilot tracking and guarded helpers for preparing exactly one tenant
-- before any broad schema-per-tenant rollout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_pilot_cutovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schema_name TEXT,
  status TEXT NOT NULL DEFAULT 'selected',
  selected_by UUID DEFAULT auth.uid(),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prepared_at TIMESTAMPTZ,
  read_cutover_at TIMESTAMPTZ,
  write_cutover_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_pilot_cutovers_status_check CHECK (status IN ('selected', 'preparing', 'prepared', 'read_cutover', 'write_cutover', 'completed', 'aborted', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_pilot_cutovers_one_active_per_org
  ON public.tenant_pilot_cutovers(organization_id)
  WHERE status IN ('selected', 'preparing', 'prepared', 'read_cutover', 'write_cutover');

CREATE INDEX IF NOT EXISTS idx_tenant_pilot_cutovers_status_updated
  ON public.tenant_pilot_cutovers(status, updated_at DESC);

ALTER TABLE public.tenant_pilot_cutovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_pilot_cutovers_platform_admin_all" ON public.tenant_pilot_cutovers;
CREATE POLICY "tenant_pilot_cutovers_platform_admin_all"
ON public.tenant_pilot_cutovers
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_pilot_cutovers_org_read" ON public.tenant_pilot_cutovers;
CREATE POLICY "tenant_pilot_cutovers_org_read"
ON public.tenant_pilot_cutovers
FOR SELECT
USING (organization_id = public.get_my_org());

CREATE OR REPLACE FUNCTION public.set_tenant_pilot_cutover_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_pilot_cutover_updated_at ON public.tenant_pilot_cutovers;
CREATE TRIGGER set_tenant_pilot_cutover_updated_at
BEFORE UPDATE ON public.tenant_pilot_cutovers
FOR EACH ROW
EXECUTE FUNCTION public.set_tenant_pilot_cutover_updated_at();

CREATE OR REPLACE FUNCTION public.select_tenant_pilot_cutover(
  p_organization_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  pilot_record RECORD;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can select a tenant pilot';
  END IF;

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  INSERT INTO public.tenant_pilot_cutovers (organization_id, schema_name, status, notes, validation)
  VALUES (
    p_organization_id,
    registry_record.schema_name,
    'selected',
    p_notes,
    jsonb_build_object('selected_registry', row_to_json(registry_record))
  )
  ON CONFLICT (organization_id) WHERE status IN ('selected', 'preparing', 'prepared', 'read_cutover', 'write_cutover') DO UPDATE
  SET schema_name = EXCLUDED.schema_name,
      notes = COALESCE(EXCLUDED.notes, public.tenant_pilot_cutovers.notes),
      validation = public.tenant_pilot_cutovers.validation || EXCLUDED.validation
  RETURNING * INTO pilot_record;

  RETURN jsonb_build_object(
    'success', true,
    'pilot_id', pilot_record.id,
    'organization_id', pilot_record.organization_id,
    'schema_name', pilot_record.schema_name,
    'status', pilot_record.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_tenant_pilot_cutover(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pilot_record RECORD;
  provision_result JSONB;
  backfill_result JSONB;
  snapshot_result JSONB;
  read_status JSONB;
  registry_record RECORD;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can prepare a tenant pilot';
  END IF;

  PERFORM public.select_tenant_pilot_cutover(p_organization_id, 'Pilot preparation started');

  UPDATE public.tenant_pilot_cutovers
  SET status = 'preparing',
      validation = validation || jsonb_build_object('preparing_at', now())
  WHERE organization_id = p_organization_id
    AND status IN ('selected', 'preparing', 'prepared', 'failed')
  RETURNING * INTO pilot_record;

  provision_result := public.provision_tenant_schema(p_organization_id);
  backfill_result := public.backfill_tenant_schema(p_organization_id);
  snapshot_result := public.refresh_tenant_reporting_snapshot(p_organization_id);
  read_status := public.get_tenant_cutover_status(p_organization_id);

  SELECT * INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = p_organization_id;

  UPDATE public.tenant_pilot_cutovers
  SET status = CASE
        WHEN COALESCE((read_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false) THEN 'prepared'
        ELSE 'failed'
      END,
      schema_name = registry_record.schema_name,
      prepared_at = CASE
        WHEN COALESCE((read_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false) THEN now()
        ELSE prepared_at
      END,
      validation = validation || jsonb_build_object(
        'provision_result', provision_result,
        'backfill_result', backfill_result,
        'snapshot_result', snapshot_result,
        'read_status', read_status,
        'prepared_at', now()
      )
  WHERE id = pilot_record.id
  RETURNING * INTO pilot_record;

  RETURN jsonb_build_object(
    'success', pilot_record.status = 'prepared',
    'pilot_id', pilot_record.id,
    'organization_id', pilot_record.organization_id,
    'schema_name', pilot_record.schema_name,
    'status', pilot_record.status,
    'read_status', read_status,
    'snapshot_result', snapshot_result
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.tenant_pilot_cutovers
  SET status = 'failed',
      validation = validation || jsonb_build_object('error', SQLERRM, 'failed_at', now())
  WHERE organization_id = p_organization_id
    AND status IN ('selected', 'preparing', 'prepared', 'failed');

  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_tenant_pilot_read_cutover(
  p_organization_id UUID,
  p_confirmation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pilot_record RECORD;
  cutover_result JSONB;
BEGIN
  IF p_confirmation <> 'CUTOVER_READ' THEN
    RAISE EXCEPTION 'Read cutover confirmation must be CUTOVER_READ';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can apply pilot read cutover';
  END IF;

  SELECT * INTO pilot_record
  FROM public.tenant_pilot_cutovers
  WHERE organization_id = p_organization_id
    AND status = 'prepared'
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF pilot_record.id IS NULL THEN
    RAISE EXCEPTION 'Pilot must be prepared before read cutover';
  END IF;

  cutover_result := public.set_tenant_read_mode(p_organization_id, 'tenant_schema', false);

  IF COALESCE((cutover_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    UPDATE public.tenant_pilot_cutovers
    SET status = 'failed',
        validation = validation || jsonb_build_object('read_cutover_result', cutover_result)
    WHERE id = pilot_record.id;
    RETURN cutover_result;
  END IF;

  UPDATE public.tenant_pilot_cutovers
  SET status = 'read_cutover',
      read_cutover_at = now(),
      validation = validation || jsonb_build_object('read_cutover_result', cutover_result)
  WHERE id = pilot_record.id;

  PERFORM public.refresh_tenant_reporting_snapshot(p_organization_id);

  RETURN cutover_result || jsonb_build_object('pilot_status', 'read_cutover');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_tenant_pilot_write_cutover(
  p_organization_id UUID,
  p_confirmation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pilot_record RECORD;
  cutover_result JSONB;
BEGIN
  IF p_confirmation <> 'CUTOVER_WRITE' THEN
    RAISE EXCEPTION 'Write cutover confirmation must be CUTOVER_WRITE';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can apply pilot write cutover';
  END IF;

  SELECT * INTO pilot_record
  FROM public.tenant_pilot_cutovers
  WHERE organization_id = p_organization_id
    AND status = 'read_cutover'
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF pilot_record.id IS NULL THEN
    RAISE EXCEPTION 'Pilot must complete read cutover before write cutover';
  END IF;

  cutover_result := public.set_tenant_write_mode(p_organization_id, 'tenant_schema', NULL, false);

  IF COALESCE((cutover_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    UPDATE public.tenant_pilot_cutovers
    SET status = 'failed',
        validation = validation || jsonb_build_object('write_cutover_result', cutover_result)
    WHERE id = pilot_record.id;
    RETURN cutover_result;
  END IF;

  UPDATE public.tenant_pilot_cutovers
  SET status = 'write_cutover',
      write_cutover_at = now(),
      validation = validation || jsonb_build_object('write_cutover_result', cutover_result)
  WHERE id = pilot_record.id;

  PERFORM public.refresh_tenant_reporting_snapshot(p_organization_id);

  RETURN cutover_result || jsonb_build_object('pilot_status', 'write_cutover');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tenant_pilot_cutover(
  p_organization_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pilot_record RECORD;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can complete a tenant pilot';
  END IF;

  UPDATE public.tenant_pilot_cutovers
  SET status = 'completed',
      completed_at = now(),
      notes = COALESCE(p_notes, notes)
  WHERE organization_id = p_organization_id
    AND status = 'write_cutover'
  RETURNING * INTO pilot_record;

  IF pilot_record.id IS NULL THEN
    RAISE EXCEPTION 'Pilot must be in write_cutover status before completion';
  END IF;

  RETURN jsonb_build_object('success', true, 'pilot_id', pilot_record.id, 'status', pilot_record.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.abort_tenant_pilot_cutover(
  p_organization_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pilot_record RECORD;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can abort a tenant pilot';
  END IF;

  UPDATE public.tenant_pilot_cutovers
  SET status = 'aborted',
      aborted_at = now(),
      notes = COALESCE(p_notes, notes)
  WHERE organization_id = p_organization_id
    AND status IN ('selected', 'preparing', 'prepared', 'read_cutover', 'write_cutover', 'failed')
  RETURNING * INTO pilot_record;

  IF pilot_record.id IS NULL THEN
    RAISE EXCEPTION 'No active pilot found for organization %', p_organization_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'pilot_id', pilot_record.id, 'status', pilot_record.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_pilot_cutovers(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE (
  pilot_id UUID,
  organization_id UUID,
  organization_name TEXT,
  schema_name TEXT,
  status TEXT,
  read_mode TEXT,
  write_mode TEXT,
  ready_for_tenant_schema_reads BOOLEAN,
  ready_for_tenant_schema_writes BOOLEAN,
  blocker_count INTEGER,
  selected_at TIMESTAMPTZ,
  prepared_at TIMESTAMPTZ,
  read_cutover_at TIMESTAMPTZ,
  write_cutover_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  aborted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' THEN
    RETURN QUERY
    SELECT
      pc.id,
      pc.organization_id,
      o.name,
      pc.schema_name,
      pc.status,
      trs.read_mode,
      trs.write_mode,
      COALESCE(trs.ready_for_tenant_schema_reads, false),
      COALESCE(trs.ready_for_tenant_schema_writes, false),
      COALESCE(jsonb_array_length(trs.blockers), 0)::INTEGER,
      pc.selected_at,
      pc.prepared_at,
      pc.read_cutover_at,
      pc.write_cutover_at,
      pc.completed_at,
      pc.aborted_at,
      pc.updated_at,
      pc.notes
    FROM public.tenant_pilot_cutovers pc
    LEFT JOIN public.organizations o ON o.id = pc.organization_id
    LEFT JOIN public.tenant_reporting_snapshots trs ON trs.organization_id = pc.organization_id
    WHERE p_organization_id IS NULL OR pc.organization_id = p_organization_id
    ORDER BY pc.updated_at DESC;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.organization_id,
    o.name,
    pc.schema_name,
    pc.status,
    trs.read_mode,
    trs.write_mode,
    COALESCE(trs.ready_for_tenant_schema_reads, false),
    COALESCE(trs.ready_for_tenant_schema_writes, false),
    COALESCE(jsonb_array_length(trs.blockers), 0)::INTEGER,
    pc.selected_at,
    pc.prepared_at,
    pc.read_cutover_at,
    pc.write_cutover_at,
    pc.completed_at,
    pc.aborted_at,
    pc.updated_at,
    pc.notes
  FROM public.tenant_pilot_cutovers pc
  LEFT JOIN public.organizations o ON o.id = pc.organization_id
  LEFT JOIN public.tenant_reporting_snapshots trs ON trs.organization_id = pc.organization_id
  WHERE pc.organization_id = public.get_my_org()
    AND (p_organization_id IS NULL OR pc.organization_id = p_organization_id)
  ORDER BY pc.updated_at DESC;
END;
$$;

REVOKE ALL ON TABLE public.tenant_pilot_cutovers FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.tenant_pilot_cutovers TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_pilot_cutovers TO service_role;

REVOKE ALL ON FUNCTION public.select_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_tenant_pilot_cutover(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_tenant_pilot_cutover(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_pilot_read_cutover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_tenant_pilot_read_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_pilot_write_cutover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_tenant_pilot_write_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.abort_tenant_pilot_cutover(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abort_tenant_pilot_cutover(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_pilot_cutovers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_pilot_cutovers(UUID) TO authenticated, service_role;

COMMENT ON TABLE public.tenant_pilot_cutovers IS
  'Tracks explicitly selected pilot tenants for the schema-per-tenant cutover.';
COMMENT ON FUNCTION public.prepare_tenant_pilot_cutover(UUID) IS
  'Provision, backfill, validate, and refresh reporting for one selected pilot tenant. Does not switch read/write modes.';
COMMENT ON FUNCTION public.apply_tenant_pilot_read_cutover(UUID, TEXT) IS
  'Applies tenant_schema reads for a prepared pilot tenant. Requires confirmation text CUTOVER_READ.';
COMMENT ON FUNCTION public.apply_tenant_pilot_write_cutover(UUID, TEXT) IS
  'Applies tenant_schema writes for a pilot tenant after read cutover. Requires confirmation text CUTOVER_WRITE.';

COMMIT;