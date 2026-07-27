-- Makes the invoice-approval dollar-limit check in enforce_invoice_approval_authorization()
-- unconditional. It was gated behind a per-org `enforceApprovalLimits` setting
-- (operational_settings, category 'payments') that defaults off, and confirmed live: zero of
-- the 12 production organizations have ever turned it on. Combined with approval_policies being
-- empty (a separate, deliberately untouched issue -- that table and
-- evaluate_invoice_approval_policy/execute_approval_step are left as dead/unused, per decision),
-- every invoice on every org has been auto-approved regardless of amount -- the hierarchy-based
-- per-user invoice_approval_limit check, correctly cascaded via update_user_approval_limit
-- (org_manager -> branch_manager -> location_manager, each capped at their own superior's
-- limit), has never actually run. requireSeparateApprover is untouched: still opt-in, still
-- defaults off, unrelated setting.
--
-- Companion data fix, required for this not to be an outage: every real profile on production
-- currently has invoice_approval_limit = 0 and has_unlimited_approval = false, in every role,
-- including platform_admin/tenant_super_admin -- confirmed via direct query. Making the check
-- unconditional against that data as-is would mean nobody, including platform admins, could
-- approve anything. Grants has_unlimited_approval = true to platform_admin/tenant_super_admin
-- only -- the same two roles assert_can_approve_invoice_scope() already treats as an
-- unconditional bypass, so this extends an existing exception rather than creating a new one.
-- org_manager/branch_manager/location_manager/ground_staff are deliberately left at their
-- current $0 limit -- real numbers for those tiers are a business decision. There is already a
-- working admin UI for it (UserManagement.jsx:272, calls update_user_approval_limit) -- it has
-- simply never been used, since enforcement has never been live until this migration. Until an
-- org sets real limits there, only platform_admin/tenant_super_admin can approve any invoice at
-- that org.
--
-- Also added: an explicit auth.role() = 'service_role' bypass on the new unconditional check,
-- mirroring the one assert_can_approve_invoice_scope() already has just above it in the same
-- function. Without it, a legitimate backend/service-role-driven approval (auth.uid() is NULL
-- in that context) would hit `v_user_limit IS NULL` and be rejected -- not a real limit
-- violation, just no session to read a limit from.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor_autopay boolean;
  v_settings jsonb;
  v_require_separate_approver boolean;
  v_user_limit numeric;
  v_has_unlimited boolean;
  v_amount numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      v_settings := public.get_payment_approval_settings(NEW.organization_id, NEW.brand_id, NEW.location_id);
      v_require_separate_approver := COALESCE((v_settings->>'requireSeparateApprover')::boolean, false);

      IF v_require_separate_approver
        AND NEW.created_by IS NOT NULL
        AND NEW.created_by = auth.uid() THEN
        RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
      END IF;

      PERFORM public.assert_can_approve_invoice_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );

      IF auth.role() IS DISTINCT FROM 'service_role' THEN
        SELECT invoice_approval_limit, COALESCE(has_unlimited_approval, false)
          INTO v_user_limit, v_has_unlimited
        FROM public.profiles
        WHERE id = auth.uid()
          AND deleted_at IS NULL;

        v_amount := COALESCE(NEW.total_amount, 0);
        IF NOT COALESCE(v_has_unlimited, false)
          AND (v_user_limit IS NULL OR v_amount > v_user_limit) THEN
          RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.',
            COALESCE(v_user_limit, 0), v_amount;
        END IF;
      END IF;

      SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
      IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
        RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
    OR (NEW.ap_status = 'approved' AND OLD.ap_status IS DISTINCT FROM 'approved') THEN
    v_settings := public.get_payment_approval_settings(NEW.organization_id, NEW.brand_id, NEW.location_id);
    v_require_separate_approver := COALESCE((v_settings->>'requireSeparateApprover')::boolean, false);

    IF v_require_separate_approver
      AND COALESCE(OLD.created_by, NEW.created_by) IS NOT NULL
      AND COALESCE(OLD.created_by, NEW.created_by) = auth.uid() THEN
      RAISE EXCEPTION 'Invoice submitters cannot approve their own invoices';
    END IF;

    PERFORM public.assert_can_approve_invoice_scope(
      NEW.organization_id,
      NEW.brand_id,
      NEW.location_id
    );

    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      SELECT invoice_approval_limit, COALESCE(has_unlimited_approval, false)
        INTO v_user_limit, v_has_unlimited
      FROM public.profiles
      WHERE id = auth.uid()
        AND deleted_at IS NULL;

      v_amount := COALESCE(NEW.total_amount, OLD.total_amount, 0);
      IF NOT COALESCE(v_has_unlimited, false)
        AND (v_user_limit IS NULL OR v_amount > v_user_limit) THEN
        RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.',
          COALESCE(v_user_limit, 0), v_amount;
      END IF;
    END IF;

    SELECT autopay_enabled INTO v_vendor_autopay FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_autopay AND NOT public.is_owner_or_admin() THEN
      RAISE EXCEPTION 'AutoPay invoice approval requires an org manager, tenant super admin, or platform admin';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.profiles
SET has_unlimited_approval = true,
    updated_at = now()
WHERE role IN ('platform_admin', 'tenant_super_admin')
  AND deleted_at IS NULL
  AND COALESCE(has_unlimited_approval, false) = false;

COMMIT;

NOTIFY pgrst, 'reload schema';
