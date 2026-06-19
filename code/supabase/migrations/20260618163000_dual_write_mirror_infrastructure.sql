-- Phase 5: Dual-write mirror infrastructure.
-- Adds opt-in public -> tenant schema write mirroring for provisioned tenants.
-- Existing tenants remain unchanged because tenant_registry.write_mode is still 'public'.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_mirror_tables (
  table_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  has_trigger BOOLEAN NOT NULL DEFAULT false,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_mirror_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_mirror_tables_platform_admin_all" ON public.tenant_mirror_tables;
CREATE POLICY "tenant_mirror_tables_platform_admin_all"
ON public.tenant_mirror_tables
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_mirror_tables_authenticated_read" ON public.tenant_mirror_tables;
CREATE POLICY "tenant_mirror_tables_authenticated_read"
ON public.tenant_mirror_tables
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.set_tenant_mirror_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_mirror_tables_updated_at ON public.tenant_mirror_tables;
CREATE TRIGGER set_tenant_mirror_tables_updated_at
BEFORE UPDATE ON public.tenant_mirror_tables
FOR EACH ROW
EXECUTE FUNCTION public.set_tenant_mirror_tables_updated_at();

INSERT INTO public.tenant_mirror_tables (table_name, enabled, notes)
SELECT table_name, true, 'Mirrored from public writes when tenant write_mode is dual or tenant_schema.'
FROM public.tenant_template_tables
ON CONFLICT (table_name) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  notes = EXCLUDED.notes,
  last_checked_at = now();

CREATE OR REPLACE FUNCTION public.mirror_public_row_to_tenant_schema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row_payload JSONB;
  org_id UUID;
  target_schema TEXT;
  target_status TEXT;
  target_write_mode TEXT;
  target_table REGCLASS;
  id_text TEXT;
  column_list TEXT;
  update_list TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_payload := to_jsonb(OLD);
  ELSE
    row_payload := to_jsonb(NEW);
  END IF;

  org_id := NULLIF(row_payload->>'organization_id', '')::UUID;

  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT tr.schema_name, tr.status, tr.write_mode
  INTO target_schema, target_status, target_write_mode
  FROM public.tenant_registry tr
  WHERE tr.organization_id = org_id;

  IF target_schema IS NULL OR target_status NOT IN ('active', 'migrating') OR target_write_mode NOT IN ('dual', 'tenant_schema') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF target_schema !~ '^tenant_[a-z0-9_]+$' OR length(target_schema) > 63 THEN
    RAISE EXCEPTION 'Unsafe tenant schema name: %', target_schema;
  END IF;

  target_table := to_regclass(format('%I.%I', target_schema, TG_TABLE_NAME));
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'Tenant mirror table %.% does not exist', target_schema, TG_TABLE_NAME;
  END IF;

  id_text := row_payload->>'id';
  IF id_text IS NULL THEN
    RAISE EXCEPTION 'Cannot mirror %.% without id column', target_schema, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    EXECUTE format('DELETE FROM %I.%I WHERE id::text = $1', target_schema, TG_TABLE_NAME)
    USING id_text;
    RETURN OLD;
  END IF;

  SELECT
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ' ORDER BY a.attnum)
  INTO column_list, update_list
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_table
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated = ''
    AND a.attname <> 'id';

  IF column_list IS NULL THEN
    EXECUTE format(
      'INSERT INTO %I.%I (id) SELECT id FROM jsonb_populate_record(NULL::%I.%I, $1) ON CONFLICT (id) DO NOTHING',
      target_schema,
      TG_TABLE_NAME,
      target_schema,
      TG_TABLE_NAME
    )
    USING row_payload;
  ELSE
    EXECUTE format(
      'INSERT INTO %I.%I (id, %s) SELECT id, %s FROM jsonb_populate_record(NULL::%I.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      target_schema,
      TG_TABLE_NAME,
      column_list,
      column_list,
      target_schema,
      TG_TABLE_NAME,
      update_list
    )
    USING row_payload;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.install_tenant_mirror_triggers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  table_record RECORD;
  installed TEXT[] := ARRAY[]::TEXT[];
  skipped JSONB := '[]'::jsonb;
  table_reg REGCLASS;
  has_org_id BOOLEAN;
  has_id BOOLEAN;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can install tenant mirror triggers';
  END IF;

  FOR table_record IN
    SELECT tmt.table_name
    FROM public.tenant_mirror_tables tmt
    WHERE tmt.enabled = true
    ORDER BY tmt.table_name
  LOOP
    table_reg := to_regclass(format('public.%I', table_record.table_name));

    IF table_reg IS NULL THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'reason', 'missing public table'));
      UPDATE public.tenant_mirror_tables SET has_trigger = false, last_checked_at = now(), notes = 'Skipped: missing public table' WHERE table_name = table_record.table_name;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'organization_id' AND attnum > 0 AND NOT attisdropped
    ) INTO has_org_id;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'id' AND attnum > 0 AND NOT attisdropped
    ) INTO has_id;

    IF NOT has_org_id OR NOT has_id THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object('table', table_record.table_name, 'reason', 'requires id and organization_id columns'));
      UPDATE public.tenant_mirror_tables SET has_trigger = false, last_checked_at = now(), notes = 'Skipped: requires id and organization_id columns' WHERE table_name = table_record.table_name;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.%I', table_record.table_name);
    EXECUTE format(
      'CREATE TRIGGER tenant_mirror_dual_write AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mirror_public_row_to_tenant_schema()',
      table_record.table_name
    );

    installed := array_append(installed, table_record.table_name);
    UPDATE public.tenant_mirror_tables SET has_trigger = true, last_checked_at = now(), notes = 'Trigger installed' WHERE table_name = table_record.table_name;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'installed', installed, 'skipped', skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_write_mode(
  p_organization_id UUID,
  p_write_mode TEXT,
  p_read_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can set tenant modes';
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

  IF p_write_mode IN ('dual', 'tenant_schema') AND registry_record.status NOT IN ('active', 'migrating') THEN
    RAISE EXCEPTION 'Tenant schema must be active before enabling % write mode. Current status: %', p_write_mode, registry_record.status;
  END IF;

  UPDATE public.tenant_registry
  SET write_mode = p_write_mode,
      read_mode = COALESCE(p_read_mode, read_mode),
      metadata = metadata || jsonb_build_object('last_mode_change_at', now())
  WHERE organization_id = p_organization_id
  RETURNING * INTO registry_record;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', registry_record.organization_id,
    'schema_name', registry_record.schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode
  );
END;
$$;

-- Install triggers now through migration context. They are inert for all tenants
-- whose write_mode remains 'public'. Runtime reinstall still goes through the
-- permission-checked public.install_tenant_mirror_triggers() function above.
DO $$
DECLARE
  table_record RECORD;
  table_reg REGCLASS;
  has_org_id BOOLEAN;
  has_id BOOLEAN;
BEGIN
  FOR table_record IN
    SELECT tmt.table_name
    FROM public.tenant_mirror_tables tmt
    WHERE tmt.enabled = true
    ORDER BY tmt.table_name
  LOOP
    table_reg := to_regclass(format('public.%I', table_record.table_name));

    IF table_reg IS NULL THEN
      UPDATE public.tenant_mirror_tables SET has_trigger = false, last_checked_at = now(), notes = 'Skipped: missing public table' WHERE table_name = table_record.table_name;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'organization_id' AND attnum > 0 AND NOT attisdropped
    ) INTO has_org_id;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = table_reg AND attname = 'id' AND attnum > 0 AND NOT attisdropped
    ) INTO has_id;

    IF NOT has_org_id OR NOT has_id THEN
      UPDATE public.tenant_mirror_tables SET has_trigger = false, last_checked_at = now(), notes = 'Skipped: requires id and organization_id columns' WHERE table_name = table_record.table_name;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS tenant_mirror_dual_write ON public.%I', table_record.table_name);
    EXECUTE format(
      'CREATE TRIGGER tenant_mirror_dual_write AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mirror_public_row_to_tenant_schema()',
      table_record.table_name
    );

    UPDATE public.tenant_mirror_tables SET has_trigger = true, last_checked_at = now(), notes = 'Trigger installed' WHERE table_name = table_record.table_name;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_public_row_to_tenant_schema() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.install_tenant_mirror_triggers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_tenant_mirror_triggers() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.mirror_public_row_to_tenant_schema() IS
  'Generic trigger function that mirrors public table writes into the provisioned tenant schema only when write_mode is dual or tenant_schema.';
COMMENT ON FUNCTION public.install_tenant_mirror_triggers() IS
  'Installs opt-in dual-write triggers on eligible public operational tables.';
COMMENT ON FUNCTION public.set_tenant_write_mode(UUID, TEXT, TEXT) IS
  'Platform/service helper to set tenant read/write modes after provisioning and validation.';
COMMENT ON TABLE public.tenant_mirror_tables IS
  'Operational tables eligible for public-to-tenant-schema dual-write mirroring.';

COMMIT;