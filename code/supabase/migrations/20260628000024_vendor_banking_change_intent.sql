BEGIN;

ALTER TABLE public.vendor_banking_link_tokens
  ADD COLUMN IF NOT EXISTS intent text NOT NULL DEFAULT 'add';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.vendor_banking_link_tokens'::regclass
      AND conname = 'vendor_banking_link_tokens_intent_check'
  ) THEN
    ALTER TABLE public.vendor_banking_link_tokens
      ADD CONSTRAINT vendor_banking_link_tokens_intent_check
      CHECK (intent IN ('add', 'replace'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_vendor_banking_default_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ponytail: replace deactivates the prior default at the single "becoming
  -- default" point, so link submit and manual promotion cannot diverge. Ceiling:
  -- a future "switch default but keep both active" flow needs an explicit flag.
  IF NEW.is_default IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_default IS DISTINCT FROM TRUE) THEN
    UPDATE public.vendor_banking_details
       SET is_default = false,
           is_active = false,
           updated_at = now()
     WHERE vendor_id = NEW.vendor_id
       AND id IS DISTINCT FROM NEW.id
       AND is_default = true
       AND is_active = true
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vendor_banking_default_replacement ON public.vendor_banking_details;
CREATE TRIGGER enforce_vendor_banking_default_replacement
BEFORE INSERT OR UPDATE OF is_default ON public.vendor_banking_details
FOR EACH ROW
WHEN (NEW.is_default IS TRUE)
EXECUTE FUNCTION public.enforce_vendor_banking_default_replacement();

DROP FUNCTION IF EXISTS public.issue_vendor_banking_link(uuid);

CREATE OR REPLACE FUNCTION public.issue_vendor_banking_link(
  p_vendor_id uuid,
  p_intent text DEFAULT 'add'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_token public.vendor_banking_link_tokens%ROWTYPE;
  v_intent text := COALESCE(NULLIF(btrim(p_intent), ''), 'add');
BEGIN
  IF v_intent NOT IN ('add', 'replace') THEN
    RAISE EXCEPTION 'Invalid vendor banking link intent: %', p_intent;
  END IF;

  SELECT *
    INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(
    v_vendor.organization_id,
    v_vendor.brand_id,
    v_vendor.location_id,
    NULL::timestamptz,
    'location_manager'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_banking_link_tokens
     SET status = 'cancelled',
         updated_at = now(),
         updated_by = auth.uid()
   WHERE vendor_id = p_vendor_id
     AND status = 'pending'
     AND deleted_at IS NULL;

  INSERT INTO public.vendor_banking_link_tokens (vendor_id, intent)
  VALUES (p_vendor_id, v_intent)
  RETURNING * INTO v_token;

  RETURN jsonb_build_object(
    'id', v_token.id,
    'vendor_id', v_token.vendor_id,
    'organization_id', v_token.organization_id,
    'brand_id', v_token.brand_id,
    'location_id', v_token.location_id,
    'token', v_token.token,
    'status', v_token.status,
    'intent', v_token.intent,
    'expires_at', v_token.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_vendor_banking_via_link(
  p_token text,
  p_account text,
  p_routing text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.vendor_banking_link_tokens%ROWTYPE;
  v_bank public.vendor_banking_details%ROWTYPE;
  v_store_result jsonb;
BEGIN
  SELECT *
    INTO v_token
  FROM public.vendor_banking_link_tokens
  WHERE token = btrim(COALESCE(p_token, ''))
    AND status = 'pending'
    AND expires_at > now()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired banking link';
  END IF;

  INSERT INTO public.vendor_banking_details (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    verification_state,
    verified_at,
    is_default,
    created_by,
    updated_by
  ) VALUES (
    v_token.vendor_id,
    v_token.organization_id,
    v_token.brand_id,
    v_token.location_id,
    'verified',
    now(),
    false,
    v_token.created_by,
    v_token.created_by
  )
  RETURNING * INTO v_bank;

  v_store_result := public.store_vendor_banking_secret(v_bank.id, p_account, p_routing);

  IF v_token.intent = 'replace' THEN
    UPDATE public.vendor_banking_details
       SET is_default = true,
           updated_at = now()
     WHERE id = v_bank.id
     RETURNING * INTO v_bank;
  END IF;

  UPDATE public.vendor_banking_link_tokens
     SET status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   WHERE id = v_token.id;

  IF v_token.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      organization_id,
      brand_id,
      location_id,
      title,
      message,
      type,
      is_read,
      metadata
    ) VALUES (
      v_token.created_by,
      v_token.organization_id,
      v_token.brand_id,
      v_token.location_id,
      'Vendor submitted banking details',
      'A vendor submitted banking details through the secure link.',
      'system',
      false,
      jsonb_build_object(
        'vendor_id', v_token.vendor_id,
        'banking_row_id', v_bank.id,
        'token_id', v_token.id,
        'intent', v_token.intent
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_token.vendor_id,
    'banking_row_id', v_bank.id,
    'banking_secret_id', v_store_result->>'banking_secret_id',
    'account_last4', v_store_result->>'account_last4',
    'intent', v_token.intent,
    'is_default', v_bank.is_default
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

GRANT SELECT (intent) ON public.vendor_banking_link_tokens TO authenticated;

COMMIT;
