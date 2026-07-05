BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_banking_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  submitted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_banking_link_tokens_token_idx
  ON public.vendor_banking_link_tokens (token)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_banking_link_tokens_one_pending_per_vendor_idx
  ON public.vendor_banking_link_tokens (vendor_id)
  WHERE status = 'pending'
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vendor_banking_link_tokens_vendor_id_idx
  ON public.vendor_banking_link_tokens (vendor_id);

CREATE INDEX IF NOT EXISTS vendor_banking_link_tokens_scope_idx
  ON public.vendor_banking_link_tokens (organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_vendor_banking_link_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
BEGIN
  SELECT *
    INTO v_vendor
  FROM public.vendors
  WHERE id = NEW.vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor % does not exist', NEW.vendor_id;
  END IF;

  NEW.organization_id := v_vendor.organization_id;
  NEW.brand_id := v_vendor.brand_id;
  NEW.location_id := v_vendor.location_id;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_vendor_banking_link_scope ON public.vendor_banking_link_tokens;
CREATE TRIGGER set_vendor_banking_link_scope
BEFORE INSERT OR UPDATE ON public.vendor_banking_link_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_banking_link_scope();

ALTER TABLE public.vendor_banking_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_banking_link_tokens FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_banking_link_tokens'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.vendor_banking_link_tokens', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY vendor_banking_link_tokens_manager_select
  ON public.vendor_banking_link_tokens
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_manager_or_above()
    AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

CREATE OR REPLACE FUNCTION public.issue_vendor_banking_link(p_vendor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_token public.vendor_banking_link_tokens%ROWTYPE;
BEGIN
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

  INSERT INTO public.vendor_banking_link_tokens (vendor_id)
  VALUES (p_vendor_id)
  RETURNING * INTO v_token;

  RETURN jsonb_build_object(
    'id', v_token.id,
    'vendor_id', v_token.vendor_id,
    'organization_id', v_token.organization_id,
    'brand_id', v_token.brand_id,
    'location_id', v_token.location_id,
    'token', v_token.token,
    'status', v_token.status,
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
    created_by,
    updated_by
  ) VALUES (
    v_token.vendor_id,
    v_token.organization_id,
    v_token.brand_id,
    v_token.location_id,
    'pending',
    v_token.created_by,
    v_token.created_by
  )
  RETURNING * INTO v_bank;

  v_store_result := public.store_vendor_banking_secret(v_bank.id, p_account, p_routing);

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
        'token_id', v_token.id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_token.vendor_id,
    'banking_row_id', v_bank.id,
    'banking_secret_id', v_store_result->>'banking_secret_id',
    'account_last4', v_store_result->>'account_last4'
  );
END;
$$;

REVOKE ALL ON public.vendor_banking_link_tokens FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_banking_link_tokens FROM anon, authenticated;
GRANT ALL ON public.vendor_banking_link_tokens TO service_role;
GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  status,
  expires_at,
  submitted_at,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_banking_link_tokens TO authenticated;
REVOKE SELECT (token) ON public.vendor_banking_link_tokens FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

COMMIT;
