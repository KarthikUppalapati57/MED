-- Add OTP verification for onboarding business email and phone.
-- The OTP state is enforced before business/EIN/SSN verification can be submitted.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS business_email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.onboarding_contact_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
  target TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  verified_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'provider_ready',
  provider_reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_contact_otps_user_channel ON public.onboarding_contact_otps(user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_contact_otps_target ON public.onboarding_contact_otps(channel, target);
CREATE INDEX IF NOT EXISTS idx_onboarding_contact_otps_status ON public.onboarding_contact_otps(status);

ALTER TABLE public.onboarding_contact_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_contact_otps_self_select" ON public.onboarding_contact_otps;
CREATE POLICY "onboarding_contact_otps_self_select"
  ON public.onboarding_contact_otps FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_contact_otps_self_insert" ON public.onboarding_contact_otps;
CREATE POLICY "onboarding_contact_otps_self_insert"
  ON public.onboarding_contact_otps FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_contact_otps_admin_update" ON public.onboarding_contact_otps;
CREATE POLICY "onboarding_contact_otps_admin_update"
  ON public.onboarding_contact_otps FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin');

DROP TRIGGER IF EXISTS touch_onboarding_contact_otps_updated_at ON public.onboarding_contact_otps;
CREATE TRIGGER touch_onboarding_contact_otps_updated_at
BEFORE UPDATE ON public.onboarding_contact_otps
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_contact_target(p_channel TEXT, p_target TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_target TEXT;
  v_digits TEXT;
BEGIN
  IF p_channel = 'email' THEN
    v_target := lower(btrim(COALESCE(p_target, '')));
    RETURN v_target;
  ELSIF p_channel = 'phone' THEN
    v_digits := regexp_replace(COALESCE(p_target, ''), '\D', '', 'g');
    IF length(v_digits) = 10 THEN
      RETURN '+1' || v_digits;
    ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '1' THEN
      RETURN '+' || v_digits;
    ELSE
      RETURN v_digits;
    END IF;
  END IF;

  RETURN btrim(COALESCE(p_target, ''));
END;
$$;

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
  v_otp_id UUID;
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
    user_id,
    channel,
    target,
    code_hash,
    provider,
    metadata
  )
  VALUES (
    v_user_id,
    v_channel,
    v_target,
    crypt(v_code, gen_salt('bf')),
    CASE WHEN v_channel = 'email' THEN 'email_provider_ready' ELSE 'sms_provider_ready' END,
    jsonb_build_object('delivery_mode', 'development_echo_until_provider_configured')
  )
  RETURNING id INTO v_otp_id;

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

  IF v_otp.code_hash <> crypt(btrim(COALESCE(p_code, '')), v_otp.code_hash) THEN
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

CREATE OR REPLACE FUNCTION public.ensure_onboarding_contact_verified(p_email TEXT, p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := public.normalize_contact_target('email', p_email);
  v_phone TEXT := public.normalize_contact_target('phone', p_phone);
  v_profile RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT business_email, business_email_verified_at, business_phone, business_phone_verified_at
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile.business_email_verified_at IS NULL OR v_profile.business_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Business email must be verified by OTP before business verification';
  END IF;

  IF v_profile.business_phone_verified_at IS NULL OR v_profile.business_phone IS DISTINCT FROM v_phone THEN
    RAISE EXCEPTION 'Business phone must be verified by OTP before business verification';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_business_verification_contact_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
  v_phone TEXT;
BEGIN
  IF public.get_auth_role() = 'platform_admin' THEN
    RETURN NEW;
  END IF;

  v_email := public.normalize_contact_target('email', NEW.metadata->>'email');
  v_phone := public.normalize_contact_target('phone', NEW.metadata->>'phone');

  SELECT business_email, business_email_verified_at, business_phone, business_phone_verified_at
  INTO v_profile
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_profile.business_email_verified_at IS NULL OR v_profile.business_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Business email must be verified by OTP before business verification';
  END IF;

  IF v_profile.business_phone_verified_at IS NULL OR v_profile.business_phone IS DISTINCT FROM v_phone THEN
    RAISE EXCEPTION 'Business phone must be verified by OTP before business verification';
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'email_verified', true,
    'email_verified_at', v_profile.business_email_verified_at,
    'phone_verified', true,
    'phone_verified_at', v_profile.business_phone_verified_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_business_verification_contact_otp ON public.business_verifications;
CREATE TRIGGER enforce_business_verification_contact_otp
BEFORE INSERT ON public.business_verifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_verification_contact_otp();

REVOKE EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_onboarding_contact_verified(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_onboarding_contact_otp(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_contact_otp(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_onboarding_contact_verified(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;