-- Shared public tenancy access-scope hardening.
--
-- Adds explicit organization scope to membership and approval workflow tables
-- that previously relied only on parent joins. This makes RLS simpler, faster,
-- and safer for the shared public-table multi-tenant model.

BEGIN;

-- 1. Explicit organization scope on brand/location memberships.
ALTER TABLE public.brand_members
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.brand_members bm
SET organization_id = b.organization_id
FROM public.brands b
WHERE bm.brand_id = b.brand_id
  AND bm.organization_id IS DISTINCT FROM b.organization_id;

ALTER TABLE public.brand_members
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.location_members
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.location_members lm
SET organization_id = l.organization_id
FROM public.locations l
WHERE lm.location_id = l.id
  AND lm.organization_id IS DISTINCT FROM l.organization_id;

ALTER TABLE public.location_members
  ALTER COLUMN organization_id SET NOT NULL;

-- 2. Explicit organization scope on approval instances.
ALTER TABLE public.approval_instances
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.approval_instances ai
SET organization_id = i.organization_id
FROM public.invoices i
WHERE ai.invoice_id = i.id
  AND ai.organization_id IS DISTINCT FROM i.organization_id;

ALTER TABLE public.approval_instances
  ALTER COLUMN organization_id SET NOT NULL;

-- 3. Keep explicit organization scope aligned with parent records.
CREATE OR REPLACE FUNCTION public.set_brand_member_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_org_id UUID;
BEGIN
  SELECT b.organization_id
  INTO parent_org_id
  FROM public.brands b
  WHERE b.brand_id = NEW.brand_id;

  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'Brand % does not exist', NEW.brand_id;
  END IF;

  IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM parent_org_id THEN
    RAISE EXCEPTION 'brand_members.organization_id must match parent brand organization_id';
  END IF;

  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_brand_member_organization_id ON public.brand_members;
CREATE TRIGGER set_brand_member_organization_id
BEFORE INSERT OR UPDATE OF brand_id, organization_id ON public.brand_members
FOR EACH ROW
EXECUTE FUNCTION public.set_brand_member_organization_id();

CREATE OR REPLACE FUNCTION public.set_location_member_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_org_id UUID;
BEGIN
  SELECT l.organization_id
  INTO parent_org_id
  FROM public.locations l
  WHERE l.id = NEW.location_id;

  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'Location % does not exist', NEW.location_id;
  END IF;

  IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM parent_org_id THEN
    RAISE EXCEPTION 'location_members.organization_id must match parent location organization_id';
  END IF;

  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_location_member_organization_id ON public.location_members;
CREATE TRIGGER set_location_member_organization_id
BEFORE INSERT OR UPDATE OF location_id, organization_id ON public.location_members
FOR EACH ROW
EXECUTE FUNCTION public.set_location_member_organization_id();

CREATE OR REPLACE FUNCTION public.set_approval_instance_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_org_id UUID;
BEGIN
  SELECT i.organization_id
  INTO parent_org_id
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  IF parent_org_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % does not exist', NEW.invoice_id;
  END IF;

  IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM parent_org_id THEN
    RAISE EXCEPTION 'approval_instances.organization_id must match parent invoice organization_id';
  END IF;

  NEW.organization_id := parent_org_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_approval_instance_organization_id ON public.approval_instances;
CREATE TRIGGER set_approval_instance_organization_id
BEFORE INSERT OR UPDATE OF invoice_id, organization_id ON public.approval_instances
FOR EACH ROW
EXECUTE FUNCTION public.set_approval_instance_organization_id();

-- 4. Tenant-scope indexes for shared public tenancy.
CREATE INDEX IF NOT EXISTS idx_brand_members_org_user
  ON public.brand_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_brand_members_org_brand
  ON public.brand_members (organization_id, brand_id);

CREATE INDEX IF NOT EXISTS idx_location_members_org_user
  ON public.location_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_location_members_org_location
  ON public.location_members (organization_id, location_id);

CREATE INDEX IF NOT EXISTS idx_approval_instances_org_invoice
  ON public.approval_instances (organization_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_approval_instances_org_status
  ON public.approval_instances (organization_id, status);

-- 5. RLS policies use explicit organization scope.
DROP POLICY IF EXISTS "Users can view own brand_members" ON public.brand_members;
DROP POLICY IF EXISTS "brand_members_org_read" ON public.brand_members;
CREATE POLICY "brand_members_org_read"
ON public.brand_members
FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "brand_members_org_manage" ON public.brand_members;
CREATE POLICY "brand_members_org_manage"
ON public.brand_members
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
);

DROP POLICY IF EXISTS "Users can view own location_members" ON public.location_members;
DROP POLICY IF EXISTS "location_members_org_read" ON public.location_members;
CREATE POLICY "location_members_org_read"
ON public.location_members
FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "location_members_org_manage" ON public.location_members;
CREATE POLICY "location_members_org_manage"
ON public.location_members
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.get_auth_role() IN ('org_owner', 'owner', 'admin')
  )
);

DROP POLICY IF EXISTS "View instances" ON public.approval_instances;
DROP POLICY IF EXISTS "Manage instances" ON public.approval_instances;
DROP POLICY IF EXISTS "approval_instances_org_read" ON public.approval_instances;
CREATE POLICY "approval_instances_org_read"
ON public.approval_instances
FOR SELECT
USING (
  public.is_platform_admin()
  OR organization_id = public.get_my_org()
);

DROP POLICY IF EXISTS "approval_instances_org_manage" ON public.approval_instances;
CREATE POLICY "approval_instances_org_manage"
ON public.approval_instances
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.is_manager_or_above()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = public.get_my_org()
    AND public.is_manager_or_above()
  )
);

DROP POLICY IF EXISTS "View steps" ON public.approval_steps;
DROP POLICY IF EXISTS "Manage steps" ON public.approval_steps;
DROP POLICY IF EXISTS "approval_steps_org_read" ON public.approval_steps;
CREATE POLICY "approval_steps_org_read"
ON public.approval_steps
FOR SELECT
USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.approval_instances ai
    WHERE ai.id = approval_steps.instance_id
      AND ai.organization_id = public.get_my_org()
  )
);

DROP POLICY IF EXISTS "approval_steps_org_manage" ON public.approval_steps;
CREATE POLICY "approval_steps_org_manage"
ON public.approval_steps
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_manager_or_above()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      WHERE ai.id = approval_steps.instance_id
        AND ai.organization_id = public.get_my_org()
    )
  )
);

-- 6. Permissions are global reference data, not tenant-owned data.
DROP POLICY IF EXISTS "Users can view permissions" ON public.permissions;
DROP POLICY IF EXISTS "permissions_authenticated_read" ON public.permissions;
CREATE POLICY "permissions_authenticated_read"
ON public.permissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "permissions_platform_admin_manage" ON public.permissions;
CREATE POLICY "permissions_platform_admin_manage"
ON public.permissions
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.permissions IS
  'Global RBAC permission catalog. Permissions are reference data, not tenant-owned rows.';
COMMENT ON TABLE public.brand_members IS
  'Brand-level membership assignments with explicit organization_id for shared public-table tenancy.';
COMMENT ON TABLE public.location_members IS
  'Location-level membership assignments with explicit organization_id for shared public-table tenancy.';
COMMENT ON TABLE public.approval_instances IS
  'Running approval workflow instances with explicit organization_id copied from the parent invoice.';

COMMIT;
