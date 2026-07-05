BEGIN;

CREATE OR REPLACE FUNCTION public.transition_vendor_approval(
  p_vendor_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_new_status text;
BEGIN

  v_new_status := lower(btrim(COALESCE(p_new_status, '')));

  SELECT *
    INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id
  FOR UPDATE;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  PERFORM public.assert_can_approve_vendor_scope(
    v_vendor.organization_id,
    v_vendor.brand_id,
    v_vendor.location_id
  );

  IF v_new_status = v_vendor.approval_status THEN
    RAISE EXCEPTION 'Vendor approval_status is already %', v_new_status;
  END IF;

  -- ponytail: transition edges are intentionally hard-coded for V2's tiny
  -- lifecycle. Ceiling: edges live in function code; upgrade path is a
  -- transition table if the lifecycle grows or becomes tenant-configurable.
  IF NOT (
    (v_vendor.approval_status = 'draft' AND v_new_status IN ('pending_approval', 'approved'))
    OR (v_vendor.approval_status = 'pending_approval' AND v_new_status IN ('approved', 'rejected'))
    OR (v_vendor.approval_status = 'approved' AND v_new_status = 'suspended')
    OR (v_vendor.approval_status = 'suspended' AND v_new_status IN ('approved', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'Invalid vendor approval transition from % to %',
      v_vendor.approval_status,
      COALESCE(NULLIF(v_new_status, ''), '<empty>');
  END IF;

  UPDATE public.vendors
     SET approval_status = v_new_status,
         updated_at = now()
   WHERE id = p_vendor_id
   RETURNING * INTO v_vendor;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_vendor.id,
    'approval_status', v_vendor.approval_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) TO authenticated, service_role;

COMMIT;

