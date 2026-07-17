-- Task 5: capture_tenant_payment_signature previously set profiles.banking_onboarding_completed
-- = true after the FIRST signature captured for ANY bank account, which would kick the tenant
-- out of the banking page before they'd signed every account they'd added (Task 4 made adding
-- multiple accounts real). Onboarding should only finish once every non-inactive bank account
-- the tenant added has been signed. Rewritten to check that condition instead, and to return
-- 'all_accounts_signed' so the frontend knows whether to finalize or prompt for the next account.

BEGIN;

CREATE OR REPLACE FUNCTION public.capture_tenant_payment_signature(
  p_bank_account_id uuid,
  p_signer_full_name text,
  p_signer_title text,
  p_consent_version text,
  p_consent_text text,
  p_signature_sha256 text,
  p_signature_payload jsonb DEFAULT '{}'::jsonb,
  p_signature_storage_path text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_auth_id UUID;
  v_run_id UUID;
  v_account public.onboarding_bank_accounts%ROWTYPE;
  v_all_signed BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_account
  FROM public.onboarding_bank_accounts
  WHERE id = p_bank_account_id AND user_id = v_user_id AND status <> 'inactive';

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  IF NULLIF(btrim(COALESCE(p_signer_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Signer full name is required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_signature_sha256, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Signature hash is required';
  END IF;

  IF v_account.billing_address_source = 'custom' THEN
    IF NULLIF(btrim(v_account.billing_address_line1), '') IS NULL
       OR NULLIF(btrim(v_account.billing_address_city), '') IS NULL
       OR NULLIF(btrim(v_account.billing_address_state), '') IS NULL
       OR NULLIF(btrim(v_account.billing_address_postal_code), '') IS NULL
       OR NULLIF(btrim(v_account.billing_address_country), '') IS NULL THEN
      RAISE EXCEPTION 'A complete custom billing address (line 1, city, state, postal code, country) is required';
    END IF;
  END IF;

  UPDATE public.tenant_payment_authorizations
  SET status = 'revoked',
      updated_at = now()
  WHERE onboarding_bank_account_id = p_bank_account_id
    AND user_id = v_user_id
    AND status = 'active';

  INSERT INTO public.tenant_payment_authorizations (
    user_id,
    onboarding_bank_account_id,
    signer_full_name,
    signer_title,
    consent_version,
    consent_text,
    consent_accepted,
    signature_storage_path,
    signature_sha256,
    signature_payload,
    user_agent,
    status
  )
  VALUES (
    v_user_id,
    p_bank_account_id,
    btrim(p_signer_full_name),
    NULLIF(btrim(COALESCE(p_signer_title, '')), ''),
    COALESCE(NULLIF(btrim(p_consent_version), ''), 'tenant-bank-authorization-v1'),
    p_consent_text,
    true,
    NULLIF(btrim(COALESCE(p_signature_storage_path, '')), ''),
    btrim(p_signature_sha256),
    COALESCE(p_signature_payload, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_user_agent, '')), ''),
    'active'
  )
  RETURNING id INTO v_auth_id;

  UPDATE public.onboarding_bank_accounts
  SET status = 'authorized'
  WHERE id = p_bank_account_id;

  -- Onboarding is only "done" once every non-inactive account the tenant added has moved past
  -- pending_signature -- not after the first one, since Task 4 made multi-account real.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.onboarding_bank_accounts
    WHERE user_id = v_user_id AND status = 'pending_signature'
  ) INTO v_all_signed;

  IF v_all_signed THEN
    UPDATE public.profiles
    SET banking_onboarding_completed = true,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'bank_authorization',
    'signature_captured',
    'authorized',
    jsonb_build_object('onboarding_bank_account_id', p_bank_account_id, 'authorization_id', v_auth_id, 'all_accounts_signed', v_all_signed)
  );

  RETURN jsonb_build_object(
    'success', true,
    'authorization_id', v_auth_id,
    'bank_account_id', p_bank_account_id,
    'status', 'authorized',
    'all_accounts_signed', v_all_signed
  );
END;
$function$;

COMMIT;
