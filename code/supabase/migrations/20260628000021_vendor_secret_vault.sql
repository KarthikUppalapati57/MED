BEGIN;

ALTER TABLE public.vendor_banking_details
  ADD COLUMN IF NOT EXISTS banking_secret_id uuid;

ALTER TABLE public.vendor_tax_information
  ADD COLUMN IF NOT EXISTS tax_secret_id uuid;

ALTER TABLE public.vendor_banking_details
  DROP COLUMN IF EXISTS account_number,
  DROP COLUMN IF EXISTS routing_number;

ALTER TABLE public.vendor_tax_information
  DROP COLUMN IF EXISTS tax_id_full;

CREATE OR REPLACE FUNCTION public.store_vendor_banking_secret(
  p_banking_row_id uuid,
  p_account text,
  p_routing text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text := 'vbank_' || p_banking_row_id::text;
  v_secret_id uuid;
  v_row public.vendor_banking_details%ROWTYPE;
  v_payload text;
  v_last4 text;
BEGIN
  SELECT *
    INTO v_row
  FROM public.vendor_banking_details
  WHERE id = p_banking_row_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vendor banking row % not found', p_banking_row_id;
  END IF;

  IF NULLIF(regexp_replace(COALESCE(p_account, ''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'Account number is required';
  END IF;

  IF NULLIF(regexp_replace(COALESCE(p_routing, ''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'Routing number is required';
  END IF;

  v_last4 := right(regexp_replace(p_account, '\D', '', 'g'), 4);
  v_payload := jsonb_build_object('account', p_account, 'routing', p_routing)::text;

  -- Ponytail: the Vault name is keyed on the banking row id, not vendor/org id,
  -- so a vendor's multiple accounts cannot overwrite each other's secrets.
  SELECT id
    INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  SELECT *
    INTO v_secret_id
  FROM vault.create_secret(v_payload, v_secret_name, 'vendor banking');

  UPDATE public.vendor_banking_details
     SET banking_secret_id = v_secret_id,
         account_last4 = v_last4,
         updated_at = now()
   WHERE id = p_banking_row_id;

  RETURN jsonb_build_object(
    'banking_row_id', p_banking_row_id,
    'banking_secret_id', v_secret_id,
    'account_last4', v_last4
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.store_vendor_tax_secret(
  p_tax_row_id uuid,
  p_tax_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text := 'vtax_' || p_tax_row_id::text;
  v_secret_id uuid;
  v_row public.vendor_tax_information%ROWTYPE;
  v_last4 text;
BEGIN
  SELECT *
    INTO v_row
  FROM public.vendor_tax_information
  WHERE id = p_tax_row_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vendor tax row % not found', p_tax_row_id;
  END IF;

  IF NULLIF(regexp_replace(COALESCE(p_tax_id, ''), '\D', '', 'g'), '') IS NULL THEN
    RAISE EXCEPTION 'Tax id is required';
  END IF;

  v_last4 := public.mask_tax_identifier(p_tax_id);

  -- Ponytail: the Vault name is keyed on the tax row id, not vendor/org id,
  -- so later vendor tax records do not collide with earlier records.
  SELECT id
    INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  SELECT *
    INTO v_secret_id
  FROM vault.create_secret(p_tax_id, v_secret_name, 'vendor tax id');

  UPDATE public.vendor_tax_information
     SET tax_secret_id = v_secret_id,
         tax_id_last4 = v_last4,
         updated_at = now()
   WHERE id = p_tax_row_id;

  RETURN jsonb_build_object(
    'tax_row_id', p_tax_row_id,
    'tax_secret_id', v_secret_id,
    'tax_id_last4', v_last4
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_banking_for_audit(
  p_banking_row_id uuid
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
  -- Ponytail: service-role/audit/dispute path ONLY, never user-facing.
  -- Every call should be audit-logged; audit logging is deferred to the audit phase.
  SELECT banking_secret_id
    INTO v_secret_id
  FROM public.vendor_banking_details
  WHERE id = p_banking_row_id
    AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Vendor banking secret for row % not found', p_banking_row_id;
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

CREATE OR REPLACE FUNCTION public.get_vendor_tax_for_audit(
  p_tax_row_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
  v_secret text;
BEGIN
  -- Ponytail: service-role/audit/dispute path ONLY, never user-facing.
  -- Every call should be audit-logged; audit logging is deferred to the audit phase.
  SELECT tax_secret_id
    INTO v_secret_id
  FROM public.vendor_tax_information
  WHERE id = p_tax_row_id
    AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Vendor tax secret for row % not found', p_tax_row_id;
  END IF;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found', v_secret_id;
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.store_vendor_banking_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_vendor_tax_secret(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vendor_banking_for_audit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vendor_tax_for_audit(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_vendor_banking_secret(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_vendor_tax_secret(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_banking_for_audit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_tax_for_audit(uuid) TO service_role;

GRANT SELECT (banking_secret_id) ON public.vendor_banking_details TO authenticated;
GRANT SELECT (tax_secret_id) ON public.vendor_tax_information TO authenticated;

COMMIT;
