BEGIN;

-- 1. Fix the vendors payment terms check constraint to allow 'net_7' and 'custom'
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_payment_terms_check;

ALTER TABLE public.vendors ADD CONSTRAINT vendors_payment_terms_check
  CHECK (payment_terms IS NULL OR payment_terms IN ('net_7', 'net_10', 'net_14', 'net_15', 'net_20', 'net_30', 'net_45', 'net_60', 'net_90', 'due_on_receipt', 'custom'));

-- 2. Fix submit_vendor_banking_via_link which was trying to set updated_at on vendors table

CREATE OR REPLACE FUNCTION public.submit_vendor_banking_via_link(p_token text, p_account text, p_routing text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token public.vendor_banking_link_tokens%ROWTYPE;
  v_bank public.vendor_banking_details%ROWTYPE;
  v_request public.vendor_banking_change_requests%ROWTYPE;
  v_store_result jsonb;
  v_reason text;
BEGIN
  SELECT * INTO v_token
  FROM public.vendor_banking_link_tokens
  WHERE token = btrim(COALESCE(p_token, ''))
    AND status = 'pending'
    AND expires_at > now()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired banking link';
  END IF;

  IF regexp_replace(COALESCE(p_account, ''), '\D', '', 'g') !~ '^\d{4,17}$' THEN
    RAISE EXCEPTION 'A valid bank account number (4-17 digits) is required';
  END IF;

  IF regexp_replace(COALESCE(p_routing, ''), '\D', '', 'g') !~ '^\d{9}$' THEN
    RAISE EXCEPTION 'A valid 9-digit routing number is required';
  END IF;

  IF v_token.intent = 'replace' THEN
    v_reason := 'vendor_requested_update';
  ELSIF EXISTS (
    SELECT 1
    FROM public.vendor_banking_details existing
    WHERE existing.vendor_id = v_token.vendor_id
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
    v_token.vendor_id,
    v_token.organization_id,
    v_token.brand_id,
    v_token.location_id,
    'pending',
    'pending',
    false,
    v_token.created_by,
    v_token.created_by
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
    v_token.vendor_id,
    v_bank.id,
    v_reason,
    v_token.created_by,
    'on_file_contact',
    v_token.created_by,
    v_token.created_by
  )
  RETURNING * INTO v_request;

  UPDATE public.vendor_banking_link_tokens
     SET status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   WHERE id = v_token.id;

  UPDATE public.vendors
     SET onboarding_status = 'banking_submitted'
   WHERE id = v_token.vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, from_status, to_status, actor_type, metadata
  ) VALUES (
    v_token.vendor_id,
    'banking_submitted',
    NULL,
    'banking_submitted',
    'vendor',
    jsonb_build_object(
      'banking_row_id', v_bank.id,
      'change_request_id', v_request.id,
      'token_id', v_token.id,
      'intent', v_token.intent
    )
  );

  IF v_token.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      organization_id,
      brand_id,
      location_id,
      title,
      message,
      type,
      is_read,
      metadata
    ) VALUES (
      v_token.created_by,
      v_token.organization_id,
      v_token.brand_id,
      v_token.location_id,
      'Vendor banking callback required',
      'A vendor submitted banking details. Call the phone number already on file before paying this account.',
      'system',
      false,
      jsonb_build_object(
        'vendor_id', v_token.vendor_id,
        'banking_row_id', v_bank.id,
        'change_request_id', v_request.id,
        'token_id', v_token.id,
        'intent', v_token.intent
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_token.vendor_id,
    'banking_row_id', v_bank.id,
    'banking_change_request_id', v_request.id,
    'banking_secret_id', v_store_result->>'banking_secret_id',
    'account_last4', v_store_result->>'account_last4',
    'intent', v_token.intent,
    'is_default', v_bank.is_default,
    'verification_state', v_bank.verification_state,
    'callback_status', v_bank.callback_status
  );
END;
$function$;

COMMIT;
