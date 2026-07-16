-- Real EIN/SSN storage + a tenant-facing reveal toggle.
--
-- Today submit_business_verification() only ever stores identifier_last4 (via
-- mask_tax_identifier) -- the full EIN/SSN is discarded, so no "show full value" toggle can
-- exist because there is nothing to reveal. Product decision: keep the verification provider
-- call simulated for now (no live KYB/KYC API key yet), but persist the full identifier
-- encrypted in Supabase Vault -- the same pattern already used for bank account secrets
-- (store_onboarding_bank_secret) -- so a tenant-facing reveal toggle has something real to
-- show, while the admin queue keeps showing last-4-only, exactly as before.
--
-- reveal_my_tax_identifier() is deliberately self-only: it takes no user id parameter and
-- always operates on auth.uid()'s own most recent business_verifications row. There is no
-- equivalent admin-facing reveal RPC -- that is the enforcement that platform admins can
-- never see the full value, only ever identifier_last4 (already the case in
-- PlatformOrganizations.jsx and platform_business_verification_reviews()).

BEGIN;

ALTER TABLE public.business_verifications ADD COLUMN IF NOT EXISTS tax_identifier_secret_id UUID;

CREATE OR REPLACE FUNCTION public.store_tax_identifier_secret(p_business_verification_id uuid, p_identifier_type text, p_full_identifier text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
  v_secret_id UUID;
  v_secret_name TEXT;
  v_payload TEXT;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.business_verifications
  WHERE id = p_business_verification_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Business verification not found';
  END IF;

  v_secret_name := 'onboarding-tax-id-' || p_business_verification_id::text || '-' || extract(epoch from clock_timestamp())::text;
  v_payload := jsonb_build_object(
    'business_verification_id', p_business_verification_id,
    'user_id', v_user_id,
    'identifier_type', p_identifier_type,
    'full_identifier', p_full_identifier,
    'stored_at', now()
  )::text;

  SELECT vault.create_secret(v_payload, v_secret_name, 'tenant onboarding tax identifier')
    INTO v_secret_id;

  UPDATE public.business_verifications
  SET tax_identifier_secret_id = v_secret_id
  WHERE id = p_business_verification_id;

  RETURN v_secret_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reveal_my_tax_identifier()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_secret_id UUID;
  v_identifier_type TEXT;
  v_decrypted TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT tax_identifier_secret_id, identifier_type
  INTO v_secret_id, v_identifier_type
  FROM public.business_verifications
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'No stored tax identifier to reveal';
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'Stored tax identifier could not be decrypted';
  END IF;

  RETURN jsonb_build_object(
    'identifier_type', v_identifier_type,
    'full_identifier', (v_decrypted::jsonb)->>'full_identifier'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_business_verification(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_legal_name TEXT;
  v_business_type TEXT;
  v_identifier_type TEXT;
  v_identifier_required BOOLEAN;
  v_full_identifier TEXT;
  v_identifier_last4 TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_website TEXT;
  v_provider TEXT;
  v_score INTEGER := 0;
  v_status TEXT;
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
  v_full_identifier := CASE WHEN v_identifier_required THEN regexp_replace(COALESCE(p_payload->>'taxIdentifier', ''), '\D', '', 'g') ELSE NULL END;
  v_identifier_last4 := CASE WHEN v_identifier_required THEN public.mask_tax_identifier(p_payload->>'taxIdentifier') ELSE NULL END;
  v_email := NULLIF(btrim(p_payload->>'email'), '');
  v_phone := NULLIF(btrim(p_payload->>'phone'), '');
  v_website := NULLIF(btrim(p_payload->>'website'), '');

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

  v_score := CASE
    WHEN NOT v_identifier_required THEN 60
    WHEN v_identifier_type = 'ein' THEN 50
    ELSE 45
  END;
  IF v_email LIKE '%@%' THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 THEN v_score := v_score + 10; END IF;
  IF v_website IS NOT NULL THEN v_score := v_score + 10; END IF;
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
    metadata,
    reviewed_by,
    reviewed_at,
    rejection_reason,
    updated_at
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
    ),
    NULL,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE
  SET legal_business_name = EXCLUDED.legal_business_name,
      business_type = EXCLUDED.business_type,
      identifier_type = EXCLUDED.identifier_type,
      identifier_last4 = EXCLUDED.identifier_last4,
      provider_name = EXCLUDED.provider_name,
      provider_reference_id = EXCLUDED.provider_reference_id,
      verification_status = EXCLUDED.verification_status,
      trust_score = EXCLUDED.trust_score,
      metadata = EXCLUDED.metadata,
      reviewed_by = NULL,
      reviewed_at = NULL,
      rejection_reason = NULL,
      updated_at = now()
  RETURNING id INTO v_verification_id;

  IF v_identifier_required AND length(COALESCE(v_full_identifier, '')) > 0 THEN
    PERFORM public.store_tax_identifier_secret(v_verification_id, v_identifier_type, v_full_identifier);
  END IF;

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
$function$;

GRANT EXECUTE ON FUNCTION public.reveal_my_tax_identifier() TO authenticated;

COMMIT;
