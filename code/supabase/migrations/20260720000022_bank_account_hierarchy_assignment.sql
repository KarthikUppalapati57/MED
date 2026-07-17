-- Task 4 (banking page redesign, part 1): each onboarding bank account must be assigned to
-- exactly one node of the tenant's own hierarchy (organization, brand, or location), selected
-- from a dropdown the frontend sources from fetch_user_access_tree() -- the same RPC the
-- ContextSwitcher already uses. organization_id already exists on onboarding_bank_accounts but
-- was never populated; this adds brand_id/location_id and rewrites submit_onboarding_bank_account
-- to validate the chosen node against the caller's own membership rows (never trust the client
-- for scope) and stamp all three columns using the standard NULL-tier pattern already used
-- throughout the schema: org-level = brand_id/location_id NULL, brand-level = location_id NULL,
-- location-level = all three set.

BEGIN;

ALTER TABLE public.onboarding_bank_accounts
  ADD COLUMN brand_id UUID REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  ADD COLUMN location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.onboarding_bank_accounts
  ADD CONSTRAINT onboarding_bank_accounts_scope_tier_check
  CHECK (
    (location_id IS NULL OR (brand_id IS NOT NULL AND organization_id IS NOT NULL))
    AND (brand_id IS NULL OR organization_id IS NOT NULL)
  );

CREATE INDEX idx_onboarding_bank_accounts_brand ON public.onboarding_bank_accounts(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_onboarding_bank_accounts_location ON public.onboarding_bank_accounts(location_id) WHERE location_id IS NOT NULL;

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
  v_scope TEXT;
  v_scope_id UUID;
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
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
  v_scope := NULLIF(p_payload->>'assignment_scope', '');
  v_scope_id := NULLIF(p_payload->>'assignment_id', '')::uuid;

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

  IF v_scope IS NULL OR v_scope_id IS NULL THEN
    RAISE EXCEPTION 'Select which organization, brand, or location this bank account belongs to';
  END IF;

  IF v_scope = 'organization' THEN
    SELECT om.organization_id INTO v_org_id
    FROM public.organization_members om
    WHERE om.user_id = v_user_id AND om.organization_id = v_scope_id;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'You do not have access to that organization';
    END IF;
  ELSIF v_scope = 'brand' THEN
    SELECT b.organization_id, b.brand_id INTO v_org_id, v_brand_id
    FROM public.brand_members bm
    JOIN public.brands b ON b.brand_id = bm.brand_id
    WHERE bm.user_id = v_user_id AND bm.brand_id = v_scope_id;

    IF v_brand_id IS NULL THEN
      RAISE EXCEPTION 'You do not have access to that brand';
    END IF;
  ELSIF v_scope = 'location' THEN
    SELECT l.organization_id, l.brand_id, l.id INTO v_org_id, v_brand_id, v_location_id
    FROM public.location_members lm
    JOIN public.locations l ON l.id = lm.location_id
    WHERE lm.user_id = v_user_id AND lm.location_id = v_scope_id;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'You do not have access to that location';
    END IF;
  ELSE
    RAISE EXCEPTION 'Assignment scope must be organization, brand, or location';
  END IF;

  IF v_is_default THEN
    UPDATE public.onboarding_bank_accounts
    SET is_default = false
    WHERE user_id = v_user_id AND status <> 'inactive';
  END IF;

  INSERT INTO public.onboarding_bank_accounts (
    user_id,
    organization_id,
    brand_id,
    location_id,
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
    v_org_id,
    v_brand_id,
    v_location_id,
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
        'organization_id', organization_id,
        'brand_id', brand_id,
        'location_id', location_id,
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

COMMIT;
