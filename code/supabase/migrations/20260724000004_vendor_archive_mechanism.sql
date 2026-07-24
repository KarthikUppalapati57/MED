BEGIN;

-- vendors was the one reference table in this codebase with no soft-delete at all, contradicting
-- CLAUDE.md's own "Soft-delete only. Never hard-delete" rule (§5) that every other tenant table
-- already follows. Add deleted_at and wire it into vendors' own 3 policies (NOT the shared
-- reference_scope_visible/writable functions themselves -- those already accept p_deleted_at as
-- a parameter; only the literal NULL each vendors policy currently passes needs to become the
-- real column, per-table, same as every other soft-deleted table already does it).
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP POLICY IF EXISTS operational_vendors_select ON public.vendors;
DROP POLICY IF EXISTS operational_vendors_insert ON public.vendors;
DROP POLICY IF EXISTS operational_vendors_update ON public.vendors;

CREATE POLICY operational_vendors_select ON public.vendors
  FOR SELECT USING (reference_scope_visible(organization_id, brand_id, location_id, deleted_at));

CREATE POLICY operational_vendors_insert ON public.vendors
  FOR INSERT WITH CHECK (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

CREATE POLICY operational_vendors_update ON public.vendors
  FOR UPDATE
  USING (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));

-- Thin convenience wrappers over a plain UPDATE (which RLS above already permits) so archiving
-- gets the same vendor_onboarding_events audit trail every other significant vendor action
-- already has. Deliberately no business-rule gate (e.g. blocking archive with open invoices) --
-- that's a product decision, not something to invent here.
CREATE OR REPLACE FUNCTION public.archive_vendor(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendor public.vendors%ROWTYPE;
BEGIN
  -- SECURITY DEFINER's internal UPDATE bypasses RLS, so this needs its own explicit scope
  -- check -- same floor operational_vendors_update already uses.
  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, v_vendor.deleted_at, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_vendor.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Vendor is already archived';
  END IF;

  UPDATE public.vendors SET deleted_at = now() WHERE id = p_vendor_id;

  INSERT INTO public.vendor_onboarding_events (vendor_id, event_type, actor_id, actor_type)
  VALUES (p_vendor_id, 'vendor_archived', auth.uid(), 'admin');
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_vendor(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendor public.vendors%ROWTYPE;
BEGIN
  -- deleted_at IS NOT NULL, so reference_scope_writable would reject it outright (a soft-deleted
  -- row is never writable) -- check org/brand/location authorization directly instead, the same
  -- way the scope helper would for an active row.
  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF v_vendor.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Vendor is not archived';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, NULL, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendors SET deleted_at = NULL WHERE id = p_vendor_id;

  INSERT INTO public.vendor_onboarding_events (vendor_id, event_type, actor_id, actor_type)
  VALUES (p_vendor_id, 'vendor_restored', auth.uid(), 'admin');
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_vendor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_vendor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_vendor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_vendor(uuid) TO authenticated;

COMMIT;
