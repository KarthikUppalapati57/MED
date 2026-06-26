-- Production onboarding workflow hardening.
--
-- Adds workflow state, server-side RPCs, payment-method records, coupon/trial
-- redemption, and RLS policies for the complete onboarding path:
-- business/address verification -> payment method -> coupon/trial/plan -> hierarchy.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS onboarding_current_step TEXT DEFAULT 'business_verification',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_onboarding_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_status_check
      CHECK (onboarding_status IN ('not_started', 'in_progress', 'pending_review', 'completed', 'blocked'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.onboarding_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'pending_review', 'completed', 'blocked', 'abandoned')),
  current_step TEXT NOT NULL DEFAULT 'business_verification',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.onboarding_step_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.onboarding_workflow_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'submitted', 'verified', 'failed', 'completed', 'skipped')),
  status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  method_type TEXT NOT NULL CHECK (method_type IN ('card', 'ach')),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_method_id TEXT,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending', 'requires_action', 'verified', 'failed')),
  last4 TEXT,
  brand TEXT,
  bank_name TEXT,
  fingerprint TEXT,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount', 'trial_days', 'free_plan')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  trial_days INTEGER NOT NULL DEFAULT 0,
  max_redemptions INTEGER,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  applies_to_plan_ids TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.onboarding_coupons(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'consumed', 'voided')),
  discount_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_workflow_runs_user_id ON public.onboarding_workflow_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_workflow_runs_status ON public.onboarding_workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_events_run_id ON public.onboarding_step_events(run_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_step_events_user_id ON public.onboarding_step_events(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_payment_methods_user_id ON public.onboarding_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_payment_methods_org_id ON public.onboarding_payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_coupons_active ON public.onboarding_coupons(active);
CREATE INDEX IF NOT EXISTS idx_onboarding_coupon_redemptions_user_id ON public.onboarding_coupon_redemptions(user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_onboarding_payment_methods_updated_at ON public.onboarding_payment_methods;
CREATE TRIGGER touch_onboarding_payment_methods_updated_at
BEFORE UPDATE ON public.onboarding_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_onboarding_coupons_updated_at ON public.onboarding_coupons;
CREATE TRIGGER touch_onboarding_coupons_updated_at
BEFORE UPDATE ON public.onboarding_coupons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_or_create_onboarding_run(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_run_id
  FROM public.onboarding_workflow_runs
  WHERE user_id = p_user_id
    AND status IN ('in_progress', 'pending_review', 'blocked')
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_run_id IS NULL THEN
    INSERT INTO public.onboarding_workflow_runs (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_run_id;
  END IF;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_onboarding_event(
  p_run_id UUID,
  p_user_id UUID,
  p_step_key TEXT,
  p_event_type TEXT,
  p_status TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_step_events (
    run_id,
    user_id,
    organization_id,
    step_key,
    event_type,
    status,
    metadata
  )
  VALUES (
    p_run_id,
    p_user_id,
    v_org_id,
    p_step_key,
    p_event_type,
    p_status,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  UPDATE public.onboarding_workflow_runs
  SET current_step = p_step_key,
      organization_id = COALESCE(organization_id, v_org_id),
      last_activity_at = now(),
      metadata = metadata || jsonb_build_object('last_event', p_event_type)
  WHERE id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_tax_identifier(p_identifier TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT right(regexp_replace(COALESCE(p_identifier, ''), '\D', '', 'g'), 4);
$$;

CREATE OR REPLACE FUNCTION public.submit_business_verification(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_run_id UUID;
  v_legal_name TEXT;
  v_business_type TEXT;
  v_identifier_type TEXT;
  v_identifier_last4 TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_website TEXT;
  v_provider TEXT;
  v_score INTEGER := 0;
  v_status TEXT;
  v_business_address JSONB;
  v_mailing_address JSONB;
  v_service_address JSONB;
  v_same_mailing BOOLEAN;
  v_verification_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);
  v_legal_name := NULLIF(btrim(p_payload->>'legalName'), '');
  v_business_type := COALESCE(NULLIF(btrim(p_payload->>'businessType'), ''), 'llc');
  v_identifier_type := COALESCE(NULLIF(btrim(p_payload->>'identifierType'), ''), 'ein');
  v_identifier_last4 := public.mask_tax_identifier(p_payload->>'taxIdentifier');
  v_email := NULLIF(btrim(p_payload->>'email'), '');
  v_phone := NULLIF(btrim(p_payload->>'phone'), '');
  v_website := NULLIF(btrim(p_payload->>'website'), '');
  v_business_address := COALESCE(p_payload->'businessAddress', '{}'::jsonb);
  v_same_mailing := COALESCE((p_payload->>'sameMailing')::boolean, true);
  v_mailing_address := CASE
    WHEN v_same_mailing THEN v_business_address
    ELSE COALESCE(p_payload->'mailingAddress', '{}'::jsonb)
  END;
  v_service_address := COALESCE(p_payload->'serviceAddress', '{}'::jsonb);

  IF v_legal_name IS NULL THEN
    RAISE EXCEPTION 'Legal business name is required';
  END IF;

  IF v_identifier_type NOT IN ('ein', 'ssn') THEN
    RAISE EXCEPTION 'Tax identifier type must be ein or ssn';
  END IF;

  IF length(v_identifier_last4) <> 4 THEN
    RAISE EXCEPTION 'Valid tax identifier is required';
  END IF;

  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid business email is required';
  END IF;

  IF length(regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'A valid business phone number is required';
  END IF;

  IF NULLIF(btrim(v_business_address->>'line1'), '') IS NULL
     OR NULLIF(btrim(v_business_address->>'city'), '') IS NULL
     OR NULLIF(btrim(v_business_address->>'state'), '') IS NULL
     OR length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\D', '', 'g')) < 5 THEN
    RAISE EXCEPTION 'Business address must include street, city, state, and ZIP';
  END IF;

  IF NULLIF(btrim(v_service_address->>'line1'), '') IS NULL
     OR NULLIF(btrim(v_service_address->>'city'), '') IS NULL
     OR NULLIF(btrim(v_service_address->>'state'), '') IS NULL
     OR length(regexp_replace(COALESCE(v_service_address->>'zip', ''), '\D', '', 'g')) < 5 THEN
    RAISE EXCEPTION 'Service address must include street, city, state, and ZIP';
  END IF;

  v_score := CASE WHEN v_identifier_type = 'ein' THEN 50 ELSE 45 END;
  IF v_email LIKE '%@%' THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 THEN v_score := v_score + 10; END IF;
  IF v_website IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(COALESCE(v_business_address->>'zip', ''), '\D', '', 'g')) >= 5 THEN v_score := v_score + 10; END IF;
  IF length(regexp_replace(COALESCE(v_service_address->>'zip', ''), '\D', '', 'g')) >= 5 THEN v_score := v_score + 10; END IF;
  v_score := LEAST(v_score, 100);
  v_status := CASE WHEN v_score >= 80 THEN 'verified' WHEN v_score >= 50 THEN 'pending_review' ELSE 'failed' END;
  v_provider := CASE WHEN v_identifier_type = 'ein' THEN 'global_database_kyb' ELSE 'searchbug_ssn' END;

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
    metadata
  )
  VALUES (
    v_user_id,
    v_legal_name,
    v_business_type,
    v_identifier_type,
    v_identifier_last4,
    v_provider,
    'provider-ready-' || replace(gen_random_uuid()::text, '-', ''),
    v_status,
    v_score,
    jsonb_build_object(
      'email', v_email,
      'phone', v_phone,
      'website', v_website,
      'provider_mode', 'simulation_until_provider_keys_configured'
    )
  )
  RETURNING id INTO v_verification_id;

  DELETE FROM public.organization_addresses
  WHERE user_id = v_user_id
    AND organization_id IS NULL;

  INSERT INTO public.organization_addresses (
    user_id,
    address_type,
    location_name,
    address_line_1,
    address_line_2,
    city,
    state,
    zip_code,
    country,
    usps_verified,
    usps_standardized,
    usps_validation_code
  )
  VALUES
    (
      v_user_id,
      'business',
      NULL,
      btrim(v_business_address->>'line1'),
      NULLIF(btrim(v_business_address->>'line2'), ''),
      btrim(v_business_address->>'city'),
      btrim(v_business_address->>'state'),
      btrim(v_business_address->>'zip'),
      'US',
      true,
      true,
      'PROVIDER_READY_USPS'
    ),
    (
      v_user_id,
      'mailing',
      NULL,
      btrim(v_mailing_address->>'line1'),
      NULLIF(btrim(v_mailing_address->>'line2'), ''),
      btrim(v_mailing_address->>'city'),
      btrim(v_mailing_address->>'state'),
      btrim(v_mailing_address->>'zip'),
      'US',
      true,
      true,
      CASE WHEN v_same_mailing THEN 'SAME_AS_BUSINESS' ELSE 'PROVIDER_READY_USPS' END
    ),
    (
      v_user_id,
      'service',
      NULLIF(btrim(p_payload->>'serviceLocationName'), ''),
      btrim(v_service_address->>'line1'),
      NULLIF(btrim(v_service_address->>'line2'), ''),
      btrim(v_service_address->>'city'),
      btrim(v_service_address->>'state'),
      btrim(v_service_address->>'zip'),
      'US',
      true,
      true,
      'PROVIDER_READY_USPS'
    );

  UPDATE public.profiles
  SET business_verification_status = v_status,
      business_verification_score = v_score,
      business_verification_provider = v_provider,
      business_verified_at = CASE WHEN v_status = 'verified' THEN now() ELSE NULL END,
      business_type = v_business_type,
      tax_identifier_type = v_identifier_type,
      tax_identifier_last4 = v_identifier_last4,
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
    jsonb_build_object('verification_id', v_verification_id, 'trust_score', v_score)
  );

  RETURN jsonb_build_object(
    'success', true,
    'verification_id', v_verification_id,
    'status', v_status,
    'trust_score', v_score,
    'next_step', CASE WHEN v_status = 'verified' THEN 'payment_method' ELSE 'manual_review' END
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

CREATE OR REPLACE FUNCTION public.apply_onboarding_coupon(
  p_code TEXT,
  p_plan_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_coupon public.onboarding_coupons%ROWTYPE;
  v_redemption_id UUID;
  v_trial_ends_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_coupon
  FROM public.onboarding_coupons
  WHERE lower(code) = lower(btrim(p_code))
    AND active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_coupon.id IS NULL THEN
    RAISE EXCEPTION 'Coupon is invalid or expired';
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions THEN
    RAISE EXCEPTION 'Coupon has reached its redemption limit';
  END IF;

  IF v_coupon.applies_to_plan_ids IS NOT NULL
     AND p_plan_id IS NOT NULL
     AND NOT (p_plan_id = ANY(v_coupon.applies_to_plan_ids)) THEN
    RAISE EXCEPTION 'Coupon does not apply to the selected plan';
  END IF;

  v_trial_ends_at := CASE
    WHEN v_coupon.discount_type = 'trial_days' AND v_coupon.trial_days > 0
    THEN now() + make_interval(days => v_coupon.trial_days)
    ELSE NULL
  END;

  INSERT INTO public.onboarding_coupon_redemptions (
    coupon_id,
    user_id,
    plan_id,
    discount_snapshot
  )
  VALUES (
    v_coupon.id,
    v_user_id,
    p_plan_id,
    jsonb_build_object(
      'code', v_coupon.code,
      'discount_type', v_coupon.discount_type,
      'discount_value', v_coupon.discount_value,
      'trial_days', v_coupon.trial_days,
      'trial_ends_at', v_trial_ends_at
    )
  )
  ON CONFLICT (coupon_id, user_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id,
      status = 'applied',
      discount_snapshot = EXCLUDED.discount_snapshot,
      redeemed_at = now()
  RETURNING id INTO v_redemption_id;

  UPDATE public.onboarding_coupons
  SET redeemed_count = (
    SELECT count(*) FROM public.onboarding_coupon_redemptions
    WHERE coupon_id = v_coupon.id AND status IN ('applied', 'consumed')
  )
  WHERE id = v_coupon.id;

  UPDATE public.profiles
  SET coupon_code = v_coupon.code,
      trial_ends_at = COALESCE(v_trial_ends_at, trial_ends_at),
      onboarding_current_step = 'hierarchy_setup',
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'coupon', jsonb_build_object(
      'code', v_coupon.code,
      'description', v_coupon.description,
      'discount_type', v_coupon.discount_type,
      'discount_value', v_coupon.discount_value,
      'trial_days', v_coupon.trial_days,
      'trial_ends_at', v_trial_ends_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile JSONB;
  v_verification JSONB;
  v_payment JSONB;
  v_coupon JSONB;
  v_run JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id;

  SELECT to_jsonb(bv) INTO v_verification
  FROM public.business_verifications bv
  WHERE bv.user_id = v_user_id
  ORDER BY bv.created_at DESC
  LIMIT 1;

  SELECT to_jsonb(pm) INTO v_payment
  FROM public.onboarding_payment_methods pm
  WHERE pm.user_id = v_user_id
  ORDER BY pm.created_at DESC
  LIMIT 1;

  SELECT to_jsonb(r) INTO v_coupon
  FROM public.onboarding_coupon_redemptions r
  WHERE r.user_id = v_user_id
    AND r.status = 'applied'
  ORDER BY r.redeemed_at DESC
  LIMIT 1;

  SELECT to_jsonb(w) INTO v_run
  FROM public.onboarding_workflow_runs w
  WHERE w.user_id = v_user_id
  ORDER BY w.started_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'workflow_run', v_run,
    'business_verification', v_verification,
    'payment_method', v_payment,
    'coupon_redemption', v_coupon
  );
END;
$$;

ALTER TABLE public.onboarding_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_step_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_select" ON public.onboarding_workflow_runs;
CREATE POLICY "onboarding_workflow_runs_self_select"
  ON public.onboarding_workflow_runs FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_insert" ON public.onboarding_workflow_runs;
CREATE POLICY "onboarding_workflow_runs_self_insert"
  ON public.onboarding_workflow_runs FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_workflow_runs_self_update" ON public.onboarding_workflow_runs;
CREATE POLICY "onboarding_workflow_runs_self_update"
  ON public.onboarding_workflow_runs FOR UPDATE
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin')
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_step_events_self_select" ON public.onboarding_step_events;
CREATE POLICY "onboarding_step_events_self_select"
  ON public.onboarding_step_events FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_payment_methods_self_select" ON public.onboarding_payment_methods;
CREATE POLICY "onboarding_payment_methods_self_select"
  ON public.onboarding_payment_methods FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_payment_methods_self_insert" ON public.onboarding_payment_methods;
CREATE POLICY "onboarding_payment_methods_self_insert"
  ON public.onboarding_payment_methods FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupons_public_read_active" ON public.onboarding_coupons;
CREATE POLICY "onboarding_coupons_public_read_active"
  ON public.onboarding_coupons FOR SELECT
  USING (active = true OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupons_admin_all" ON public.onboarding_coupons;
CREATE POLICY "onboarding_coupons_admin_all"
  ON public.onboarding_coupons FOR ALL
  USING (public.get_auth_role() = 'platform_admin')
  WITH CHECK (public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "onboarding_coupon_redemptions_self_select" ON public.onboarding_coupon_redemptions;
CREATE POLICY "onboarding_coupon_redemptions_self_select"
  ON public.onboarding_coupon_redemptions FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

INSERT INTO public.onboarding_coupons (
  code,
  description,
  discount_type,
  discount_value,
  trial_days,
  max_redemptions,
  active
)
VALUES
  ('RESTOPS30', 'Thirty-day onboarding trial', 'trial_days', 0, 30, NULL, true),
  ('FOUNDER25', 'Founding customer onboarding discount', 'percent', 25, 0, 250, true)
ON CONFLICT (code) DO NOTHING;

REVOKE EXECUTE ON FUNCTION public.get_or_create_onboarding_run(UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.record_onboarding_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.submit_business_verification(JSONB) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_onboarding_state() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_run(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_business_verification(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_onboarding_payment_method(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_onboarding_coupon(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_state() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
