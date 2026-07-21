-- Add a platform-level USPS address validation toggle and enforce it before
-- tenants submit address-bearing onboarding hierarchy payloads for review.

ALTER TABLE public.platform_onboarding_settings
  ADD COLUMN IF NOT EXISTS usps_address_validation_enabled boolean NOT NULL DEFAULT false;

UPDATE public.platform_onboarding_settings
SET usps_address_validation_enabled = COALESCE(usps_address_validation_enabled, false)
WHERE id = true;

CREATE OR REPLACE FUNCTION public.get_onboarding_verification_settings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ein_verification_enabled', ein_verification_enabled,
    'ssn_verification_enabled', ssn_verification_enabled,
    'usps_address_validation_enabled', usps_address_validation_enabled,
    'updated_at', updated_at
  )
  FROM public.platform_onboarding_settings
  WHERE id = true;
$$;

DROP FUNCTION IF EXISTS public.update_onboarding_verification_settings(boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_onboarding_verification_settings(
  p_ein_enabled boolean,
  p_ssn_enabled boolean,
  p_usps_address_validation_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.platform_onboarding_settings%ROWTYPE;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.platform_onboarding_settings
  SET ein_verification_enabled = COALESCE(p_ein_enabled, ein_verification_enabled),
      ssn_verification_enabled = COALESCE(p_ssn_enabled, ssn_verification_enabled),
      usps_address_validation_enabled = COALESCE(p_usps_address_validation_enabled, usps_address_validation_enabled)
  WHERE id = true
  RETURNING * INTO v_settings;

  RETURN jsonb_build_object(
    'success', true,
    'ein_verification_enabled', v_settings.ein_verification_enabled,
    'ssn_verification_enabled', v_settings.ssn_verification_enabled,
    'usps_address_validation_enabled', v_settings.usps_address_validation_enabled,
    'updated_at', v_settings.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_onboarding_hierarchy_for_review(p_user_id uuid, p_hierarchy jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_business_status text;
  v_payment_verified boolean;
  v_pending_payment_metadata jsonb;
  v_usps_address_validation_enabled boolean;
  v_submission_id uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Not authorized to submit hierarchy for another user';
  END IF;

  SELECT business_verification_status, payment_verified, pending_payment_metadata
  INTO v_business_status, v_payment_verified, v_pending_payment_metadata
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE
     AND COALESCE(v_pending_payment_metadata->>'provider', '') NOT IN ('free_plan', 'stripe') THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' OR jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  SELECT usps_address_validation_enabled
  INTO v_usps_address_validation_enabled
  FROM public.platform_onboarding_settings
  WHERE id = true;

  IF COALESCE(v_usps_address_validation_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'USPS address validation must be enabled before address onboarding can be submitted';
  END IF;

  INSERT INTO public.onboarding_hierarchy_submissions (user_id, hierarchy_payload, status, rejection_reason, reviewed_by, reviewed_at)
  VALUES (p_user_id, p_hierarchy, 'pending_review', NULL, NULL, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET hierarchy_payload = EXCLUDED.hierarchy_payload,
      status = 'pending_review',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  RETURNING id INTO v_submission_id;

  UPDATE public.profiles
  SET hierarchy_review_status = 'pending_review',
      onboarding_status = 'pending_review',
      onboarding_current_step = 'hierarchy_review',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  SELECT p.id, 'system', 'Tenant workspace pending review',
         COALESCE(p.full_name, p.email, 'A tenant') || ' submitted an organization hierarchy for review.', false
  FROM public.profiles p WHERE p.role = 'platform_admin';

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
    PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'hierarchy_setup', 'submitted', 'pending_review', jsonb_build_object('submission_id', v_submission_id));
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'status', 'pending_review', 'submission_id', v_submission_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_onboarding_verification_settings(boolean, boolean, boolean) TO authenticated, service_role;