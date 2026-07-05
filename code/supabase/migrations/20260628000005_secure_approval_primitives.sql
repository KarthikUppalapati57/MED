BEGIN;

REVOKE EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_user_approval_limit(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_invoice_with_limit(uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_process_invoices(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_approval_step(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_can_approve_invoice_scope(
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
  v_org_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id
    INTO v_role, v_org_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization invoice approval denied';
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN;
  END IF;

  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Org-level invoice approval requires org_owner or platform_admin';
  END IF;

  IF v_role = 'branch_manager' THEN
    IF p_brand_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.get_my_accessible_brand_ids() b(id)
      WHERE b.id = p_brand_id
    ) THEN
      RETURN;
    END IF;

    IF p_location_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.locations l
      JOIN public.get_my_accessible_brand_ids() b(id) ON b.id = l.brand_id
      WHERE l.id = p_location_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF v_role = 'location_manager' THEN
    IF p_location_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.get_my_accessible_location_ids() l(id)
      WHERE l.id = p_location_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'Invoice approval denied for role % outside accessible scope', v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_approval_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' OR NEW.ap_status = 'approved' THEN
      PERFORM public.assert_can_approve_invoice_scope(
        NEW.organization_id,
        NEW.brand_id,
        NEW.location_id
      );
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoice_approval_authorization ON public.invoices;
CREATE TRIGGER enforce_invoice_approval_authorization
BEFORE INSERT OR UPDATE OF status, ap_status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_approval_authorization();

CREATE OR REPLACE FUNCTION public.update_user_approval_limit(
  target_user_id uuid,
  new_limit numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT id, role, organization_id, brand_id, location_id,
         COALESCE(invoice_approval_limit, 0) AS invoice_approval_limit
    INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id
    AND deleted_at IS NULL;

  SELECT id, role, organization_id, brand_id, location_id
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
    AND v_actor.organization_id IS DISTINCT FROM v_target.organization_id THEN
    RAISE EXCEPTION 'Cannot set approval limit outside your organization';
  END IF;

  IF v_actor.role <> 'platform_admin'
    AND new_limit > v_actor.invoice_approval_limit THEN
    RAISE EXCEPTION 'Cannot grant approval limit % above your own limit %',
      new_limit, v_actor.invoice_approval_limit;
  END IF;

  IF v_actor.role = 'platform_admin' THEN
    IF v_target.role = 'platform_admin' THEN
      RAISE EXCEPTION 'Platform admins cannot set peer platform admin limits';
    END IF;
  ELSIF v_actor.role = 'org_owner' THEN
    IF v_target.role <> 'branch_manager' THEN
      RAISE EXCEPTION 'Org owners may only set branch manager approval limits';
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
         updated_at = now()
   WHERE id = target_user_id;
END;
$$;

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

  RETURN jsonb_build_object('success', true, 'message', 'Invoice approved successfully');
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_process_invoices(
  p_invoice_ids uuid[],
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_processed int := 0;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Status is required';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_invoice_ids, ARRAY[]::uuid[]) LOOP
    SELECT *
      INTO v_invoice
    FROM public.invoices
    WHERE id = v_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', v_id;
    END IF;

    IF p_status = 'approved' THEN
      PERFORM public.assert_can_approve_invoice_scope(
        v_invoice.organization_id,
        v_invoice.brand_id,
        v_invoice.location_id
      );
    END IF;

    UPDATE public.invoices
       SET status = p_status,
           ap_status = CASE WHEN p_status = 'approved' THEN 'approved' ELSE ap_status END,
           approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE approved_by END,
           approved_date = CASE WHEN p_status = 'approved' THEN now() ELSE approved_date END,
           updated_at = now()
     WHERE id = v_id;

    IF p_status = 'approved' THEN
      PERFORM public.sync_invoice_products(v_id);
    ELSIF p_status = 'pending_approval' THEN
      PERFORM public.evaluate_invoice_approval_policy(v_id);
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'processed', v_processed);
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

    RETURN jsonb_build_object('status', 'fully_approved');
  END IF;

  RETURN jsonb_build_object('status', 'partially_approved', 'pending_steps', v_pending_count);
END;
$$;

COMMIT;
