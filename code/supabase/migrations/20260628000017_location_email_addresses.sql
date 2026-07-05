BEGIN;

CREATE TABLE IF NOT EXISTS public.location_email_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS location_email_addresses_email_active_idx
  ON public.location_email_addresses (lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS location_email_addresses_location_id_idx
  ON public.location_email_addresses (location_id);

CREATE INDEX IF NOT EXISTS location_email_addresses_lower_email_idx
  ON public.location_email_addresses (lower(email));

CREATE OR REPLACE FUNCTION public.set_location_email_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_brand_id uuid;
BEGIN
  NEW.email := lower(btrim(NEW.email));

  IF NEW.email IS NULL OR NEW.email = '' THEN
    RAISE EXCEPTION 'location_email_addresses.email is required';
  END IF;

  SELECT l.organization_id, l.brand_id
    INTO v_organization_id, v_brand_id
  FROM public.locations l
  WHERE l.id = NEW.location_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Location % does not exist', NEW.location_id;
  END IF;

  NEW.organization_id := v_organization_id;
  NEW.brand_id := v_brand_id;
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_location_email_scope ON public.location_email_addresses;
CREATE TRIGGER set_location_email_scope
BEFORE INSERT OR UPDATE ON public.location_email_addresses
FOR EACH ROW
EXECUTE FUNCTION public.set_location_email_scope();

ALTER TABLE public.location_email_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_email_addresses FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'location_email_addresses'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.location_email_addresses',
      policy_record.policyname
    );
  END LOOP;
END $$;

CREATE POLICY location_email_addresses_select
  ON public.location_email_addresses
  FOR SELECT
  USING (
    public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

CREATE POLICY location_email_addresses_insert
  ON public.location_email_addresses
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false)
  );

CREATE POLICY location_email_addresses_update
  ON public.location_email_addresses
  FOR UPDATE
  USING (
    public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, false)
  )
  WITH CHECK (
    public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, false)
  );

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.location_email_addresses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.location_email_addresses TO authenticated;
GRANT ALL ON public.location_email_addresses TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_scope_writable(uuid, uuid, uuid, timestamptz, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated, service_role;

COMMIT;