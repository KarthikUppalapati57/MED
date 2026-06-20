-- Verify the new-tenant auto-provisioning trigger on the live database.
-- This creates a temporary organization, asserts tenant_schema routing, then
-- removes the organization and schema before the migration commits.

BEGIN;

DO $$
DECLARE
  validation_org_id UUID := '00000000-0000-4000-8000-000000011000';
  validation_slug TEXT := 'restops-trigger-validation';
  registry_record RECORD;
BEGIN
  SELECT tr.schema_name
  INTO registry_record
  FROM public.tenant_registry tr
  JOIN public.organizations o ON o.id = tr.organization_id
  WHERE o.slug = validation_slug
  LIMIT 1;

  IF registry_record.schema_name IS NOT NULL THEN
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', registry_record.schema_name);
  END IF;

  DELETE FROM public.organizations WHERE id = validation_org_id OR slug = validation_slug;

  INSERT INTO public.organizations (id, name, slug)
  VALUES (validation_org_id, 'RestOps Trigger Validation', validation_slug);

  SELECT *
  INTO registry_record
  FROM public.tenant_registry
  WHERE organization_id = validation_org_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Auto-provision validation failed: tenant_registry row was not created';
  END IF;

  IF registry_record.status <> 'active' THEN
    RAISE EXCEPTION 'Auto-provision validation failed: expected status active, got %', registry_record.status;
  END IF;

  IF registry_record.read_mode <> 'tenant_schema' OR registry_record.write_mode <> 'tenant_schema' THEN
    RAISE EXCEPTION 'Auto-provision validation failed: expected tenant_schema modes, got read=% write=%', registry_record.read_mode, registry_record.write_mode;
  END IF;

  IF registry_record.metadata->>'new_tenant_schema_from_day_one' <> 'true' THEN
    RAISE EXCEPTION 'Auto-provision validation failed: metadata flag missing';
  END IF;

  IF to_regnamespace(registry_record.schema_name) IS NULL THEN
    RAISE EXCEPTION 'Auto-provision validation failed: schema % does not exist', registry_record.schema_name;
  END IF;

  IF to_regclass(format('%I.products', registry_record.schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Auto-provision validation failed: %.products does not exist', registry_record.schema_name;
  END IF;

  DELETE FROM public.organizations WHERE id = validation_org_id;
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', registry_record.schema_name);
END;
$$;

COMMIT;
