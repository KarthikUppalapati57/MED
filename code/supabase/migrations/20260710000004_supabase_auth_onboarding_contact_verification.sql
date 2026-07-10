-- Mark onboarding contact verification after Supabase Auth OTP succeeds.
-- OTP delivery and token verification are handled by Supabase Auth; this RPC only
-- persists the verified contact on the onboarding profile for workflow gates.

CREATE OR REPLACE FUNCTION public.mark_onboarding_contact_verified(
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
    jsonb_build_object('target', v_target, 'provider', 'supabase_auth')
  );

  RETURN jsonb_build_object(
    'success', true,
    'channel', v_channel,
    'target', v_target,
    'verified_at', now(),
    'provider', 'supabase_auth'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_onboarding_contact_verified(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_contact_verified(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';