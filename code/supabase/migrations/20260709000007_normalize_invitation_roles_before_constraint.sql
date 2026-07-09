-- Normalize invitation role aliases before CHECK constraints run.
-- This protects onboarding from stale deployed/cached clients that may still send
-- legacy values like owner/org_owner while keeping canonical stored roles.

CREATE OR REPLACE FUNCTION public.normalize_invitation_role_before_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := lower(trim(COALESCE(NEW.role, '')));
  v_role := replace(replace(v_role, '-', '_'), ' ', '_');

  NEW.role := CASE
    WHEN v_role IN ('tenant', 'tenant_admin', 'tenant_superadmin', 'tenant_super_admin') THEN
      'tenant_super_admin'
    WHEN v_role IN ('owner', 'org_owner', 'organization_owner') AND NEW.organization_id IS NULL THEN
      'tenant_super_admin'
    WHEN v_role IN ('owner', 'org_owner', 'organization_owner', 'org_manager', 'organization_manager') THEN
      'org_manager'
    WHEN v_role IN ('brand_manager') THEN
      'brand_manager'
    WHEN v_role IN ('branch_manager') THEN
      'branch_manager'
    WHEN v_role IN ('manager', 'location_manager') THEN
      'location_manager'
    WHEN v_role IN ('ground_staff', 'staff') THEN
      'ground_staff'
    WHEN v_role IN ('admin', 'platform_admin') THEN
      'platform_admin'
    ELSE
      v_role
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_invitation_role_before_check_trigger ON public.invitations;
CREATE TRIGGER normalize_invitation_role_before_check_trigger
BEFORE INSERT OR UPDATE OF role, organization_id
ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_invitation_role_before_check();

UPDATE public.invitations
SET role = 'tenant_super_admin'
WHERE role = 'org_manager'
  AND organization_id IS NULL
  AND brand_id IS NULL
  AND location_id IS NULL;

UPDATE public.invitations
SET role = CASE
  WHEN lower(trim(role)) IN ('owner', 'org_owner', 'organization_owner')
       AND organization_id IS NULL THEN 'tenant_super_admin'
  WHEN lower(trim(role)) IN ('owner', 'org_owner', 'organization_owner') THEN 'org_manager'
  WHEN lower(trim(role)) = 'manager' THEN 'location_manager'
  WHEN lower(trim(role)) = 'admin' THEN 'platform_admin'
  ELSE lower(trim(role))
END
WHERE lower(trim(role)) IN ('owner', 'org_owner', 'organization_owner', 'manager', 'admin');

NOTIFY pgrst, 'reload schema';
