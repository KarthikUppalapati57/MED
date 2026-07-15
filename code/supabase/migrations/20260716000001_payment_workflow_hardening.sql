BEGIN;

-- payments.failure_reason: lets the UI show WHY a payout failed, not just that it did.
-- Nothing sets payments.status='failed' synchronously today (process-payout /
-- process-checkbook-payout leave a payment row stuck at 'processing' forever if the
-- Dwolla/Checkbook HTTP call throws) -- fixed alongside this migration in the edge functions.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason text;

-- Mirrors vendor_banking_details' vault pattern (20260628000021_vendor_secret_vault.sql) for
-- the org's OWN bank account, which today only ever stores last-4 digits and has nowhere to
-- keep a real routing/account number for creating a real Dwolla funding source.
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS banking_secret_id uuid;

-- Org-level Dwolla Customer URL (mirrors vendors.dwolla_customer_url, 20260624000013), so the
-- org only needs one Dwolla customer created once, reused across all its payment accounts.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS dwolla_customer_url text;

CREATE OR REPLACE FUNCTION public.store_payment_account_banking_secret(
  p_account_id uuid,
  p_account text,
  p_routing text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text := 'pabank_' || p_account_id::text;
  v_secret_id uuid;
  v_row public.payment_accounts%ROWTYPE;
  v_payload text;
  v_last4 text;
BEGIN
  SELECT *
    INTO v_row
  FROM public.payment_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Payment account % not found', p_account_id;
  END IF;

  IF NULLIF(regexp_replace(COALESCE(p_account, ''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'Account number is required';
  END IF;

  IF NULLIF(regexp_replace(COALESCE(p_routing, ''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'Routing number is required';
  END IF;

  v_last4 := right(regexp_replace(p_account, '\D', '', 'g'), 4);
  v_payload := jsonb_build_object('account', p_account, 'routing', p_routing)::text;

  -- Same convention as store_vendor_banking_secret: Vault name keyed on the account row id.
  SELECT id
    INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  SELECT *
    INTO v_secret_id
  FROM vault.create_secret(v_payload, v_secret_name, 'payment account banking');

  UPDATE public.payment_accounts
     SET banking_secret_id = v_secret_id,
         last_four = v_last4,
         updated_at = now()
   WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'account_id', p_account_id,
    'banking_secret_id', v_secret_id,
    'last_four', v_last4
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_account_banking_for_audit(
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
  v_secret text;
BEGIN
  -- service-role only, same as get_vendor_banking_for_audit: used exclusively by
  -- create-dwolla-funding-source to retrieve the org's real bank details for the Dwolla API call.
  SELECT banking_secret_id
    INTO v_secret_id
  FROM public.payment_accounts
  WHERE id = p_account_id;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Payment account banking secret for % not found', p_account_id;
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found', v_secret_id;
  END IF;

  RETURN v_secret::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.store_payment_account_banking_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payment_account_banking_for_audit(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_payment_account_banking_secret(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_account_banking_for_audit(uuid) TO service_role;

COMMIT;
