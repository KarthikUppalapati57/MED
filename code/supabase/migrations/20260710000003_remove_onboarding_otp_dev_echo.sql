-- Remove browser-visible onboarding OTP development echo.
-- OTP codes must be delivered by a secure server-side email/SMS provider, not
-- returned to the client. Until that provider is configured, fail closed.

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

  RAISE EXCEPTION 'Secure OTP delivery provider is not configured yet. Configure server-side email/SMS delivery before enabling onboarding contact OTP.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';