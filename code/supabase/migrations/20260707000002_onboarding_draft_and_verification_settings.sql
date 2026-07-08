BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_draft JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.platform_onboarding_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  ein_verification_enabled BOOLEAN NOT NULL DEFAULT true,
  ssn_verification_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_onboarding_settings_singleton CHECK (id = true)
);

INSERT INTO public.platform_onboarding_settings (id, ein_verification_enabled, ssn_verification_enabled)
VALUES (true, true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_onboarding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_onboarding_settings_read ON public.platform_onboarding_settings;
CREATE POLICY platform_onboarding_settings_read
  ON public.platform_onboarding_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS platform_onboarding_settings_admin_update ON public.platform_onboarding_settings;
CREATE POLICY platform_onboarding_settings_admin_update
  ON public.platform_onboarding_settings FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

CREATE OR REPLACE FUNCTION public.touch_platform_onboarding_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_platform_onboarding_settings ON public.platform_onboarding_settings;
CREATE TRIGGER trg_touch_platform_onboarding_settings
  BEFORE UPDATE ON public.platform_onboarding_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_onboarding_settings_updated_at();

CREATE OR REPLACE FUNCTION public.get_onboarding_verification_settings()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'ein_verification_enabled', ein_verification_enabled,
    'ssn_verification_enabled', ssn_verification_enabled,
    'updated_at', updated_at
  )
  FROM public.platform_onboarding_settings
  WHERE id = true;
$$;

CREATE OR REPLACE FUNCTION public.update_onboarding_verification_settings(
  p_ein_enabled BOOLEAN,
  p_ssn_enabled BOOLEAN
)
RETURNS JSONB
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
      ssn_verification_enabled = COALESCE(p_ssn_enabled, ssn_verification_enabled)
  WHERE id = true
  RETURNING * INTO v_settings;

  RETURN jsonb_build_object(
    'success', true,
    'ein_verification_enabled', v_settings.ein_verification_enabled,
    'ssn_verification_enabled', v_settings.ssn_verification_enabled,
    'updated_at', v_settings.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_business_verification_draft()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT onboarding_draft, onboarding_current_step, onboarding_status
  INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'draft', COALESCE(v_profile.onboarding_draft, '{}'::jsonb),
    'current_step', v_profile.onboarding_current_step,
    'status', v_profile.onboarding_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_business_verification_draft(
  p_payload JSONB,
  p_step TEXT DEFAULT 'business_information'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_step TEXT := COALESCE(NULLIF(btrim(p_step), ''), 'business_information');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
  SET onboarding_draft = COALESCE(p_payload, '{}'::jsonb),
      onboarding_status = CASE WHEN onboarding_status = 'completed' THEN onboarding_status ELSE 'in_progress' END,
      onboarding_current_step = v_step,
      updated_at = now()
  WHERE id = v_user_id;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(v_run_id, v_user_id, v_step, 'draft_saved', 'in_progress', jsonb_build_object('source', 'business_verification'));

  RETURN jsonb_build_object('success', true, 'current_step', v_step);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_business_verification(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_legal_name TEXT;
  v_business_type TEXT;
  v_identifier_type TEXT;
  v_identifier_required BOOLEAN;
  v_identifier_last4 TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_website TEXT;
  v_provider TEXT;
  v_score INTEGER := 0;
  v_status TEXT;
  v_business_address JSONB;
  v_mailing_address JSONB;
  v_service_address JSONB;
  v_same_mailing BOOLEAN;
  v_verification_id UUID;
  v_settings RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT ein_verification_enabled, ssn_verification_enabled
  INTO v_settings
  FROM public.platform_onboarding_settings
  WHERE id = true;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  v_legal_name := NULLIF(btrim(p_payload->>'legalName'), '');
  v_business_type := COALESCE(NULLIF(btrim(p_payload->>'businessType'), ''), 'llc');
  v_identifier_type := COALESCE(NULLIF(btrim(p_payload->>'identifierType'), ''), public.required_tax_identifier_type_for_business_type(v_business_type));
  v_identifier_required := CASE
    WHEN v_identifier_type = 'ein' THEN COALESCE(v_settings.ein_verification_enabled, true)
    WHEN v_identifier_type = 'ssn' THEN COALESCE(v_settings.ssn_verification_enabled, true)
    ELSE true
  END;
  v_identifier_last4 := CASE WHEN v_identifier_required THEN public.mask_tax_identifier(p_payload->>'taxIdentifier') ELSE NULL END;
  v_email := NULLIF(btrim(p_payload->>'email'), '');
  v_phone := NULLIF(btrim(p_payload->>'phone'), '');
  v_website := NULLIF(btrim(p_payload->>'website'), '');
  v_business_address := COALESCE(p_payload->'businessAddress', '{}'::jsonb);
  v_same_mailing := COALESCE((p_payload->>'sameMailing')::boolean, true);
  v_mailing_address := CASE
    WHEN v_same_mailing THEN v_business_address
    ELSE COALESCE(p_payload->'mailingAddress', '{}'::jsonb)
  END;
  v_service_address := COALESCE(p_payload->'serviceAddress', '{}'::jsonb);

  IF v_legal_name IS NULL THEN
    RAISE EXCEPTION 'Legal business name is required';
  END IF;

  IF v_identifier_type NOT IN ('ein', 'ssn') THEN
    RAISE EXCEPTION 'Tax identifier type must be ein or ssn';
  END IF;

  IF v_identifier_type IS DISTINCT FROM public.required_tax_identifier_type_for_business_type(v_business_type) THEN
    RAISE EXCEPTION 'Tax identifier type % is not allowed for business type %', v_identifier_type, v_business_type;
  END IF;

  IF v_identifier_required AND length(COALESCE(v_identifier_last4, '')) <> 4 THEN
    RAISE EXCEPTION 'Valid tax identifier is required';
  END IF;

  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid business email is required';
  END IF;

  IF length(regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'A valid business phone number is required';
  END IF;

  IF NULLIF(btrim(v_business_address->>'line1'), '') IS NULL
     OR NULLIF(btrim(v_business_address->>'city'), '') IS NULL
     OR NULLIF(btrim(v_business_address->>'state'), '') IS NULL
     OR length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\D', '', 'g')) < 5 THEN
    RAISE EXCEPTION 'Business address must include street, city, state, and ZIP';
  END IF;

  IF NULLIF(btrim(v_service_address->>'line1'), '') IS NULL
     OR NULLIF(btrim(v_service_address->>'city'), '') IS NULL
     OR NULLIF(btrim(v_service_address->>'state'), '') IS NULL
     OR length(regexp_replace(COALESCE(v_service_address->>'zip', ''), '\D', '', 'g')) < 5 THEN
    RAISE EXCEPTION 'Service address must include street, city, state, and ZIP';
  END IF;

  v_score := CASE
    WHEN NOT v_identifier_required THEN 60
    WHEN v_identifier_type = 'ein' THEN 50
    ELSE 45
  END;
  IF v_email LIKE '%@%' THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 THEN v_score := v_score + 10; END IF;
  IF v_website IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\D', '', 'g')) >= 5 THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(COALESCE(v_service_address->>'zip', ''), '\D', '', 'g')) >= 5 THEN v_score := v_score + 10; END IF;
  v_score := LEAST(v_score, 100);
  v_status := CASE WHEN v_score >= 80 THEN 'verified' WHEN v_score >= 50 THEN 'pending_review' ELSE 'failed' END;
  v_provider := CASE
    WHEN NOT v_identifier_required THEN v_identifier_type || '_verification_disabled_by_platform'
    WHEN v_identifier_type = 'ein' THEN 'global_database_kyb'
    ELSE 'searchbug_ssn'
  END;

  INSERT INTO public.business_verifications (
    user_id,
    legal_business_name,
    business_type,
    identifier_type,
    identifier_last4,
    provider_name,
    provider_reference_id,
    verification_status,
    trust_score,
    metadata
  )
  VALUES (
    v_user_id,
    v_legal_name,
    v_business_type,
    v_identifier_type,
    v_identifier_last4,
    v_provider,
    CASE WHEN v_identifier_required THEN 'provider-ready-' || replace(gen_random_uuid()::text, '-', '') ELSE 'verification-disabled' END,
    v_status,
    v_score,
    jsonb_build_object(
      'email', v_email,
      'phone', v_phone,
      'website', v_website,
      'tax_identifier_required', v_identifier_required,
      'ein_verification_enabled', COALESCE(v_settings.ein_verification_enabled, true),
      'ssn_verification_enabled', COALESCE(v_settings.ssn_verification_enabled, true),
      'provider_mode', CASE WHEN v_identifier_required THEN 'simulation_until_provider_keys_configured' ELSE 'disabled_by_platform_admin' END
    )
  )
  RETURNING id INTO v_verification_id;

  DELETE FROM public.organization_addresses
  WHERE user_id = v_user_id
    AND organization_id IS NULL;

  INSERT INTO public.organization_addresses (
    user_id,
    address_type,
    location_name,
    address_line_1,
    address_line_2,
    city,
    state,
    zip_code,
    country,
    usps_verified,
    usps_standardized,
    usps_validation_code
  )
  VALUES
    (v_user_id, 'business', NULL, btrim(v_business_address->>'line1'), NULLIF(btrim(v_business_address->>'line2'), ''), btrim(v_business_address->>'city'), btrim(v_business_address->>'state'), btrim(v_business_address->>'zip'), 'US', true, true, 'PROVIDER_READY_USPS'),
    (v_user_id, 'mailing', NULL, btrim(v_mailing_address->>'line1'), NULLIF(btrim(v_mailing_address->>'line2'), ''), btrim(v_mailing_address->>'city'), btrim(v_mailing_address->>'state'), btrim(v_mailing_address->>'zip'), 'US', true, true, CASE WHEN v_same_mailing THEN 'SAME_AS_BUSINESS' ELSE 'PROVIDER_READY_USPS' END),
    (v_user_id, 'service', NULLIF(btrim(p_payload->>'serviceLocationName'), ''), btrim(v_service_address->>'line1'), NULLIF(btrim(v_service_address->>'line2'), ''), btrim(v_service_address->>'city'), btrim(v_service_address->>'state'), btrim(v_service_address->>'zip'), 'US', true, true, 'PROVIDER_READY_USPS');

  UPDATE public.profiles
  SET business_verification_status = v_status,
      business_verification_score = v_score,
      business_verification_provider = v_provider,
      business_verified_at = CASE WHEN v_status = 'verified' THEN now() ELSE NULL END,
      business_type = v_business_type,
      tax_identifier_type = v_identifier_type,
      tax_identifier_last4 = v_identifier_last4,
      onboarding_draft = '{}'::jsonb,
      onboarding_status = CASE WHEN v_status = 'pending_review' THEN 'pending_review' ELSE 'in_progress' END,
      onboarding_current_step = CASE WHEN v_status = 'verified' THEN 'payment_method' ELSE 'business_verification' END,
      updated_at = now()
  WHERE id = v_user_id;

  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'business_verification',
    CASE WHEN v_status = 'verified' THEN 'verified' WHEN v_status = 'failed' THEN 'failed' ELSE 'submitted' END,
    v_status,
    jsonb_build_object('verification_id', v_verification_id, 'trust_score', v_score, 'tax_identifier_required', v_identifier_required)
  );

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', v_verification_id,
    'status', v_status,
    'trust_score', v_score,
    'tax_identifier_required', v_identifier_required,
    'next_step', CASE WHEN v_status = 'verified' THEN 'payment_method' ELSE 'manual_review' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_verification_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_onboarding_verification_settings(BOOLEAN, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_business_verification_draft() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_business_verification_draft(JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
