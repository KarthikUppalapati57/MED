-- Fix Legacy Roles in Access Functions
-- 
-- Replaces instances of 'org_owner' with 'org_manager' (and adds 'tenant_super_admin' where applicable)
-- to restore RLS visibility after the role normalization migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.tenant_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id
    INTO v_role, v_org_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;
  
  IF v_role = 'tenant_super_admin' THEN
    IF p_organization_id IS NULL THEN
       RETURN false;
    END IF;
    RETURN public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id);
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN (
      p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id)
      OR p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id)
    );
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF v_role = 'ground_staff' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = p_organization_id
        AND p.location_id = p_location_id
        AND (
          p_brand_id IS NULL
          OR p.brand_id IS NULL
          OR p.brand_id = p_brand_id
        )
        AND p.deleted_at IS NULL
    );
  END IF;

  RETURN false;
END;
$$;


CREATE OR REPLACE FUNCTION public.reference_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id
    INTO v_role, v_org_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;
  
  IF v_role = 'tenant_super_admin' THEN
    IF p_organization_id IS NULL THEN
       RETURN false;
    END IF;
    RETURN public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id);
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF p_location_id IS NOT NULL THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF p_brand_id IS NOT NULL THEN
    RETURN p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  RETURN false;
END;
$$;


CREATE OR REPLACE FUNCTION public.reference_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL,
  p_role_required text DEFAULT 'ground_staff'
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  v_role := public.get_auth_role();

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;
  
  IF v_role = 'tenant_super_admin' THEN
    RETURN public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id);
  END IF;

  IF p_organization_id IS DISTINCT FROM public.get_auth_org() THEN
    RETURN false;
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF v_role NOT IN ('location_manager', 'branch_manager', 'org_manager') THEN
      RETURN false;
    END IF;

    IF p_role_required = 'branch_manager' AND v_role = 'location_manager' THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = p_location_id
        AND l.organization_id = p_organization_id
        AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
    ) THEN
      RETURN false;
    END IF;

    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF p_brand_id IS NOT NULL THEN
    IF v_role NOT IN ('branch_manager', 'org_manager') THEN
      RETURN false;
    END IF;

    RETURN p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  RETURN false;
END;
$$;


CREATE OR REPLACE FUNCTION public.tenant_scope_writable(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamptz DEFAULT NULL,
  p_allow_ground_staff boolean DEFAULT true
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  v_role := public.get_auth_role();

  IF v_role = 'ground_staff' AND NOT p_allow_ground_staff THEN
    RETURN false;
  END IF;

  IF v_role NOT IN ('ground_staff', 'location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RETURN false;
  END IF;

  RETURN public.tenant_scope_visible(
    p_organization_id,
    p_brand_id,
    p_location_id,
    p_deleted_at
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.transfer_scope_visible(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_deleted_at IS NULL
    AND (
      public.is_platform_admin()
      OR (
        public.get_auth_role() = 'tenant_super_admin'
        AND public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id)
      )
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_manager'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          OR p_to_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;


CREATE OR REPLACE FUNCTION public.transfer_from_scope_writable(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.is_manager_or_above()
    AND (
      public.is_platform_admin()
      OR (
        public.get_auth_role() = 'tenant_super_admin'
        AND public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id)
      )
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_manager'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;


CREATE OR REPLACE FUNCTION public.intercompany_from_scope_writable(
  p_organization_id uuid,
  p_from_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.get_auth_role() IN ('branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin')
    AND (
      public.is_platform_admin()
      OR (
        public.get_auth_role() = 'tenant_super_admin'
        AND public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id)
      )
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_manager'
          OR p_from_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;


CREATE OR REPLACE FUNCTION public.commissary_route_scope_visible(
  p_organization_id uuid,
  p_route_id uuid,
  p_origin_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_deleted_at IS NULL
    AND (
      public.is_platform_admin()
      OR (
        public.get_auth_role() = 'tenant_super_admin'
        AND public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id)
      )
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_manager'
          OR p_origin_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          OR EXISTS (
            SELECT 1
            FROM public.commissary_route_stops crs
            WHERE crs.route_id = p_route_id
              AND crs.destination_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
          )
        )
      )
    );
$$;


CREATE OR REPLACE FUNCTION public.commissary_route_scope_writable(
  p_organization_id uuid,
  p_origin_location_id uuid,
  p_deleted_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_deleted_at IS NULL
    AND public.is_manager_or_above()
    AND (
      public.is_platform_admin()
      OR (
        public.get_auth_role() = 'tenant_super_admin'
        AND public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id)
      )
      OR (
        p_organization_id = public.get_auth_org()
        AND (
          public.get_auth_role() = 'org_manager'
          OR p_origin_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
      )
    );
$$;


CREATE OR REPLACE FUNCTION public.can_access_dashboard_scope(
  p_org_id uuid,
  p_scope text,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'platform_admin'
        OR (
          p.role = 'tenant_super_admin' 
          AND p.tenant_id = (SELECT tenant_id FROM public.organizations WHERE id = p_org_id)
        )
        OR (
          p.organization_id = p_org_id
          AND (
            p.role = 'org_manager'
            OR (p_scope = 'brand' AND p.role IN ('brand_manager', 'branch_manager') AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
            OR (p_scope IN ('location', 'staff') AND p.role IN ('location_manager', 'ground_staff') AND (p.location_id IS NULL OR p.location_id = p_location_id))
            OR (p_scope IN ('location', 'staff') AND p.role IN ('brand_manager', 'branch_manager') AND (p.brand_id IS NULL OR p.brand_id = p_brand_id))
          )
        )
      )
  );
$$;


CREATE OR REPLACE FUNCTION public.assert_can_approve_invoice_scope(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_org_id uuid;
  v_tenant_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id, tenant_id
    INTO v_role, v_org_id, v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;
  
  IF v_role = 'tenant_super_admin' THEN
    IF v_tenant_id = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Cross-tenant invoice approval denied';
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization invoice approval denied';
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN;
  END IF;

  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Org-level invoice approval requires org_manager or platform_admin';
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


CREATE OR REPLACE FUNCTION public.assert_can_approve_vendor_scope(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  
  IF v_role = 'tenant_super_admin' THEN
    IF public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Cross-tenant vendor approval denied';
  END IF;

  IF p_organization_id IS NULL OR v_auth_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization vendor approval denied';
  END IF;

  IF v_role = 'org_manager' THEN
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


CREATE OR REPLACE FUNCTION public.update_user_approval_limit(
  target_user_id uuid,
  new_limit numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
         updated_at = now()
   WHERE id = target_user_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.execute_approval_step(
  p_step_id uuid,
  p_status text,
  p_comments text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    OR v_actor_role IN ('platform_admin', 'tenant_super_admin')
    OR (v_actor_role = 'org_manager'
        AND v_required_role IN ('location_manager', 'branch_manager', 'org_manager', 'org_admin'))
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


CREATE OR REPLACE FUNCTION public.notify_expired_owner_invitations()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invitation RECORD;
  v_admin RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_invitation IN
    SELECT i.*
    FROM public.invitations i
    WHERE i.role IN ('org_manager', 'tenant_super_admin', 'owner', 'org_owner')
      AND i.accepted_at IS NULL
      AND i.closed_at IS NULL
      AND i.expires_at IS NOT NULL
      AND i.expires_at <= now()
      AND i.expired_notified_at IS NULL
  LOOP
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'platform_admin'
    LOOP
      INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
      VALUES (
        v_admin.id,
        v_invitation.organization_id,
        'system',
        'Owner onboarding invitation expired',
        'The owner invitation for ' || v_invitation.email || ' expired and needs follow-up or reissue.',
        false
      );
    END LOOP;

    UPDATE public.invitations
    SET expired_notified_at = now()
    WHERE id = v_invitation.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_invitations_notified', v_count);
END;
$$;


CREATE OR REPLACE FUNCTION public.org_remove_member(
  target_user_id uuid,
  target_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := COALESCE(target_org_id, public.get_auth_org());

  IF caller_role NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_manager, tenant_super_admin, or platform_admin can remove users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Remove from organization_members
  DELETE FROM public.organization_members 
  WHERE user_id = target_user_id AND organization_id = caller_org;
  
  -- Remove from brand_members for this org
  DELETE FROM public.brand_members 
  WHERE user_id = target_user_id 
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);
    
  -- Remove from location_members for this org
  DELETE FROM public.location_members 
  WHERE user_id = target_user_id 
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  -- Update profiles if this was their active org
  UPDATE public.profiles 
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  -- Update app_metadata if this is their active context
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_user_id uuid,
  p_org_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_org_id uuid;
  org_owner uuid;
  v_current_role text;
BEGIN
  -- Verify caller is the user being updated
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Can only complete onboarding for yourself';
  END IF;

  -- Verify the user does NOT already have an org (prevents re-onboarding abuse)
  SELECT organization_id, role INTO caller_org_id, v_current_role FROM public.profiles WHERE id = p_user_id;
  IF caller_org_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  -- Verify the org exists and the user is the owner
  SELECT owner_id INTO org_owner FROM public.organizations WHERE id = p_org_id;
  IF org_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Organization does not belong to this user';
  END IF;

  -- Update the profile with org hierarchy and preserve platform_admin
  UPDATE public.profiles SET
    organization_id = p_org_id,
    brand_id = p_brand_id,
    location_id = p_location_id,
    role = CASE WHEN v_current_role = 'platform_admin' THEN 'platform_admin' ELSE 'org_manager' END,
    access_level = CASE WHEN v_current_role = 'platform_admin' THEN 'platform' ELSE 'organization' END,
    updated_at = now()
  WHERE id = p_user_id;

  -- Sync JWT metadata
  UPDATE auth.users SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'role', CASE WHEN v_current_role = 'platform_admin' THEN 'platform_admin' ELSE 'org_manager' END,
      'access_level', CASE WHEN v_current_role = 'platform_admin' THEN 'platform' ELSE 'organization' END,
      'organization_id', p_org_id,
      'brand_id', p_brand_id,
      'location_id', p_location_id
    )
  WHERE id = p_user_id;

  -- Audit log
  INSERT INTO public.audit_logs (organization_id, user_id, action, table_name, record_id, new_data)
  VALUES (p_org_id, p_user_id, 'ONBOARDING_COMPLETE', 'profiles', p_user_id,
          jsonb_build_object('org_id', p_org_id, 'brand_id', p_brand_id, 'location_id', p_location_id));
END;
$$;

COMMIT;
