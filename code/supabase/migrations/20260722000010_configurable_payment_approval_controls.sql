BEGIN;

CREATE OR REPLACE FUNCTION public.get_payment_approval_settings(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT os.settings
    FROM public.operational_settings os
    WHERE os.organization_id = p_organization_id
      AND os.category = 'payments'
      AND (
        (p_location_id IS NOT NULL AND os.location_id = p_location_id)
        OR (p_brand_id IS NOT NULL AND os.brand_id = p_brand_id AND os.location_id IS NULL)
        OR (os.brand_id IS NULL AND os.location_id IS NULL)
      )
    ORDER BY
      CASE
        WHEN p_location_id IS NOT NULL AND os.location_id = p_location_id THEN 1
        WHEN p_brand_id IS NOT NULL AND os.brand_id = p_brand_id AND os.location_id IS NULL THEN 2
        ELSE 3
      END,
      os.updated_at DESC NULLS LAST
    LIMIT 1
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_autopay boolean;
  v_settings jsonb;
  v_require_separate_approver boolean;
  v_enforce_approval_limits boolean;
  v_user_limit numeric;
  v_has_unlimited boolean;
  v_amount numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      v_settings := public.get_payment_approval_settings(NEW.organization_id, NEW.brand_id, NEW.location_id);
      v_require_separate_approver := COALESCE((v_settings->>'requireSeparateApprover')::boolean, false);
      v_enforce_approval_limits := COALESCE((v_settings->>'enforceApprovalLimits')::boolean, false);

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

      IF v_enforce_approval_limits THEN
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
    v_enforce_approval_limits := COALESCE((v_settings->>'enforceApprovalLimits')::boolean, false);

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

    IF v_enforce_approval_limits THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_approval_settings(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;