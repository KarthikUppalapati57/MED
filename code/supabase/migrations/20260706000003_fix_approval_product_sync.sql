BEGIN;

CREATE OR REPLACE FUNCTION public.approve_invoice_with_limit(
  p_invoice_id uuid,
  p_user_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_limit numeric;
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

  SELECT invoice_approval_limit
    INTO v_user_limit
  FROM public.profiles
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  v_amount := COALESCE(p_amount, v_invoice.total_amount, 0);

  IF v_user_limit IS NULL OR v_amount > v_user_limit THEN
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

CREATE OR REPLACE FUNCTION public.execute_approval_step(
  p_step_id uuid,
  p_status text,
  p_comments text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id uuid;
  v_invoice_id uuid;
  v_pending_count int;
  v_required_role text;
  v_actor_role text;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval step status %', p_status;
  END IF;

  SELECT s.instance_id, s.required_role, ai.invoice_id
    INTO v_instance_id, v_required_role, v_invoice_id
  FROM public.approval_steps s
  JOIN public.approval_instances ai ON ai.id = s.instance_id
  WHERE s.id = p_step_id
    AND s.status = 'pending'
  FOR UPDATE OF s;

  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION 'Pending approval step not found';
  END IF;

  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id
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

  v_actor_role := public.get_auth_role();

  IF NOT (
    v_actor_role = v_required_role
    OR v_actor_role = 'platform_admin'
    OR (v_actor_role = 'org_owner'
        AND v_required_role IN ('location_manager', 'branch_manager', 'org_owner', 'org_admin'))
    OR (v_actor_role = 'branch_manager'
        AND v_required_role IN ('location_manager', 'branch_manager'))
  ) THEN
    RAISE EXCEPTION 'Role % cannot act on approval step requiring %',
      v_actor_role, v_required_role;
  END IF;

  UPDATE public.approval_steps
     SET status = p_status::approval_step_status,
         approver_id = auth.uid(),
         comments = p_comments,
         acted_at = now()
   WHERE id = p_step_id;

  IF p_status = 'rejected' THEN
    UPDATE public.approval_instances
       SET status = 'rejected',
           updated_at = now()
     WHERE id = v_instance_id;

    UPDATE public.invoices
       SET status = 'rejected',
           ap_status = 'rejected',
           updated_at = now()
     WHERE id = v_invoice_id;

    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  SELECT count(*)
    INTO v_pending_count
  FROM public.approval_steps
  WHERE instance_id = v_instance_id
    AND status = 'pending';

  IF v_pending_count = 0 THEN
    UPDATE public.approval_instances
       SET status = 'approved',
           updated_at = now()
     WHERE id = v_instance_id;

    UPDATE public.invoices
       SET status = 'approved',
           ap_status = 'approved',
           approved_by = auth.uid(),
           approved_date = now(),
           updated_at = now()
     WHERE id = v_invoice_id;

    -- Sync products now that it is fully approved
    PERFORM public.sync_invoice_products(v_invoice_id);

    RETURN jsonb_build_object('status', 'fully_approved');
  END IF;

  RETURN jsonb_build_object('status', 'partially_approved', 'pending_steps', v_pending_count);
END;
$$;

COMMIT;
