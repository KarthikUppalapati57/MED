-- 20260719000008: Restrict AutoPay invoice approval
--
-- Closes tracker item 12.8: "Auto Pay invoice approval should be restricted" / "Only Super
-- User can approve Auto Pay invoices." No "Super User" role exists in this app's vocabulary
-- (ground_staff/location_manager/branch_manager/brand_manager/org_manager/tenant_super_admin/
-- platform_admin); is_owner_or_admin() (org_manager, tenant_super_admin, platform_admin) is
-- the existing org-level-and-above tier and matches the tracker's intent of a higher bar than
-- ordinary invoice approval.
--
-- enforce_invoice_approval_authorization (20260628000005_secure_approval_primitives.sql) is
-- the single trigger every approval path already routes through (approve_invoice_with_limit,
-- bulk_process_invoices, or any future direct UPDATE) -- adding the AutoPay check here, next
-- to the existing scope check, means every path gets it for free instead of patching each
-- approval RPC separately.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_vendor_autopay boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      PERFORM public.assert_can_approve_invoice_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );

      SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
      IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
        RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
    OR (NEW.ap_status = 'approved' AND OLD.ap_status IS DISTINCT FROM 'approved') THEN
    PERFORM public.assert_can_approve_invoice_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );

    SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
      RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
