-- Fix onboarding contact OTP hashing for environments where gen_salt/crypt are
-- not available on the function search path. Uses a per-OTP UUID salt with md5
-- for the current development echo OTP flow.

CREATE OR REPLACE FUNCTION public.request_onboarding_contact_otp(
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
  v_code TEXT;
  v_otp_id UUID := gen_random_uuid();
  v_recent_count INTEGER;
  v_run_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

  SELECT count(*) INTO v_recent_count
  FROM public.onboarding_contact_otps
  WHERE user_id = v_user_id
    AND channel = v_channel
    AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Too many OTP requests. Please wait before requesting another code';
  END IF;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO public.onboarding_contact_otps (
    id,
    user_id,
    channel,
    target,
    code_hash,
    provider,
    metadata
  )
  VALUES (
    v_otp_id,
    v_user_id,
    v_channel,
    v_target,
    md5(v_code || ':' || v_otp_id::text),
    CASE WHEN v_channel = 'email' THEN 'email_provider_ready' ELSE 'sms_provider_ready' END,
    jsonb_build_object('delivery_mode', 'development_echo_until_provider_configured', 'hash_version', 'md5_uuid_salt')
  );

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    CASE WHEN v_channel = 'email' THEN 'business_email_otp' ELSE 'business_phone_otp' END,
    'started',
    'pending',
    jsonb_build_object('otp_id', v_otp_id, 'target', v_target)
  );

  RETURN jsonb_build_object(
    'success', true,
    'otp_id', v_otp_id,
    'channel', v_channel,
    'target', v_target,
    'expires_at', now() + interval '10 minutes',
    'delivery_mode', 'development_echo_until_provider_configured',
    'dev_code', v_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_onboarding_contact_otp(
  p_otp_id UUID,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_otp public.onboarding_contact_otps%ROWTYPE;
  v_run_id UUID;
  v_code TEXT := btrim(COALESCE(p_code, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_otp
  FROM public.onboarding_contact_otps
  WHERE id = p_otp_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_otp.id IS NULL THEN
    RAISE EXCEPTION 'OTP request not found';
  END IF;

  IF v_otp.status = 'verified' THEN
    RETURN jsonb_build_object('success', true, 'channel', v_otp.channel, 'target', v_otp.target, 'already_verified', true);
  END IF;

  IF v_otp.status <> 'pending' THEN
    RAISE EXCEPTION 'OTP request is no longer active';
  END IF;

  IF v_otp.expires_at < now() THEN
    UPDATE public.onboarding_contact_otps
    SET status = 'expired', updated_at = now()
    WHERE id = v_otp.id;
    RAISE EXCEPTION 'OTP code expired';
  END IF;

  IF v_otp.attempts >= v_otp.max_attempts THEN
    UPDATE public.onboarding_contact_otps
    SET status = 'failed', updated_at = now()
    WHERE id = v_otp.id;
    RAISE EXCEPTION 'Too many incorrect OTP attempts';
  END IF;

  IF v_otp.code_hash <> md5(v_code || ':' || v_otp.id::text) THEN
    UPDATE public.onboarding_contact_otps
    SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE status END,
        updated_at = now()
    WHERE id = v_otp.id;
    RAISE EXCEPTION 'Invalid OTP code';
  END IF;

  UPDATE public.onboarding_contact_otps
  SET status = 'verified',
      verified_at = now(),
      updated_at = now()
  WHERE id = v_otp.id;

  IF v_otp.channel = 'email' THEN
    UPDATE public.profiles
    SET business_email = v_otp.target,
        business_email_verified_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET business_phone = v_otp.target,
        business_phone_verified_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    CASE WHEN v_otp.channel = 'email' THEN 'business_email_otp' ELSE 'business_phone_otp' END,
    'verified',
    'verified',
    jsonb_build_object('otp_id', v_otp.id, 'target', v_otp.target)
  );

  RETURN jsonb_build_object(
    'success', true,
    'channel', v_otp.channel,
    'target', v_otp.target,
    'verified_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';