-- Advisory business-name check, matching the username pattern (20260720000015) in spirit --
-- but NOT its enforcement. Product decision: unlike a username (a login identifier that must
-- be unique), a legal business name legitimately collides in the real world -- two unrelated
-- tenants can both be "Downtown Grill LLC" -- so this is warn-only. There is no unique
-- constraint on business_verifications.legal_business_name, and submit_business_verification()
-- is untouched by this migration: a duplicate name still submits successfully.
--
-- is_business_name_available() is the same live pre-check shape as
-- is_username_available()/resolve_username_email() (case-insensitive, self-excluding so a
-- tenant resubmitting their own name isn't flagged against themselves) -- the frontend uses it
-- to show a soft "a business with this name already exists -- is this you?" nudge on the
-- Business Information step, without blocking Next/Submit.

BEGIN;

-- A separate session applied the original hard-block draft of this migration before it could
-- be rewritten (the unique index + the RAISE EXCEPTION in submit_business_verification()).
-- Undo both explicitly rather than assuming a clean base -- this migration is now the
-- corrective version, not a fresh one.
DROP INDEX IF EXISTS public.business_verifications_legal_name_unique;

CREATE INDEX IF NOT EXISTS idx_business_verifications_legal_name_lower
  ON public.business_verifications (lower(btrim(legal_business_name)));

CREATE OR REPLACE FUNCTION public.is_business_name_available(p_legal_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text := lower(btrim(p_legal_name));
  v_caller uuid := auth.uid();
BEGIN
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN true;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.business_verifications
    WHERE lower(btrim(legal_business_name)) = v_normalized
      AND (v_caller IS NULL OR user_id IS DISTINCT FROM v_caller)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_business_name_available(text) TO authenticated;

-- Restore submit_business_verification() to the 20260720000017 body (no name-based block) --
-- the separate session's applied draft added a RAISE EXCEPTION here that must come back out.
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

COMMIT;
