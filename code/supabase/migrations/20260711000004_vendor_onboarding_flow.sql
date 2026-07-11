BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_verified_at timestamptz;

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_onboarding_status_check;

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_onboarding_status_check
  CHECK (
    onboarding_status IS NULL
    OR onboarding_status IN (
      'invited',
      'pending_otp',
      'otp_verified',
      'pending_tax',
      'tax_submitted',
      'business_verified',
      'verification_failed',
      'documents_on_file',
      'pending_bank',
      'banking_submitted',
      'banking_verified',
      'method_selected',
      'pending_approval',
      'active',
      'completed',
      'rejected'
    )
  );

CREATE TABLE IF NOT EXISTS public.vendor_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'expired', 'failed_max_attempts')),
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  link_type text NOT NULL CHECK (link_type IN ('tax', 'documents')),
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  submitted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  document_type text NOT NULL
    CHECK (document_type IN ('w9', 'certificate_of_insurance', 'business_license', 'vendor_agreement', 'other')),
  file_name text,
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'on_file', 'expired', 'rejected')),
  issued_date date,
  expires_at date,
  uploaded_via text NOT NULL DEFAULT 'admin_upload'
    CHECK (uploaded_via IN ('admin_upload', 'vendor_magic_link')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.vendor_tax_information
  ADD COLUMN IF NOT EXISTS tax_id_type text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_reference text,
  ADD COLUMN IF NOT EXISTS verification_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_failure_reason text,
  ADD COLUMN IF NOT EXISTS w9_document_id uuid REFERENCES public.vendor_documents(id) ON DELETE SET NULL;

ALTER TABLE public.vendor_tax_information
  DROP CONSTRAINT IF EXISTS vendor_tax_information_tax_id_type_check,
  DROP CONSTRAINT IF EXISTS vendor_tax_information_verification_status_check,
  DROP CONSTRAINT IF EXISTS vendor_tax_information_verification_method_check;

ALTER TABLE public.vendor_tax_information
  ADD CONSTRAINT vendor_tax_information_tax_id_type_check
    CHECK (tax_id_type IS NULL OR tax_id_type IN ('ein', 'ssn')),
  ADD CONSTRAINT vendor_tax_information_verification_status_check
    CHECK (verification_status IN ('not_started', 'pending', 'verified', 'failed', 'mismatch')),
  ADD CONSTRAINT vendor_tax_information_verification_method_check
    CHECK (verification_method IS NULL OR verification_method IN ('irs_tin_match', 'business_registry_lookup', 'manual_review'));

ALTER TABLE public.vendor_banking_details
  ADD COLUMN IF NOT EXISTS callback_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.vendor_banking_details
  DROP CONSTRAINT IF EXISTS vendor_banking_details_callback_status_check;

ALTER TABLE public.vendor_banking_details
  ADD CONSTRAINT vendor_banking_details_callback_status_check
    CHECK (callback_status IN ('not_required', 'pending', 'confirmed', 'failed'));

UPDATE public.vendor_banking_details
   SET callback_status = 'confirmed'
 WHERE verification_state = 'verified'
   AND callback_status = 'pending'
   AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.vendor_banking_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  banking_detail_id uuid NOT NULL REFERENCES public.vendor_banking_details(id) ON DELETE CASCADE,
  request_reason text NOT NULL
    CHECK (request_reason IN ('onboarding', 'vendor_requested_update', 'admin_correction')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  callback_phone_source text NOT NULL DEFAULT 'on_file_contact'
    CHECK (callback_phone_source IN ('on_file_contact', 'w9_registered_number')),
  callback_status text NOT NULL DEFAULT 'not_started'
    CHECK (callback_status IN ('not_started', 'call_scheduled', 'left_message', 'confirmed', 'failed', 'skipped_override')),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  override_reason text,
  override_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  invoice_intake_method text NOT NULL CHECK (invoice_intake_method IN ('photo', 'email', 'portal', 'edi')),
  edi_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (edi_status IN ('not_applicable', 'requested', 'in_progress', 'connected', 'failed')),
  price_alert_threshold_percent numeric(5,2),
  order_cadence text,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('admin', 'vendor', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_otp_challenges_vendor_id_idx ON public.vendor_otp_challenges (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_otp_challenges_pending_idx ON public.vendor_otp_challenges (vendor_id, status, expires_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS vendor_link_tokens_token_idx ON public.vendor_link_tokens (token) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_link_tokens_one_pending_per_type_idx ON public.vendor_link_tokens (vendor_id, link_type) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendor_documents_vendor_id_idx ON public.vendor_documents (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendor_documents_expiry_idx ON public.vendor_documents (expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_banking_change_requests_vendor_id_idx ON public.vendor_banking_change_requests (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_banking_change_requests_detail_id_idx ON public.vendor_banking_change_requests (banking_detail_id);
CREATE INDEX IF NOT EXISTS vendor_onboarding_events_vendor_id_created_idx ON public.vendor_onboarding_events (vendor_id, created_at DESC);

DROP TRIGGER IF EXISTS set_vendor_otp_challenges_scope ON public.vendor_otp_challenges;
CREATE TRIGGER set_vendor_otp_challenges_scope
BEFORE INSERT OR UPDATE ON public.vendor_otp_challenges
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_link_tokens_scope ON public.vendor_link_tokens;
CREATE TRIGGER set_vendor_link_tokens_scope
BEFORE INSERT OR UPDATE ON public.vendor_link_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_documents_scope ON public.vendor_documents;
CREATE TRIGGER set_vendor_documents_scope
BEFORE INSERT OR UPDATE ON public.vendor_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_banking_change_requests_scope ON public.vendor_banking_change_requests;
CREATE TRIGGER set_vendor_banking_change_requests_scope
BEFORE INSERT OR UPDATE ON public.vendor_banking_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_onboarding_preferences_scope ON public.vendor_onboarding_preferences;
CREATE TRIGGER set_vendor_onboarding_preferences_scope
BEFORE INSERT OR UPDATE ON public.vendor_onboarding_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

CREATE OR REPLACE FUNCTION public.set_vendor_onboarding_event_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
BEGIN
  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = NEW.vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor % does not exist', NEW.vendor_id;
  END IF;

  NEW.organization_id := v_vendor.organization_id;
  NEW.brand_id := v_vendor.brand_id;
  NEW.location_id := v_vendor.location_id;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.actor_id := COALESCE(NEW.actor_id, auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_vendor_onboarding_events_scope ON public.vendor_onboarding_events;
CREATE TRIGGER set_vendor_onboarding_events_scope
BEFORE INSERT ON public.vendor_onboarding_events
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_onboarding_event_scope();

ALTER TABLE public.vendor_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_otp_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_link_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_banking_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_banking_change_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_onboarding_events FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'vendor_otp_challenges',
        'vendor_link_tokens',
        'vendor_documents',
        'vendor_banking_change_requests',
        'vendor_onboarding_preferences',
        'vendor_onboarding_events'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END $$;

CREATE POLICY vendor_otp_challenges_manager_select ON public.vendor_otp_challenges
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY vendor_link_tokens_manager_select ON public.vendor_link_tokens
  FOR SELECT USING (deleted_at IS NULL AND public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));
CREATE POLICY vendor_documents_manager_select ON public.vendor_documents
  FOR SELECT USING (deleted_at IS NULL AND public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));
CREATE POLICY vendor_documents_manager_insert ON public.vendor_documents
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));
CREATE POLICY vendor_documents_manager_update ON public.vendor_documents
  FOR UPDATE USING (deleted_at IS NULL AND public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager'));
CREATE POLICY vendor_banking_change_requests_manager_select ON public.vendor_banking_change_requests
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY vendor_banking_change_requests_manager_update ON public.vendor_banking_change_requests
  FOR UPDATE USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'branch_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'branch_manager'));
CREATE POLICY vendor_onboarding_preferences_manager_select ON public.vendor_onboarding_preferences
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY vendor_onboarding_preferences_manager_upsert ON public.vendor_onboarding_preferences
  FOR ALL USING (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'))
  WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));
CREATE POLICY vendor_onboarding_events_manager_select ON public.vendor_onboarding_events
  FOR SELECT USING (public.is_manager_or_above() AND public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
CREATE POLICY vendor_onboarding_events_manager_insert ON public.vendor_onboarding_events
  FOR INSERT WITH CHECK (public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager'));

REVOKE ALL ON public.vendor_otp_challenges FROM anon, authenticated;
REVOKE ALL ON public.vendor_link_tokens FROM anon, authenticated;
REVOKE ALL ON public.vendor_documents FROM anon, authenticated;
REVOKE ALL ON public.vendor_banking_change_requests FROM anon, authenticated;
REVOKE ALL ON public.vendor_onboarding_preferences FROM anon, authenticated;
REVOKE ALL ON public.vendor_onboarding_events FROM anon, authenticated;

GRANT ALL ON public.vendor_otp_challenges TO service_role;
GRANT ALL ON public.vendor_link_tokens TO service_role;
GRANT ALL ON public.vendor_documents TO service_role;
GRANT ALL ON public.vendor_banking_change_requests TO service_role;
GRANT ALL ON public.vendor_onboarding_preferences TO service_role;
GRANT ALL ON public.vendor_onboarding_events TO service_role;

GRANT SELECT ON public.vendor_otp_challenges TO authenticated;
GRANT SELECT ON public.vendor_link_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vendor_documents TO authenticated;
GRANT SELECT, UPDATE ON public.vendor_banking_change_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_onboarding_preferences TO authenticated;
GRANT SELECT, INSERT ON public.vendor_onboarding_events TO authenticated;
REVOKE SELECT (otp_hash) ON public.vendor_otp_challenges FROM anon, authenticated;
REVOKE SELECT (token) ON public.vendor_link_tokens FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor_documents',
  'vendor_documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/csv']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.is_valid_vendor_document_upload_token(p_storage_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_link_tokens vlt
    WHERE vlt.token = split_part(split_part(p_storage_name, '/', 2), '_', 1)
      AND vlt.link_type = 'tax'
      AND vlt.status = 'pending'
      AND vlt.expires_at > now()
      AND vlt.deleted_at IS NULL
  );
$$;

DROP POLICY IF EXISTS vendor_documents_magic_link_upload ON storage.objects;
CREATE POLICY vendor_documents_magic_link_upload
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'vendor_documents'
  AND name LIKE 'w9_documents/%'
  AND public.is_valid_vendor_document_upload_token(name)
);

DROP POLICY IF EXISTS vendor_documents_manager_read ON storage.objects;
CREATE POLICY vendor_documents_manager_read
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

DROP POLICY IF EXISTS vendor_documents_manager_write ON storage.objects;
CREATE POLICY vendor_documents_manager_write
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'vendor_documents' AND public.is_manager_or_above())
WITH CHECK (bucket_id = 'vendor_documents' AND public.is_manager_or_above());

CREATE OR REPLACE FUNCTION public.vendor_has_required_onboarding_documents(p_vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_documents vd
    WHERE vd.vendor_id = p_vendor_id
      AND vd.document_type = 'w9'
      AND vd.status = 'on_file'
      AND vd.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.issue_vendor_link_token(
  p_vendor_id uuid,
  p_link_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_link_type text := lower(btrim(COALESCE(p_link_type, '')));
  v_token public.vendor_link_tokens%ROWTYPE;
BEGIN
  IF v_link_type NOT IN ('tax', 'documents') THEN
    RAISE EXCEPTION 'Invalid vendor link type: %', p_link_type;
  END IF;

  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, NULL, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF COALESCE(v_vendor.onboarding_status, 'invited') NOT IN (
    'otp_verified',
    'pending_tax',
    'tax_submitted',
    'business_verified',
    'verification_failed',
    'documents_on_file',
    'pending_bank',
    'banking_submitted',
    'banking_verified',
    'method_selected',
    'pending_approval',
    'active',
    'completed'
  ) THEN
    RAISE EXCEPTION 'Vendor OTP must be verified before issuing magic links';
  END IF;

  UPDATE public.vendor_link_tokens
     SET status = 'cancelled',
         updated_at = now(),
         updated_by = auth.uid()
   WHERE vendor_id = p_vendor_id
     AND link_type = v_link_type
     AND status = 'pending'
     AND deleted_at IS NULL;

  INSERT INTO public.vendor_link_tokens (vendor_id, link_type)
  VALUES (p_vendor_id, v_link_type)
  RETURNING * INTO v_token;

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, actor_type, metadata
  ) VALUES (
    p_vendor_id,
    v_link_type || '_link_issued',
    'admin',
    jsonb_build_object('token_id', v_token.id)
  );

  RETURN jsonb_build_object(
    'id', v_token.id,
    'vendor_id', v_token.vendor_id,
    'organization_id', v_token.organization_id,
    'brand_id', v_token.brand_id,
    'location_id', v_token.location_id,
    'link_type', v_token.link_type,
    'token', v_token.token,
    'status', v_token.status,
    'expires_at', v_token.expires_at
  );
END;
$$;

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

  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  IF NOT public.reference_scope_writable(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id, NULL::timestamptz, 'location_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF COALESCE(v_vendor.onboarding_status, 'invited') NOT IN (
    'otp_verified',
    'tax_submitted',
    'business_verified',
    'documents_on_file',
    'pending_bank',
    'banking_submitted',
    'banking_verified',
    'method_selected',
    'pending_approval',
    'active',
    'completed'
  ) THEN
    RAISE EXCEPTION 'Vendor OTP must be verified before issuing banking links';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_tax_information vti
    WHERE vti.vendor_id = p_vendor_id
      AND vti.verification_status = 'verified'
      AND vti.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Business is not verified';
  END IF;

  IF NOT public.vendor_has_required_onboarding_documents(p_vendor_id) THEN
    RAISE EXCEPTION 'Required vendor documents are not on file';
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

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, actor_type, metadata
  ) VALUES (
    p_vendor_id,
    'banking_link_issued',
    'admin',
    jsonb_build_object('token_id', v_token.id, 'intent', v_intent)
  );

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
  v_request public.vendor_banking_change_requests%ROWTYPE;
  v_store_result jsonb;
  v_reason text;
BEGIN
  SELECT * INTO v_token
  FROM public.vendor_banking_link_tokens
  WHERE token = btrim(COALESCE(p_token, ''))
    AND status = 'pending'
    AND expires_at > now()
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired banking link';
  END IF;

  IF v_token.intent = 'replace' THEN
    v_reason := 'vendor_requested_update';
  ELSIF EXISTS (
    SELECT 1
    FROM public.vendor_banking_details existing
    WHERE existing.vendor_id = v_token.vendor_id
      AND existing.is_default = true
      AND existing.is_active = true
      AND existing.deleted_at IS NULL
  ) THEN
    v_reason := 'admin_correction';
  ELSE
    v_reason := 'onboarding';
  END IF;

  INSERT INTO public.vendor_banking_details (
    vendor_id,
    organization_id,
    brand_id,
    location_id,
    verification_state,
    callback_status,
    is_default,
    created_by,
    updated_by
  ) VALUES (
    v_token.vendor_id,
    v_token.organization_id,
    v_token.brand_id,
    v_token.location_id,
    'pending',
    'pending',
    false,
    v_token.created_by,
    v_token.created_by
  )
  RETURNING * INTO v_bank;

  v_store_result := public.store_vendor_banking_secret(v_bank.id, p_account, p_routing);

  INSERT INTO public.vendor_banking_change_requests (
    vendor_id,
    banking_detail_id,
    request_reason,
    requested_by,
    callback_phone_source,
    created_by,
    updated_by
  ) VALUES (
    v_token.vendor_id,
    v_bank.id,
    v_reason,
    v_token.created_by,
    'on_file_contact',
    v_token.created_by,
    v_token.created_by
  )
  RETURNING * INTO v_request;

  UPDATE public.vendor_banking_link_tokens
     SET status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   WHERE id = v_token.id;

  UPDATE public.vendors
     SET onboarding_status = 'banking_submitted',
         updated_at = now()
   WHERE id = v_token.vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, from_status, to_status, actor_type, metadata
  ) VALUES (
    v_token.vendor_id,
    'banking_submitted',
    NULL,
    'banking_submitted',
    'vendor',
    jsonb_build_object(
      'banking_row_id', v_bank.id,
      'change_request_id', v_request.id,
      'token_id', v_token.id,
      'intent', v_token.intent
    )
  );

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
      'Vendor banking callback required',
      'A vendor submitted banking details. Call the phone number already on file before paying this account.',
      'system',
      false,
      jsonb_build_object(
        'vendor_id', v_token.vendor_id,
        'banking_row_id', v_bank.id,
        'change_request_id', v_request.id,
        'token_id', v_token.id,
        'intent', v_token.intent
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_token.vendor_id,
    'banking_row_id', v_bank.id,
    'banking_change_request_id', v_request.id,
    'banking_secret_id', v_store_result->>'banking_secret_id',
    'account_last4', v_store_result->>'account_last4',
    'intent', v_token.intent,
    'is_default', v_bank.is_default,
    'verification_state', v_bank.verification_state,
    'callback_status', v_bank.callback_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_vendor_banking_callback(
  p_request_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.vendor_banking_change_requests%ROWTYPE;
  v_bank public.vendor_banking_details%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.vendor_banking_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Banking change request not found';
  END IF;

  IF NOT public.reference_scope_writable(v_request.organization_id, v_request.brand_id, v_request.location_id, NULL, 'branch_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_banking_change_requests
     SET callback_status = 'confirmed',
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         notes = COALESCE(p_notes, notes),
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = p_request_id
   RETURNING * INTO v_request;

  UPDATE public.vendor_banking_details
     SET callback_status = 'confirmed',
         verification_state = 'verified',
         verified_at = COALESCE(verified_at, now()),
         is_default = CASE
           WHEN v_request.request_reason IN ('onboarding', 'vendor_requested_update')
             OR NOT EXISTS (
               SELECT 1
               FROM public.vendor_banking_details existing
               WHERE existing.vendor_id = v_request.vendor_id
                 AND existing.is_default = true
                 AND existing.is_active = true
                 AND existing.deleted_at IS NULL
                 AND existing.id IS DISTINCT FROM v_request.banking_detail_id
             )
           THEN true
           ELSE is_default
         END,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = v_request.banking_detail_id
   RETURNING * INTO v_bank;

  UPDATE public.vendors
     SET onboarding_status = 'banking_verified',
         updated_at = now()
   WHERE id = v_request.vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, to_status, actor_type, metadata
  ) VALUES (
    v_request.vendor_id,
    'callback_confirmed',
    'banking_verified',
    'admin',
    jsonb_build_object('banking_row_id', v_bank.id, 'change_request_id', v_request.id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_request.vendor_id,
    'banking_row_id', v_bank.id,
    'change_request_id', v_request.id,
    'verification_state', v_bank.verification_state,
    'callback_status', v_bank.callback_status,
    'is_default', v_bank.is_default
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.override_vendor_banking_callback(
  p_request_id uuid,
  p_override_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.vendor_banking_change_requests%ROWTYPE;
  v_bank public.vendor_banking_details%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_override_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Override reason is required';
  END IF;

  SELECT * INTO v_request
  FROM public.vendor_banking_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Banking change request not found';
  END IF;

  IF NOT public.reference_scope_writable(v_request.organization_id, v_request.brand_id, v_request.location_id, NULL, 'branch_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_banking_change_requests
     SET callback_status = 'skipped_override',
         override_by = auth.uid(),
         override_reason = p_override_reason,
         override_at = now(),
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = p_request_id
   RETURNING * INTO v_request;

  UPDATE public.vendor_banking_details
     SET callback_status = 'confirmed',
         verification_state = 'verified',
         verified_at = COALESCE(verified_at, now()),
         is_default = CASE
           WHEN v_request.request_reason IN ('onboarding', 'vendor_requested_update')
             OR NOT EXISTS (
               SELECT 1
               FROM public.vendor_banking_details existing
               WHERE existing.vendor_id = v_request.vendor_id
                 AND existing.is_default = true
                 AND existing.is_active = true
                 AND existing.deleted_at IS NULL
                 AND existing.id IS DISTINCT FROM v_request.banking_detail_id
             )
           THEN true
           ELSE is_default
         END,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = v_request.banking_detail_id
   RETURNING * INTO v_bank;

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, to_status, actor_type, metadata
  ) VALUES (
    v_request.vendor_id,
    'callback_override',
    'banking_verified',
    'admin',
    jsonb_build_object(
      'banking_row_id', v_bank.id,
      'change_request_id', v_request.id,
      'override_reason', p_override_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_request.vendor_id,
    'banking_row_id', v_bank.id,
    'change_request_id', v_request.id,
    'verification_state', v_bank.verification_state,
    'callback_status', v_bank.callback_status,
    'is_default', v_bank.is_default
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.review_vendor_tax_information(
  p_tax_row_id uuid,
  p_verification_status text,
  p_verification_method text DEFAULT 'manual_review',
  p_failure_reason text DEFAULT NULL,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax public.vendor_tax_information%ROWTYPE;
  v_status text := lower(btrim(COALESCE(p_verification_status, '')));
  v_method text := lower(btrim(COALESCE(p_verification_method, 'manual_review')));
BEGIN
  IF v_status NOT IN ('verified', 'failed', 'mismatch') THEN
    RAISE EXCEPTION 'Invalid tax verification status: %', p_verification_status;
  END IF;

  IF v_method NOT IN ('irs_tin_match', 'business_registry_lookup', 'manual_review') THEN
    RAISE EXCEPTION 'Invalid tax verification method: %', p_verification_method;
  END IF;

  SELECT * INTO v_tax
  FROM public.vendor_tax_information
  WHERE id = p_tax_row_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_tax.id IS NULL THEN
    RAISE EXCEPTION 'Vendor tax information not found';
  END IF;

  IF NOT public.reference_scope_writable(v_tax.organization_id, v_tax.brand_id, v_tax.location_id, v_tax.deleted_at, 'branch_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vendor_tax_information
     SET verification_status = v_status,
         verification_method = v_method,
         verification_checked_at = now(),
         verification_failure_reason = CASE WHEN v_status = 'verified' THEN NULL ELSE p_failure_reason END,
         w9_status = CASE WHEN v_status = 'verified' THEN 'verified' ELSE 'rejected' END,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = p_tax_row_id
   RETURNING * INTO v_tax;

  IF v_tax.w9_document_id IS NOT NULL THEN
    UPDATE public.vendor_documents
       SET status = CASE WHEN v_status = 'verified' THEN 'on_file' ELSE 'rejected' END,
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           review_notes = p_review_notes,
           updated_by = auth.uid(),
           updated_at = now()
     WHERE id = v_tax.w9_document_id;
  END IF;

  UPDATE public.vendors
     SET business_verified_at = CASE WHEN v_status = 'verified' THEN now() ELSE NULL END,
         onboarding_status = CASE WHEN v_status = 'verified' THEN 'business_verified' ELSE 'verification_failed' END,
         updated_at = now()
   WHERE id = v_tax.vendor_id
     AND COALESCE(onboarding_status, 'invited') NOT IN ('active', 'completed', 'rejected');

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, to_status, actor_type, metadata
  ) VALUES (
    v_tax.vendor_id,
    CASE WHEN v_status = 'verified' THEN 'business_verified' ELSE 'verification_failed' END,
    CASE WHEN v_status = 'verified' THEN 'business_verified' ELSE 'verification_failed' END,
    'admin',
    jsonb_build_object('tax_row_id', v_tax.id, 'verification_method', v_method)
  );

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_tax.vendor_id,
    'tax_row_id', v_tax.id,
    'verification_status', v_tax.verification_status,
    'w9_status', v_tax.w9_status
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_vendor_payment_account(p_vendor_id uuid)
RETURNS TABLE (
  id uuid,
  banking_secret_id uuid,
  account_last4 text,
  is_default boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vbd.id,
         vbd.banking_secret_id,
         vbd.account_last4,
         vbd.is_default
  FROM public.vendor_banking_details vbd
  WHERE vbd.vendor_id = p_vendor_id
    AND vbd.is_active = true
    AND vbd.verification_state = 'verified'
    AND vbd.callback_status = 'confirmed'
    AND vbd.banking_secret_id IS NOT NULL
    AND vbd.deleted_at IS NULL
  ORDER BY vbd.is_default DESC, vbd.created_at ASC, vbd.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.transition_vendor_approval(
  p_vendor_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_new_status text;
BEGIN
  v_new_status := lower(btrim(COALESCE(p_new_status, '')));

  SELECT * INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id
  FOR UPDATE;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  PERFORM public.assert_can_approve_vendor_scope(v_vendor.organization_id, v_vendor.brand_id, v_vendor.location_id);

  IF v_new_status = v_vendor.approval_status THEN
    RAISE EXCEPTION 'Vendor approval_status is already %', v_new_status;
  END IF;

  IF NOT (
    (v_vendor.approval_status = 'draft' AND v_new_status IN ('pending_approval', 'approved'))
    OR (v_vendor.approval_status = 'pending_approval' AND v_new_status IN ('approved', 'rejected'))
    OR (v_vendor.approval_status = 'approved' AND v_new_status = 'suspended')
    OR (v_vendor.approval_status = 'suspended' AND v_new_status IN ('approved', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'Invalid vendor approval transition from % to %',
      v_vendor.approval_status,
      COALESCE(NULLIF(v_new_status, ''), '<empty>');
  END IF;

  IF v_new_status = 'approved' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendor_tax_information vti
      WHERE vti.vendor_id = p_vendor_id
        AND vti.verification_status = 'verified'
        AND vti.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Business is not verified';
    END IF;

    IF NOT public.vendor_has_required_onboarding_documents(p_vendor_id) THEN
      RAISE EXCEPTION 'W9 is not on file';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.vendor_banking_details vbd
      WHERE vbd.vendor_id = p_vendor_id
        AND vbd.is_default = true
        AND vbd.is_active = true
        AND vbd.verification_state = 'verified'
        AND vbd.callback_status = 'confirmed'
        AND vbd.banking_secret_id IS NOT NULL
        AND vbd.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Banking is not callback-confirmed';
    END IF;
  END IF;

  UPDATE public.vendors
     SET approval_status = v_new_status,
         onboarding_status = CASE
           WHEN v_new_status = 'approved' THEN 'active'
           WHEN v_new_status = 'pending_approval' THEN 'pending_approval'
           WHEN v_new_status = 'rejected' THEN 'rejected'
           ELSE onboarding_status
         END,
         updated_at = now()
   WHERE id = p_vendor_id
   RETURNING * INTO v_vendor;

  INSERT INTO public.vendor_onboarding_events (
    vendor_id, event_type, from_status, to_status, actor_type
  ) VALUES (
    p_vendor_id,
    'approval_transition',
    NULL,
    v_new_status,
    'admin'
  );

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_vendor.id,
    'approval_status', v_vendor.approval_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_has_required_onboarding_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_has_required_onboarding_documents(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_valid_vendor_document_upload_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_vendor_document_upload_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_vendor_link_token(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_vendor_link_token(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_vendor_banking_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_vendor_banking_link(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vendor_banking_via_link(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_vendor_banking_callback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_vendor_banking_callback(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.override_vendor_banking_callback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_vendor_banking_callback(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_vendor_tax_information(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_vendor_tax_information(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_vendor_payment_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_payment_account(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_vendor_approval(uuid, text) TO authenticated, service_role;

COMMIT;
