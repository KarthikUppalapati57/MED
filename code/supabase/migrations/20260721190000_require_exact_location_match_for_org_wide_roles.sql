BEGIN;

-- Reverses the previous design for org_manager/tenant_super_admin/branch_manager: they no
-- longer see aggregate data (their whole org / whole tenant / whole brand) across invoices,
-- payments, inventory, and the other tables gated by tenant_scope_visible(). They must have a
-- specific location selected via switch_user_context (which already writes profiles.location_id
-- for every role, already validated against get_my_accessible_location_ids() at switch time) --
-- confirmed explicitly, applying to all three roles, no exceptions.
--
-- location_manager/ground_staff are unaffected: their profiles.location_id was always fixed and
-- already worked this way (this migration just reads it directly instead of going through
-- get_my_accessible_location_ids(), which for those two roles only ever returned that same one
-- id anyway).
--
-- The one preserved exception: a row with NULL brand_id AND NULL location_id (ledger_entries is
-- the only table left in this tier after this session's mandatory-IDs migration) stays visible
-- on organization_id match alone, exactly as CLAUDE.md's original NULL-tier rule specified --
-- that tier was never part of what's being restricted here.
--
-- reference_scope_visible (vendors/products/recipes) is deliberately NOT touched -- that's the
-- brand-shared reference model from CLAUDE.md section 4, a different, intentional pattern.
--
-- tenant_scope_writable() needs no change: it already just delegates to tenant_scope_visible()
-- for its core check, so it inherits this automatically.

CREATE OR REPLACE FUNCTION public.tenant_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
  v_location_id uuid;
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

  SELECT role, organization_id, location_id
    INTO v_role, v_org_id, v_location_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- Org-level tier (ledger_entries): unaffected by this change.
  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RETURN v_role IN ('org_manager', 'tenant_super_admin');
  END IF;

  -- Every other row: exact match against whichever location this caller currently has
  -- active, for every role including location_manager/ground_staff (unchanged for them).
  RETURN p_location_id IS NOT NULL AND p_location_id = v_location_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
