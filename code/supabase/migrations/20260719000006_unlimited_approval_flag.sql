-- 20260719000006: has_unlimited_approval flag
--
-- Closes tracker item 8.1: "Branch Manager and Location Manager need unlimited approval
-- option" / "Keep unlimited amount approval enabled for Branch Manager and Location Manager."
--
-- Today NULL invoice_approval_limit always blocks approval (approve_invoice_with_limit:
-- `v_user_limit IS NULL OR v_amount > v_user_limit`), for every role including the ones
-- granting the limits in the first place -- there's no way to mark someone as "unlimited" at
-- all, NULL just means "can't approve anything." This adds an explicit opt-in flag instead of
-- overloading NULL, so a numeric fallback ceiling can still be kept on file for if/when
-- unlimited is later revoked.
--
-- The flag is granted through the exact same update_user_approval_limit cascade rules already
-- enforced (org_manager -> branch_manager; branch_manager -> location_manager within their
-- brand; platform_admin/tenant_super_admin -> broader) -- no new authorization logic, just an
-- extra field on the same already-authorized write.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_unlimited_approval boolean NOT NULL DEFAULT false;

-- Adding a 3rd parameter creates a new overload rather than replacing the function -- drop the
-- old 2-arg signature explicitly (this repo has been bitten by stale overloads before, see
-- 20260624000020_drop_stale_release_invoice_funds_overload.sql /
-- 20260625000016_drop_stale_tenant_backfill_overload.sql).
DROP FUNCTION IF EXISTS public.update_user_approval_limit(uuid, numeric);

CREATE OR REPLACE FUNCTION public.update_user_approval_limit(
  target_user_id uuid,
  new_limit numeric,
  p_unlimited boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor record;
  v_target record;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF new_limit IS NULL OR new_limit < 0 THEN
    RAISE EXCEPTION 'Approval limit must be non-negative';
  END IF;

  IF target_user_id = v_actor_id THEN
    RAISE EXCEPTION 'Users cannot set their own approval limit';
  END IF;

  SELECT id, role, organization_id, tenant_id, brand_id, location_id,
         COALESCE(invoice_approval_limit, 0) AS invoice_approval_limit
    INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id
    AND deleted_at IS NULL;

  SELECT id, role, organization_id, tenant_id, brand_id, location_id
    INTO v_target
  FROM public.profiles
  WHERE id = target_user_id
    AND deleted_at IS NULL;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Actor profile not found';
  END IF;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  IF v_actor.role <> 'platform_admin'
    AND v_actor.role <> 'tenant_super_admin'
    AND v_actor.organization_id IS DISTINCT FROM v_target.organization_id THEN
    RAISE EXCEPTION 'Cannot set approval limit outside your organization';
  END IF;

  IF v_actor.role = 'tenant_super_admin'
    AND v_actor.tenant_id IS DISTINCT FROM v_target.tenant_id THEN
    RAISE EXCEPTION 'Cannot set approval limit outside your tenant';
  END IF;

  IF v_actor.role NOT IN ('platform_admin', 'tenant_super_admin')
    AND new_limit > v_actor.invoice_approval_limit THEN
    RAISE EXCEPTION 'Cannot grant approval limit % above your own limit %',
      new_limit, v_actor.invoice_approval_limit;
  END IF;

  IF v_actor.role = 'platform_admin' THEN
    IF v_target.role = 'platform_admin' THEN
      RAISE EXCEPTION 'Platform admins cannot set peer platform admin limits';
    END IF;
  ELSIF v_actor.role = 'tenant_super_admin' THEN
    IF v_target.role = 'tenant_super_admin' THEN
      RAISE EXCEPTION 'Tenant super admins cannot set peer limits';
    END IF;
  ELSIF v_actor.role = 'org_manager' THEN
    IF v_target.role <> 'branch_manager' THEN
      RAISE EXCEPTION 'Org managers may only set branch manager approval limits';
    END IF;
  ELSIF v_actor.role = 'branch_manager' THEN
    IF v_target.role <> 'location_manager' THEN
      RAISE EXCEPTION 'Branch managers may only set location manager approval limits';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.get_my_accessible_brand_ids() b(id)
      WHERE b.id = COALESCE(
        v_target.brand_id,
        (SELECT l.brand_id FROM public.locations l WHERE l.id = v_target.location_id)
      )
    ) THEN
      RAISE EXCEPTION 'Target user is outside your brand scope';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient role to set approval limits';
  END IF;

  UPDATE public.profiles
     SET invoice_approval_limit = new_limit,
         has_unlimited_approval = p_unlimited,
         updated_at = now()
   WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_invoice_with_limit(p_invoice_id uuid, p_user_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_limit numeric;
  v_has_unlimited boolean;
  v_invoice public.invoices%ROWTYPE;
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Approval user must match the authenticated user';
  END IF;

  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_can_approve_invoice_scope(
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id
  );

  SELECT invoice_approval_limit, COALESCE(has_unlimited_approval, false)
    INTO v_user_limit, v_has_unlimited
  FROM public.profiles
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  v_amount := COALESCE(p_amount, v_invoice.total_amount, 0);

  IF NOT v_has_unlimited AND (v_user_limit IS NULL OR v_amount > v_user_limit) THEN
    RAISE EXCEPTION 'Approval limit exceeded. Your limit is $%, but the invoice is $%.',
      COALESCE(v_user_limit, 0), v_amount;
  END IF;

  UPDATE public.invoices
     SET status = 'approved',
         ap_status = 'approved',
         approved_by = auth.uid(),
         approved_date = now(),
         updated_at = now()
   WHERE id = p_invoice_id;

  -- Sync products right after approval
  PERFORM public.sync_invoice_products(p_invoice_id);

  RETURN jsonb_build_object('success', true, 'message', 'Invoice approved successfully');
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_approval_limit(uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric, boolean) TO authenticated, service_role;

COMMIT;
