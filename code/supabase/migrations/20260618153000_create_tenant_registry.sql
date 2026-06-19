-- Phase 1: Tenant registry for future schema-per-tenant migration.
-- This does not move operational data yet. It records the authoritative mapping
-- from public.organizations to the future tenant schema name and rollout modes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  read_mode TEXT NOT NULL DEFAULT 'public',
  write_mode TEXT NOT NULL DEFAULT 'public',
  provisioned_at TIMESTAMPTZ,
  migrated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_registry_organization_unique UNIQUE (organization_id),
  CONSTRAINT tenant_registry_schema_unique UNIQUE (schema_name),
  CONSTRAINT tenant_registry_schema_name_safe CHECK (
    schema_name ~ '^tenant_[a-z0-9_]+$'
    AND length(schema_name) <= 63
  ),
  CONSTRAINT tenant_registry_status_check CHECK (
    status IN ('planned', 'provisioning', 'active', 'migrating', 'failed', 'archived')
  ),
  CONSTRAINT tenant_registry_read_mode_check CHECK (
    read_mode IN ('public', 'dual', 'tenant_schema')
  ),
  CONSTRAINT tenant_registry_write_mode_check CHECK (
    write_mode IN ('public', 'dual', 'tenant_schema')
  )
);

CREATE INDEX IF NOT EXISTS idx_tenant_registry_status ON public.tenant_registry(status);
CREATE INDEX IF NOT EXISTS idx_tenant_registry_read_write_mode ON public.tenant_registry(read_mode, write_mode);

CREATE OR REPLACE FUNCTION public.set_tenant_registry_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_registry_updated_at ON public.tenant_registry;
CREATE TRIGGER set_tenant_registry_updated_at
BEFORE UPDATE ON public.tenant_registry
FOR EACH ROW
EXECUTE FUNCTION public.set_tenant_registry_updated_at();

ALTER TABLE public.tenant_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_registry_platform_admin_all" ON public.tenant_registry;
CREATE POLICY "tenant_registry_platform_admin_all"
ON public.tenant_registry
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_registry_org_read" ON public.tenant_registry;
CREATE POLICY "tenant_registry_org_read"
ON public.tenant_registry
FOR SELECT
USING (organization_id = public.get_my_org());

-- Backfill existing organizations into the registry in public-table mode.
-- The suffix keeps names unique even when two org slugs sanitize to the same value.
INSERT INTO public.tenant_registry (organization_id, schema_name, status, read_mode, write_mode)
SELECT
  o.id,
  left(
    'tenant_' ||
    regexp_replace(lower(coalesce(nullif(o.slug, ''), o.name, o.id::text)), '[^a-z0-9]+', '_', 'g') ||
    '_' || replace(left(o.id::text, 8), '-', ''),
    63
  ) AS schema_name,
  'planned',
  'public',
  'public'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_registry tr WHERE tr.organization_id = o.id
);

COMMENT ON TABLE public.tenant_registry IS
  'Authoritative organization-to-tenant-schema mapping for the phased schema-per-tenant migration.';
COMMENT ON COLUMN public.tenant_registry.status IS
  'Provisioning lifecycle: planned, provisioning, active, migrating, failed, archived.';
COMMENT ON COLUMN public.tenant_registry.read_mode IS
  'Current read source for tenant data: public, dual, or tenant_schema.';
COMMENT ON COLUMN public.tenant_registry.write_mode IS
  'Current write target for tenant data: public, dual, or tenant_schema.';

COMMIT;