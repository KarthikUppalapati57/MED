-- Temporary onboarding contact OTP bypass for development/testing only.
-- Remove this migration/function override after Supabase email templates and Twilio SMS are fully configured.

CREATE OR REPLACE FUNCTION public.request_onboarding_contact_dev_otp(
  p_channel TEXT,
  p_target TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_channel TEXT := lower(btrim(COALESCE(p_channel, '')));
  v_target TEXT;
  v_expires_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-25 00:00:00+00';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF now() >= v_expires_at THEN
    RAISE EXCEPTION 'Temporary development OTP bypass has expired';
  END IF;

  IF v_channel NOT IN ('email', 'phone') THEN
    RAISE EXCEPTION 'OTP channel must be email or phone';
  END IF;

  v_target := public.normalize_contact_target(v_channel, p_target);

  IF v_channel = 'email' AND (v_target IS NULL OR position('@' in v_target) = 0) THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  IF v_channel = 'phone' AND length(regexp_replace(v_target, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'otp_id', 'dev_contact_' || v_channel,
    'channel', v_channel,
    'target', v_target,
    'provider', 'temporary_dev_bypass',
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_onboarding_contact_dev_otp(
  p_channel TEXT,
  p_target TEXT,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_channel TEXT := lower(btrim(COALESCE(p_channel, '')));
  v_target TEXT;
  v_code TEXT := btrim(COALESCE(p_code, ''));
  v_expected_code TEXT;
  v_run_id UUID;
  v_expires_at TIMESTAMPTZ := TIMESTAMPTZ '2026-07-25 00:00:00+00';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF now() >= v_expires_at THEN
    RAISE EXCEPTION 'Temporary development OTP bypass has expired';
  END IF;

  IF v_channel NOT IN ('email', 'phone') THEN
    RAISE EXCEPTION 'OTP channel must be email or phone';
  END IF;

  v_expected_code := CASE v_channel
    WHEN 'email' THEN '724913'
    WHEN 'phone' THEN '381602'
  END;

  IF v_code IS DISTINCT FROM v_expected_code THEN
    RAISE EXCEPTION 'Invalid OTP code';
  END IF;

  v_target := public.normalize_contact_target(v_channel, p_target);

  IF v_channel = 'email' AND (v_target IS NULL OR position('@' in v_target) = 0) THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  IF v_channel = 'phone' AND length(regexp_replace(v_target, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  IF v_channel = 'email' THEN
    UPDATE public.profiles
    SET business_email = v_target,
        business_email_verified_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET business_phone = v_target,
        business_phone_verified_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    CASE WHEN v_channel = 'email' THEN 'business_email_otp' ELSE 'business_phone_otp' END,
    'verified',
    'verified',
    jsonb_build_object(
      'target', v_target,
      'provider', 'temporary_dev_bypass',
      'expires_at', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'channel', v_channel,
    'target', v_target,
    'verified_at', now(),
    'provider', 'temporary_dev_bypass',
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_dev_otp(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_dev_otp(TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';