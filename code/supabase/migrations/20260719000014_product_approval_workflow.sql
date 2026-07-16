-- 20260719000014: Optional manager-approval gate on product CRUD
--
-- Closes tracker item 17.7: "Add, update, and delete products should need manager approval."
-- Design locked with the user:
--   - Opt-in per organization (a toggle in operational_settings, category
--     'product_approval'), not hardcoded for everyone -- most tenants may not want the
--     friction.
--   - Only location_manager's create/update/delete is gated when the toggle is on.
--     branch_manager/org_manager/platform_admin keep writing directly, same as today --
--     mirrors the invoice-approval model where the approval tier's own actions don't need a
--     second sign-off.
--   - "Pending" means live, not staged: the row is created/updated immediately and usable
--     right away (ordering/inventory aren't blocked on approval latency); it's just flagged
--     pending_approval=true with a snapshot of what came before, visible to managers in a
--     review queue. Approving clears the flag (and performs the real soft-delete, for a
--     pending delete). Rejecting reverts to the snapshot (or undoes the create/delete).

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pending_action text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pending_snapshot jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_pending_action_check;
ALTER TABLE public.products ADD CONSTRAINT products_pending_action_check
  CHECK (pending_action IS NULL OR pending_action IN ('create', 'update', 'delete'));

CREATE INDEX IF NOT EXISTS idx_products_pending_approval
  ON public.products (organization_id, pending_approval) WHERE pending_approval = true;

-- ===== org-level toggle, reusing operational_settings (already RLS-protected, already the
-- established home for exactly this kind of per-org preference) =====

CREATE OR REPLACE FUNCTION public.get_product_approval_setting(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (settings->>'require_location_manager_approval')::boolean
     FROM public.operational_settings
     WHERE organization_id = p_organization_id
       AND scope = 'organization'
       AND brand_id IS NULL
       AND location_id IS NULL
       AND category = 'product_approval'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.set_product_approval_setting(p_organization_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.get_auth_role() NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Only an org manager or above can change the product approval setting';
  END IF;

  IF NOT public.is_platform_admin() AND p_organization_id IS DISTINCT FROM public.get_auth_org() THEN
    RAISE EXCEPTION 'Cross-organization access denied';
  END IF;

  -- NB: operational_settings' unique constraint includes nullable brand_id/location_id, and
  -- Postgres never treats NULL = NULL as a conflict for constraint/ON CONFLICT purposes --
  -- an ON CONFLICT (organization_id, brand_id, location_id, category) target would silently
  -- never match an org-level (brand/location NULL) row and just insert a duplicate every call.
  -- Explicit check-then-write instead, scoped to this function rather than touching the
  -- shared table's constraint (used by other settings categories too).
  IF EXISTS (
    SELECT 1 FROM public.operational_settings
    WHERE organization_id = p_organization_id AND scope = 'organization'
      AND brand_id IS NULL AND location_id IS NULL AND category = 'product_approval'
  ) THEN
    UPDATE public.operational_settings
    SET settings = jsonb_build_object('require_location_manager_approval', p_enabled),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE organization_id = p_organization_id AND scope = 'organization'
      AND brand_id IS NULL AND location_id IS NULL AND category = 'product_approval';
  ELSE
    INSERT INTO public.operational_settings (organization_id, scope, category, settings, created_by, updated_by)
    VALUES (p_organization_id, 'organization', 'product_approval',
            jsonb_build_object('require_location_manager_approval', p_enabled), auth.uid(), auth.uid());
  END IF;

  RETURN jsonb_build_object('success', true, 'require_location_manager_approval', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_approval_setting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_approval_setting(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_product_approval_setting(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_approval_setting(uuid, boolean) TO authenticated;

-- ===== create_product_details: location_manager's create still inserts a live row, but
-- flagged pending when the org has opted in =====

CREATE OR REPLACE FUNCTION public.create_product_details(
  p_name text,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT true,
  p_is_tax_exempt boolean DEFAULT false,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT 0,
  p_location_specific boolean DEFAULT false,
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_my_org());
  v_brand_id uuid;
  v_location_id uuid;
  v_product public.products%ROWTYPE;
  v_needs_approval boolean;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF p_location_specific THEN
    v_location_id := COALESCE(p_location_id, (SELECT location_id FROM public.profiles WHERE id = auth.uid()));
    v_brand_id := COALESCE(p_brand_id, (SELECT brand_id FROM public.locations WHERE id = v_location_id));
  ELSE
    v_location_id := NULL;
    v_brand_id := p_brand_id;
  END IF;

  IF NOT public.reference_scope_writable(v_org_id, v_brand_id, v_location_id, NULL, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to create this product';
  END IF;

  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_org_id);

  BEGIN
    INSERT INTO public.products (
      name, product_id, description, category, accounting_category,
      is_inventoried, is_tax_exempt, report_by_unit, base_unit, latest_price,
      location_specific, organization_id, brand_id, location_id, created_by,
      pending_approval, pending_action, submitted_by, submitted_at
    ) VALUES (
      btrim(p_name), p_restops_product_id, p_description, p_category, p_accounting_category,
      p_is_inventoried, p_is_tax_exempt, p_report_by_unit, p_base_unit, p_latest_price,
      p_location_specific, v_org_id, v_brand_id, v_location_id, auth.uid(),
      v_needs_approval, CASE WHEN v_needs_approval THEN 'create' ELSE NULL END,
      CASE WHEN v_needs_approval THEN auth.uid() ELSE NULL END,
      CASE WHEN v_needs_approval THEN now() ELSE NULL END
    )
    RETURNING * INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM ILIKE '%products_product_id_key%' THEN
      RAISE EXCEPTION 'Product ID "%" is already in use. Choose a different one.', p_restops_product_id;
    END IF;
    RAISE;
  END;

  RETURN to_jsonb(v_product);
END;
$$;

-- ===== update_product_details: same pattern -- the update applies for real, snapshot of the
-- prior row is kept so a reject can revert it =====

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
  p_name text,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT true,
  p_is_tax_exempt boolean DEFAULT false,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT 0,
  p_location_specific boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_needs_approval boolean;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, v_existing.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to update this product';
  END IF;

  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_existing.organization_id)
    AND NOT v_existing.pending_approval;

  BEGIN
    UPDATE public.products SET
      name = btrim(p_name),
      product_id = COALESCE(p_restops_product_id, product_id),
      description = p_description,
      category = p_category,
      accounting_category = COALESCE(p_accounting_category, accounting_category),
      is_inventoried = p_is_inventoried,
      is_tax_exempt = p_is_tax_exempt,
      report_by_unit = p_report_by_unit,
      base_unit = p_base_unit,
      latest_price = p_latest_price,
      location_specific = p_location_specific,
      pending_approval = CASE WHEN v_needs_approval THEN true ELSE pending_approval END,
      pending_action = CASE WHEN v_needs_approval THEN 'update' ELSE pending_action END,
      pending_snapshot = CASE WHEN v_needs_approval THEN to_jsonb(v_existing) ELSE pending_snapshot END,
      submitted_by = CASE WHEN v_needs_approval THEN auth.uid() ELSE submitted_by END,
      submitted_at = CASE WHEN v_needs_approval THEN now() ELSE submitted_at END,
      updated_at = now()
    WHERE id = p_product_id
    RETURNING * INTO v_product;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM ILIKE '%products_product_id_key%' THEN
      RAISE EXCEPTION 'Product ID "%" is already in use. Choose a different one.', p_restops_product_id;
    END IF;
    RAISE;
  END;

  RETURN to_jsonb(v_product);
END;
$$;

-- ===== soft_delete_product_safe: for a gated location_manager delete, the product is NOT
-- soft-deleted yet -- it stays live and usable, just flagged pending_action='delete' until a
-- manager approves it =====

CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
  v_needs_approval boolean;
BEGIN
  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, v_existing.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to delete this product';
  END IF;

  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_existing.organization_id)
    AND NOT v_existing.pending_approval;

  IF v_needs_approval THEN
    UPDATE public.products SET
      pending_approval = true,
      pending_action = 'delete',
      pending_snapshot = to_jsonb(v_existing),
      submitted_by = auth.uid(),
      submitted_at = now()
    WHERE id = p_product_id;

    RETURN jsonb_build_object('success', true, 'pending_approval', true);
  END IF;

  UPDATE public.products SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'pending_approval', false);
END;
$$;

-- ===== approve / reject =====

CREATE OR REPLACE FUNCTION public.approve_product_change(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT v_existing.pending_approval THEN
    RAISE EXCEPTION 'This product has no pending change to approve';
  END IF;

  IF public.get_auth_role() NOT IN ('branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to approve product changes';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, NULL, 'branch_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to approve this product change';
  END IF;

  IF v_existing.pending_action = 'delete' THEN
    UPDATE public.products SET
      deleted_at = now(), deleted_by = auth.uid(),
      pending_approval = false, pending_action = NULL, pending_snapshot = NULL,
      submitted_by = NULL, submitted_at = NULL
    WHERE id = p_product_id;
  ELSE
    UPDATE public.products SET
      pending_approval = false, pending_action = NULL, pending_snapshot = NULL,
      submitted_by = NULL, submitted_at = NULL
    WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_product_change(p_product_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.products WHERE id = p_product_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT v_existing.pending_approval THEN
    RAISE EXCEPTION 'This product has no pending change to reject';
  END IF;

  IF public.get_auth_role() NOT IN ('branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to reject product changes';
  END IF;

  IF NOT public.reference_scope_writable(v_existing.organization_id, v_existing.brand_id, v_existing.location_id, NULL, 'branch_manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to reject this product change';
  END IF;

  IF v_existing.pending_action = 'create' THEN
    -- Undo the creation: soft-delete it, there's no prior state to revert to.
    UPDATE public.products SET
      deleted_at = now(), deleted_by = auth.uid(),
      pending_approval = false, pending_action = NULL, pending_snapshot = NULL,
      submitted_by = NULL, submitted_at = NULL
    WHERE id = p_product_id;
  ELSIF v_existing.pending_action = 'update' THEN
    -- Revert every column back to the pre-change snapshot.
    UPDATE public.products SET
      name = (v_existing.pending_snapshot->>'name'),
      product_id = (v_existing.pending_snapshot->>'product_id'),
      description = (v_existing.pending_snapshot->>'description'),
      category = (v_existing.pending_snapshot->>'category'),
      accounting_category = (v_existing.pending_snapshot->>'accounting_category'),
      is_inventoried = (v_existing.pending_snapshot->>'is_inventoried')::boolean,
      is_tax_exempt = (v_existing.pending_snapshot->>'is_tax_exempt')::boolean,
      report_by_unit = (v_existing.pending_snapshot->>'report_by_unit'),
      base_unit = (v_existing.pending_snapshot->>'base_unit'),
      latest_price = (v_existing.pending_snapshot->>'latest_price')::numeric,
      location_specific = (v_existing.pending_snapshot->>'location_specific')::boolean,
      pending_approval = false, pending_action = NULL, pending_snapshot = NULL,
      submitted_by = NULL, submitted_at = NULL
    WHERE id = p_product_id;
  ELSE
    -- pending delete rejected: cancel the delete request, product stays as-is.
    UPDATE public.products SET
      pending_approval = false, pending_action = NULL, pending_snapshot = NULL,
      submitted_by = NULL, submitted_at = NULL
    WHERE id = p_product_id;
  END IF;

  IF p_reason IS NOT NULL THEN
    PERFORM public.log_audit_event(jsonb_build_object(
      'organization_id', v_existing.organization_id,
      'user_id', auth.uid(),
      'action', 'product_change_rejected',
      'table_name', 'products',
      'record_id', p_product_id::text,
      'entity_type', 'product',
      'entity_id', p_product_id::text,
      'details', jsonb_build_object('reason', p_reason, 'rejected_action', v_existing.pending_action)
    ));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_product_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_product_change(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_product_change(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_product_change(uuid, text) TO authenticated;

COMMIT;
