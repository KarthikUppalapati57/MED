-- Adds a post-hierarchy "Complete Onboarding" step: the org's own operating bank account for
-- AP/vendor bill-pay (Dwolla-vaulted, via the existing onboarding_bank_accounts /
-- tenant_payment_authorizations infra from 20260706000001) -- separate from payment_verified,
-- which only means "the RestOps subscription has a payment method" and is required BEFORE
-- setup_onboarding_hierarchy runs. banking_onboarding_completed is required AFTER hierarchy
-- setup, unrelated to how the tenant pays RestOps.
--
-- Non-negotiable: this column defaults false, is never backfilled, and is never touched by
-- signup/business-verification/subscription-payment/hierarchy-setup flows. The ONLY writer is
-- capture_tenant_payment_signature(), and only after it verifies (a) the bank account belongs
-- to the caller and is in a signable state, (b) the signature/consent row was written and the
-- account marked authorized, (c) the billing address is valid -- including, when
-- billing_address_source = 'custom', that all custom address fields (line1/city/state/
-- postal_code/country; line2 optional) are present.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banking_onboarding_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.onboarding_bank_accounts
  ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_state TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_country TEXT;

ALTER TABLE public.onboarding_bank_accounts
  DROP CONSTRAINT IF EXISTS onboarding_bank_accounts_billing_address_source_check;
ALTER TABLE public.onboarding_bank_accounts
  ADD CONSTRAINT onboarding_bank_accounts_billing_address_source_check
  CHECK (billing_address_source = ANY (ARRAY['business'::text, 'mailing'::text, 'service'::text, 'custom'::text]));

CREATE OR REPLACE FUNCTION public.submit_onboarding_bank_account(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_bank_id UUID;
  v_run_id UUID;
  v_account_number TEXT;
  v_routing_number TEXT;
  v_is_default BOOLEAN;
  v_billing_source TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_account_number := regexp_replace(COALESCE(p_payload->>'account_number', ''), '[^0-9]', '', 'g');
  v_routing_number := regexp_replace(COALESCE(p_payload->>'routing_number', ''), '[^0-9]', '', 'g');
  v_is_default := COALESCE((p_payload->>'is_default')::boolean, false)
    OR NOT EXISTS (
      SELECT 1 FROM public.onboarding_bank_accounts
      WHERE user_id = v_user_id AND status <> 'inactive'
    );
  v_billing_source := COALESCE(NULLIF(p_payload->>'billing_address_source', ''), 'business');

  IF NULLIF(btrim(COALESCE(p_payload->>'bank_name', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_payload->>'account_holder_name', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Account holder name is required';
  END IF;

  IF COALESCE(p_payload->>'account_type', '') NOT IN ('checking', 'savings') THEN
    RAISE EXCEPTION 'Account type must be checking or savings';
  END IF;

  IF length(v_routing_number) <> 9 THEN
    RAISE EXCEPTION 'Routing number must be 9 digits';
  END IF;

  IF length(v_account_number) < 4 OR length(v_account_number) > 17 THEN
    RAISE EXCEPTION 'Account number must be between 4 and 17 digits';
  END IF;

  IF v_is_default THEN
    UPDATE public.onboarding_bank_accounts
    SET is_default = false
    WHERE user_id = v_user_id AND status <> 'inactive';
  END IF;

  INSERT INTO public.onboarding_bank_accounts (
    user_id,
    bank_name,
    account_holder_name,
    account_type,
    nickname,
    routing_number_last4,
    account_number_last4,
    billing_address_source,
    billing_address_line1,
    billing_address_line2,
    billing_address_city,
    billing_address_state,
    billing_address_postal_code,
    billing_address_country,
    is_default,
    status,
    metadata
  )
  VALUES (
    v_user_id,
    btrim(p_payload->>'bank_name'),
    btrim(p_payload->>'account_holder_name'),
    p_payload->>'account_type',
    NULLIF(btrim(COALESCE(p_payload->>'nickname', '')), ''),
    right(v_routing_number, 4),
    right(v_account_number, 4),
    v_billing_source,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_line1', '')), '') END,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_line2', '')), '') END,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_city', '')), '') END,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_state', '')), '') END,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_postal_code', '')), '') END,
    CASE WHEN v_billing_source = 'custom' THEN NULLIF(btrim(COALESCE(p_payload->>'billing_address_country', '')), '') END,
    v_is_default,
    'pending_signature',
    COALESCE(p_payload->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_bank_id;

  PERFORM public.store_onboarding_bank_secret(v_bank_id, v_account_number, v_routing_number);

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'bank_authorization',
    'bank_account_submitted',
    'pending_signature',
    jsonb_build_object('onboarding_bank_account_id', v_bank_id)
  );

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'bank_account', jsonb_build_object(
        'id', id,
        'bank_name', bank_name,
        'account_holder_name', account_holder_name,
        'account_type', account_type,
        'nickname', nickname,
        'routing_number_last4', routing_number_last4,
        'account_number_last4', account_number_last4,
        'billing_address_source', billing_address_source,
        'is_default', is_default,
        'status', status
      )
    )
    FROM public.onboarding_bank_accounts
    WHERE id = v_bank_id
  );
END;
$function$;

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

  UPDATE public.profiles
  SET banking_onboarding_completed = true,
      updated_at = now()
  WHERE id = v_user_id;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'bank_authorization',
    'signature_captured',
    'authorized',
    jsonb_build_object('onboarding_bank_account_id', p_bank_account_id, 'authorization_id', v_auth_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'authorization_id', v_auth_id,
    'bank_account_id', p_bank_account_id,
    'status', 'authorized'
  );
END;
$function$;

COMMIT;
