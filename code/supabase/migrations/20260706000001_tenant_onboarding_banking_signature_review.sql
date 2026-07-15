BEGIN;

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS expired_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications
  ALTER COLUMN organization_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings')),
  nickname TEXT,
  routing_number_last4 TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  billing_address_source TEXT NOT NULL DEFAULT 'business' CHECK (billing_address_source IN ('business', 'mailing', 'service')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_signature' CHECK (status IN ('pending_signature', 'authorized', 'verified', 'inactive')),
  banking_secret_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_payment_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  onboarding_bank_account_id UUID NOT NULL REFERENCES public.onboarding_bank_accounts(id) ON DELETE CASCADE,
  payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  signer_full_name TEXT NOT NULL,
  signer_title TEXT,
  consent_version TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_accepted BOOLEAN NOT NULL DEFAULT false,
  signature_storage_path TEXT,
  signature_sha256 TEXT NOT NULL,
  signature_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_bank_default_user
  ON public.onboarding_bank_accounts(user_id)
  WHERE is_default = true AND status <> 'inactive';

CREATE INDEX IF NOT EXISTS idx_onboarding_bank_accounts_user_status
  ON public.onboarding_bank_accounts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_onboarding_bank_accounts_org_status
  ON public.onboarding_bank_accounts(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_authorizations_bank_status
  ON public.tenant_payment_authorizations(onboarding_bank_account_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_authorizations_org
  ON public.tenant_payment_authorizations(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_onboarding_admin_actions_target
  ON public.onboarding_admin_actions(target_user_id, created_at DESC);

ALTER TABLE public.onboarding_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_bank_accounts_owner_select ON public.onboarding_bank_accounts;
CREATE POLICY onboarding_bank_accounts_owner_select
  ON public.onboarding_bank_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS tenant_payment_authorizations_owner_select ON public.tenant_payment_authorizations;
CREATE POLICY tenant_payment_authorizations_owner_select
  ON public.tenant_payment_authorizations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS onboarding_admin_actions_platform_select ON public.onboarding_admin_actions;
CREATE POLICY onboarding_admin_actions_platform_select
  ON public.onboarding_admin_actions FOR SELECT
  TO authenticated
  USING (public.get_auth_role() = 'platform_admin');

CREATE OR REPLACE FUNCTION public.touch_onboarding_bank_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_bank_accounts_updated_at ON public.onboarding_bank_accounts;
CREATE TRIGGER trg_onboarding_bank_accounts_updated_at
  BEFORE UPDATE ON public.onboarding_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_onboarding_bank_accounts_updated_at();

CREATE OR REPLACE FUNCTION public.store_onboarding_bank_secret(
  p_bank_account_id UUID,
  p_account_number TEXT,
  p_routing_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_secret_id UUID;
  v_secret_name TEXT;
  v_payload TEXT;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.onboarding_bank_accounts
  WHERE id = p_bank_account_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  v_secret_name := 'onboarding-bank-' || p_bank_account_id::text;
  v_payload := jsonb_build_object(
    'onboarding_bank_account_id', p_bank_account_id,
    'user_id', v_user_id,
    'account_number', p_account_number,
    'routing_number', p_routing_number,
    'stored_at', now()
  )::text;

  SELECT vault.create_secret(v_payload, v_secret_name, 'tenant onboarding banking')
    INTO v_secret_id;

  UPDATE public.onboarding_bank_accounts
  SET banking_secret_id = v_secret_id
  WHERE id = p_bank_account_id;

  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_onboarding_bank_account(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_bank_id UUID;
  v_run_id UUID;
  v_account_number TEXT;
  v_routing_number TEXT;
  v_is_default BOOLEAN;
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
    COALESCE(NULLIF(p_payload->>'billing_address_source', ''), 'business'),
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
$$;

CREATE OR REPLACE FUNCTION public.set_default_onboarding_bank_account(p_bank_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_bank_accounts
    WHERE id = p_bank_account_id AND user_id = v_user_id AND status <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  UPDATE public.onboarding_bank_accounts
  SET is_default = false
  WHERE user_id = v_user_id AND status <> 'inactive';

  UPDATE public.onboarding_bank_accounts
  SET is_default = true
  WHERE id = p_bank_account_id;

  RETURN jsonb_build_object('success', true, 'bank_account_id', p_bank_account_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_tenant_payment_signature(
  p_bank_account_id UUID,
  p_signer_full_name TEXT,
  p_signer_title TEXT,
  p_consent_version TEXT,
  p_consent_text TEXT,
  p_signature_sha256 TEXT,
  p_signature_payload JSONB DEFAULT '{}'::jsonb,
  p_signature_storage_path TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_auth_id UUID;
  v_run_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.onboarding_bank_accounts
    WHERE id = p_bank_account_id AND user_id = v_user_id AND status <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  IF NULLIF(btrim(COALESCE(p_signer_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Signer full name is required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_signature_sha256, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Signature hash is required';
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
$$;

CREATE OR REPLACE FUNCTION public.verify_onboarding_payment_method(
  p_method_type TEXT,
  p_provider TEXT DEFAULT 'stripe',
  p_provider_payment_method_id TEXT DEFAULT NULL,
  p_last4 TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_status TEXT;
  v_payment_method_id UUID;
  v_bank public.onboarding_bank_accounts%ROWTYPE;
  v_auth public.tenant_payment_authorizations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_method_type NOT IN ('card', 'ach') THEN
    RAISE EXCEPTION 'Payment method must be card or ach';
  END IF;

  SELECT business_verification_status INTO v_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF COALESCE(v_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before payment setup';
  END IF;

  IF p_method_type = 'ach' THEN
    SELECT * INTO v_bank
    FROM public.onboarding_bank_accounts
    WHERE user_id = v_user_id
      AND status IN ('authorized', 'verified')
      AND (
        (p_metadata ? 'onboarding_bank_account_id' AND id = (p_metadata->>'onboarding_bank_account_id')::uuid)
        OR (NOT (p_metadata ? 'onboarding_bank_account_id') AND is_default = true)
      )
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    IF v_bank.id IS NULL THEN
      RAISE EXCEPTION 'A saved and signed bank account is required before ACH/check verification';
    END IF;

    SELECT * INTO v_auth
    FROM public.tenant_payment_authorizations
    WHERE user_id = v_user_id
      AND onboarding_bank_account_id = v_bank.id
      AND status = 'active'
      AND consent_accepted = true
    ORDER BY signed_at DESC
    LIMIT 1;

    IF v_auth.id IS NULL THEN
      RAISE EXCEPTION 'Signature authorization is required for the selected bank account';
    END IF;

    p_provider := 'tenant_bank_vault';
    p_last4 := v_bank.account_number_last4;
    p_bank_name := v_bank.bank_name;
    p_metadata := COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'onboarding_bank_account_id', v_bank.id,
        'tenant_payment_authorization_id', v_auth.id,
        'routing_number_last4', v_bank.routing_number_last4,
        'billing_address_source', v_bank.billing_address_source
      );
  END IF;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);

  INSERT INTO public.onboarding_payment_methods (
    user_id,
    method_type,
    provider,
    provider_payment_method_id,
    status,
    last4,
    brand,
    bank_name,
    verified_at,
    metadata
  )
  VALUES (
    v_user_id,
    p_method_type,
    COALESCE(NULLIF(p_provider, ''), 'stripe'),
    NULLIF(p_provider_payment_method_id, ''),
    'verified',
    NULLIF(p_last4, ''),
    NULLIF(p_brand, ''),
    NULLIF(p_bank_name, ''),
    now(),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_payment_method_id;

  IF p_method_type = 'ach' THEN
    UPDATE public.onboarding_bank_accounts
    SET status = 'verified'
    WHERE id = v_bank.id;
  END IF;

  UPDATE public.profiles
  SET payment_verified = true,
      payment_method_type = p_method_type,
      payment_method_verified_at = now(),
      onboarding_status = 'in_progress',
      onboarding_current_step = 'plan_selection',
      updated_at = now()
  WHERE id = v_user_id;

  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'payment_method',
    'verified',
    'verified',
    jsonb_build_object('payment_method_id', v_payment_method_id, 'method_type', p_method_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_method_id', v_payment_method_id,
    'method_type', p_method_type,
    'next_step', 'plan_selection'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_business_verification(p_user_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'verified',
      verified_at = now(),
      rejection_reason = NULL,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_note', p_note),
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.business_verifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
  );

  UPDATE public.profiles
  SET business_verification_status = 'verified',
      onboarding_status = 'in_progress',
      onboarding_current_step = 'payment_method',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'approve_business_verification', p_note);

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'Business verification approved', 'Your business verification was approved. You can continue onboarding.', false);

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'admin_approved', 'verified', jsonb_build_object('actor_user_id', v_actor));

  RETURN jsonb_build_object('success', true, 'status', 'verified', 'next_step', 'payment_method');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_business_verification(p_user_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'failed',
      rejection_reason = p_reason,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_reason', p_reason),
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.business_verifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
  );

  UPDATE public.profiles
  SET business_verification_status = 'failed',
      onboarding_status = 'blocked',
      onboarding_current_step = 'business_verification',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'reject_business_verification', p_reason);

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'Business verification failed', p_reason, false);

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'admin_rejected', 'failed', jsonb_build_object('actor_user_id', v_actor, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.request_onboarding_more_info(p_user_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'pending_review',
      rejection_reason = p_reason,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('more_info_reason', p_reason),
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.business_verifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
  );

  UPDATE public.profiles
  SET business_verification_status = 'pending_review',
      onboarding_status = 'pending_review',
      onboarding_current_step = 'business_verification',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'request_more_info', p_reason);

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'More information needed', COALESCE(NULLIF(p_reason, ''), 'Please update your onboarding information.'), false);

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'more_info_requested', 'pending_review', jsonb_build_object('actor_user_id', v_actor, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'pending_review');
END;
$$;

CREATE OR REPLACE FUNCTION public.reissue_owner_invitation(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old public.invitations%ROWTYPE;
  v_new public.invitations%ROWTYPE;
  v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  SELECT * INTO v_old FROM public.invitations WHERE id = p_invitation_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  UPDATE public.invitations SET closed_at = now() WHERE id = p_invitation_id;

  INSERT INTO public.invitations (
    organization_id, email, role, token, invited_by, expires_at, metadata, status
  )
  VALUES (
    v_old.organization_id,
    v_old.email,
    v_old.role,
    v_token,
    auth.uid(),
    now() + interval '7 days',
    COALESCE(v_old.metadata, '{}'::jsonb) || jsonb_build_object('reissued_from', v_old.id),
    COALESCE(v_old.status, 'pending')
  )
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('success', true, 'invitation_id', v_new.id, 'token', v_new.token, 'expires_at', v_new.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_expired_owner_invitations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation RECORD;
  v_admin RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_invitation IN
    SELECT i.*
    FROM public.invitations i
    WHERE i.role IN ('owner', 'org_owner')
      AND i.accepted_at IS NULL
      AND i.closed_at IS NULL
      AND i.expires_at IS NOT NULL
      AND i.expires_at <= now()
      AND i.expired_notified_at IS NULL
  LOOP
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'platform_admin'
    LOOP
      INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
      VALUES (
        v_admin.id,
        v_invitation.organization_id,
        'system',
        'Owner onboarding invitation expired',
        'The owner invitation for ' || v_invitation.email || ' expired and needs follow-up or reissue.',
        false
      );
    END LOOP;

    UPDATE public.invitations
    SET expired_notified_at = now()
    WHERE id = v_invitation.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired_invitations_notified', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_business_verification_review_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin RECORD;
  v_title TEXT;
  v_message TEXT;
  v_run_id UUID;
BEGIN
  IF NEW.verification_status NOT IN ('pending_review', 'failed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.verification_status, '') = NEW.verification_status THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.verification_status = 'failed' THEN 'Business verification failed'
    ELSE 'Business verification pending review'
  END;
  v_message := CASE
    WHEN NEW.verification_status = 'failed' THEN COALESCE(NULLIF(NEW.rejection_reason, ''), 'Your business verification could not be approved. Please review and resubmit.')
    ELSE 'Your business verification is pending platform admin review.'
  END;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
  VALUES (NEW.user_id, NEW.organization_id, 'system', v_title, v_message, false);

  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'platform_admin'
  LOOP
    INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
    VALUES (
      v_admin.id,
      NEW.organization_id,
      'system',
      v_title,
      COALESCE(NEW.legal_business_name, 'Tenant') || ' requires onboarding follow-up: ' || NEW.verification_status,
      false
    );
  END LOOP;

  v_run_id := public.get_or_create_onboarding_run(NEW.user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    NEW.user_id,
    'business_verification',
    CASE WHEN NEW.verification_status = 'failed' THEN 'failed_notification_queued' ELSE 'pending_review_notification_queued' END,
    NEW.verification_status,
    jsonb_build_object('verification_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_business_verification_review_state ON public.business_verifications;
CREATE TRIGGER trg_notify_business_verification_review_state
  AFTER INSERT OR UPDATE OF verification_status ON public.business_verifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_business_verification_review_state();

CREATE OR REPLACE FUNCTION public.link_onboarding_bank_to_payment_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bank_id UUID;
  v_bank public.onboarding_bank_accounts%ROWTYPE;
  v_payment_account_id UUID;
BEGIN
  IF NEW.organization_id IS NULL OR COALESCE(OLD.organization_id, '00000000-0000-0000-0000-000000000000'::uuid) = NEW.organization_id THEN
    RETURN NEW;
  END IF;

  v_bank_id := NULLIF(NEW.metadata->>'onboarding_bank_account_id', '')::uuid;
  IF v_bank_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_bank
  FROM public.onboarding_bank_accounts
  WHERE id = v_bank_id AND user_id = NEW.user_id;

  IF v_bank.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_bank.payment_account_id IS NOT NULL THEN
    v_payment_account_id := v_bank.payment_account_id;
  ELSE
    IF v_bank.is_default THEN
      UPDATE public.payment_accounts
      SET is_default = false
      WHERE organization_id = NEW.organization_id
        AND payment_method IN ('ach', 'check')
        AND is_active = true;
    END IF;

    INSERT INTO public.payment_accounts (
      organization_id,
      name,
      account_type,
      payment_method,
      provider,
      provider_reference,
      last_four,
      is_default,
      is_active,
      metadata,
      created_by,
      updated_by
    )
    VALUES (
      NEW.organization_id,
      COALESCE(NULLIF(v_bank.nickname, ''), v_bank.bank_name || ' ****' || v_bank.account_number_last4),
      'checking',
      'ach',
      'tenant_bank_vault',
      v_bank.id::text,
      v_bank.account_number_last4,
      v_bank.is_default,
      true,
      jsonb_build_object(
        'source', 'tenant_onboarding',
        'onboarding_bank_account_id', v_bank.id,
        'routing_number_last4', v_bank.routing_number_last4,
        'billing_address_source', v_bank.billing_address_source,
        'authorization_status', v_bank.status
      ),
      NEW.user_id,
      NEW.user_id
    )
    RETURNING id INTO v_payment_account_id;
  END IF;

  UPDATE public.onboarding_bank_accounts
  SET organization_id = NEW.organization_id,
      payment_account_id = v_payment_account_id,
      updated_at = now()
  WHERE id = v_bank.id;

  UPDATE public.tenant_payment_authorizations
  SET organization_id = NEW.organization_id,
      payment_account_id = v_payment_account_id,
      updated_at = now()
  WHERE onboarding_bank_account_id = v_bank.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_onboarding_bank_to_payment_account ON public.onboarding_payment_methods;
CREATE TRIGGER trg_link_onboarding_bank_to_payment_account
  AFTER UPDATE OF organization_id ON public.onboarding_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.link_onboarding_bank_to_payment_account();

DROP FUNCTION IF EXISTS public.get_invite_details(text);
CREATE OR REPLACE FUNCTION public.get_invite_details(invite_token text)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  organization_id uuid,
  organization_name text,
  invited_by uuid,
  expires_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.id,
    i.email,
    i.role,
    i.organization_id,
    o.name AS organization_name,
    i.invited_by,
    i.expires_at,
    i.metadata
  FROM public.invitations i
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token = invite_token
    AND i.accepted_at IS NULL
    AND i.closed_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND closed_at IS NULL
    AND lower(email) = lower(v_user_email)
    AND (expires_at IS NULL OR expires_at > now());

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      updated_at      = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_invite.role,
    'organization_id', v_invite.organization_id::text
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_invite.role,
    'organization_id', v_invite.organization_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.store_onboarding_bank_secret(UUID, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_onboarding_bank_secret(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_onboarding_bank_account(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_onboarding_bank_account(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_tenant_payment_signature(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_business_verification(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_business_verification(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_onboarding_more_info(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reissue_owner_invitation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_expired_owner_invitations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_business_verification_review_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.link_onboarding_bank_to_payment_account() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invite_details(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

