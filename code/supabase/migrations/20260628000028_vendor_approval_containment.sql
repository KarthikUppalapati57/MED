BEGIN;

CREATE OR REPLACE FUNCTION public.assert_can_approve_vendor_scope(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_auth_org uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_role := public.get_auth_role();
  v_auth_org := public.get_auth_org();

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF p_organization_id IS NULL OR v_auth_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization vendor approval denied';
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN;
  END IF;

  IF v_role = 'branch_manager'
     AND p_brand_id IS NOT NULL
     AND public.reference_scope_writable(
       p_organization_id,
       p_brand_id,
       NULL,
       NULL,
       'branch_manager'
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Vendor approval denied for role % outside accessible brand scope', v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_vendor_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    PERFORM public.assert_can_approve_vendor_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vendor_approval_authorization ON public.vendors;
CREATE TRIGGER enforce_vendor_approval_authorization
BEFORE UPDATE OF approval_status ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vendor_approval_authorization();

REVOKE EXECUTE ON FUNCTION public.assert_can_approve_vendor_scope(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_can_approve_vendor_scope(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
