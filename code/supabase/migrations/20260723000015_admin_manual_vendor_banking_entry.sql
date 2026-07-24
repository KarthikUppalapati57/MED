BEGIN;

-- Staff-facing counterpart to the vendor's magic-link submit-bank-info, for vendors who read
-- routing/account numbers over the phone rather than using the portal. Mirrors
-- submit_vendor_banking_via_link's body (same format validation, same vault call, same
-- change-request/reason logic) but keys off p_vendor_id directly instead of resolving it from a
-- token, since there's no token here. Deliberately does NOT skip the phone-callback verification
-- step downstream (VO-RULE-015's anti-fraud control) -- manual entry only changes how the
-- numbers arrived, not whether the account still needs confirming before it's payable.
CREATE OR REPLACE FUNCTION public.admin_submit_vendor_banking_info(
  p_vendor_id uuid,
  p_account text,
  p_routing text,
  p_intent text DEFAULT 'add'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_bank public.vendor_banking_details%ROWTYPE;
  v_request public.vendor_banking_change_requests%ROWTYPE;
  v_store_result jsonb;
  v_reason text;
  v_intent text := COALESCE(NULLIF(btrim(p_intent), ''), 'add');
BEGIN
  IF v_intent NOT IN ('add', 'replace') THEN
    RAISE EXCEPTION 'Invalid vendor banking intent: %', p_intent;
  END IF;

  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, NULL::timestamptz, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF regexp_replace(COALESCE(p_account, ''), '\D', '', 'g') !~ '^\d{4,17}$' THEN
    RAISE EXCEPTION 'A valid bank account number (4-17 digits) is required';
  END IF;

  IF regexp_replace(COALESCE(p_routing, ''), '\D', '', 'g') !~ '^\d{9}$' THEN
    RAISE EXCEPTION 'A valid 9-digit routing number is required';
  END IF;

  IF v_intent = 'replace' THEN
    v_reason := 'vendor_requested_update';
  ELSIF EXISTS (
    SELECT 1
    FROM public.vendor_banking_details existing
    WHERE existing.vendor_id = p_vendor_id
      AND existing.is_default = true
      AND existing.is_active = true
      AND existing.deleted_at IS NULL
  ) THEN
    v_reason := 'admin_correction';
  ELSE
    v_reason := 'onboarding';
  END IF;

  INSERT INTO public.vendor_banking_details (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    verification_state,
    callback_status,
    is_default,
    created_by,
    updated_by
  ) VALUES (
    p_vendor_id,
    v_vendor.organization_id,
    v_vendor.brand_id,
    v_vendor.location_id,
    'pending',
    'pending',
    false,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_bank;

  v_store_result := public.store_vendor_banking_secret(v_bank.id, p_account, p_routing);

  INSERT INTO public.vendor_banking_change_requests (
    vendor_id,
    banking_detail_id,
    request_reason,
    requested_by,
    callback_phone_source,
    created_by,
    updated_by
  ) VALUES (
    p_vendor_id,
    v_bank.id,
    v_reason,
    auth.uid(),
    'on_file_contact',
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_request;

  UPDATE public.vendors
     SET onboarding_status = 'banking_submitted',
         updated_at = now()
   WHERE id = p_vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, from_status, to_status, actor_id, actor_type, metadata
  ) VALUES (
    p_vendor_id,
    'banking_submitted',
    NULL,
    'banking_submitted',
    auth.uid(),
    'admin',
    jsonb_build_object(
      'banking_row_id', v_bank.id,
      'change_request_id', v_request.id,
      'intent', v_intent,
      'entry_method', 'manual'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', p_vendor_id,
    'banking_row_id', v_bank.id,
    'banking_change_request_id', v_request.id,
    'banking_secret_id', v_store_result->>'banking_secret_id',
    'account_last4', v_store_result->>'account_last4',
    'intent', v_intent,
    'is_default', v_bank.is_default,
    'verification_state', v_bank.verification_state,
    'callback_status', v_bank.callback_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_submit_vendor_banking_info(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_submit_vendor_banking_info(uuid, text, text, text) TO authenticated;

COMMIT;
