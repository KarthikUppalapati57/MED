-- Freeze schema-per-tenant as the default onboarding path.
--
-- MEVS is standardizing on shared public-table multi-tenancy for the core
-- platform. New organizations should be registered in tenant_registry for
-- observability, but must not receive dedicated tenant schemas by default.
--
-- Existing tenant schemas are intentionally left in place for audit and
-- back-migration. Do not drop tenant schemas until their data has been merged
-- into canonical public tables and independently verified.

BEGIN;

DROP TRIGGER IF EXISTS auto_provision_new_tenant_schema ON public.organizations;
DROP FUNCTION IF EXISTS public.auto_provision_new_tenant_schema();

CREATE OR REPLACE FUNCTION public.auto_register_new_tenant_shared_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  generated_schema_name TEXT;
BEGIN
  generated_schema_name := public.generate_tenant_schema_name(NEW.id, NEW.slug, NEW.name);

  INSERT INTO public.tenant_registry (
    organization_id,
    schema_name,
    status,
    read_mode,
    write_mode,
    metadata
  )
  VALUES (
    NEW.id,
    generated_schema_name,
    'active',
    'public',
    'public',
    jsonb_build_object(
      'tenancy_model', 'shared_public',
      'registered_by', 'auto_register_new_tenant_shared_public',
      'schema_per_tenant_default_disabled_at', now()
    )
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET status = CASE
        WHEN public.tenant_registry.status = 'archived' THEN public.tenant_registry.status
        ELSE 'active'
      END,
      read_mode = 'public',
      write_mode = 'public',
      metadata = public.tenant_registry.metadata || jsonb_build_object(
        'tenancy_model', 'shared_public',
        'registered_by', 'auto_register_new_tenant_shared_public',
        'schema_per_tenant_default_disabled_at', now(),
        'previous_read_mode', public.tenant_registry.read_mode,
        'previous_write_mode', public.tenant_registry.write_mode
      )
  RETURNING * INTO registry_record;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_register_new_tenant_shared_public
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.auto_register_new_tenant_shared_public();

REVOKE ALL ON FUNCTION public.auto_register_new_tenant_shared_public() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.auto_register_new_tenant_shared_public() IS
  'Registers new organizations as shared-public tenants. Does not create tenant schemas.';
COMMENT ON TRIGGER auto_register_new_tenant_shared_public ON public.organizations IS
  'Registers new organizations in tenant_registry with public read/write modes for the shared multi-tenant core.';

COMMENT ON TABLE public.tenant_registry IS
  'Tenant control-plane registry. MEVS core tenancy is shared public tables; schema-per-tenant entries are deprecated and retained only for audit/back-migration.';
COMMENT ON COLUMN public.tenant_registry.schema_name IS
  'Historical or reserved tenant schema name. For shared-public tenants this is not an active data location.';
COMMENT ON COLUMN public.tenant_registry.read_mode IS
  'Core default is public. tenant_schema/dual are deprecated migration states and must not be used for new tenants.';
COMMENT ON COLUMN public.tenant_registry.write_mode IS
  'Core default is public. tenant_schema/dual are deprecated migration states and must not be used for new tenants.';

COMMIT;
