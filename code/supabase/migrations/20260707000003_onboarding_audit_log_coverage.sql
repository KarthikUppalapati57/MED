BEGIN;

CREATE OR REPLACE FUNCTION public.redact_onboarding_audit_payload(
  p_table_name TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_table_name = 'profiles' THEN
    v_payload := v_payload - 'onboarding_draft';
    IF p_payload ? 'onboarding_draft' THEN
      v_payload := v_payload || jsonb_build_object('onboarding_draft_redacted', true);
    END IF;
  END IF;

  IF p_table_name = 'onboarding_contact_otps' THEN
    v_payload := v_payload - 'code_hash' - 'provider_reference_id';
  END IF;

  IF p_table_name = 'tenant_payment_authorizations' THEN
    v_payload := v_payload - 'signature_payload' - 'signature_storage_path' - 'consent_text';
  END IF;

  IF p_table_name = 'onboarding_bank_accounts' THEN
    v_payload := v_payload - 'banking_secret_id';
  END IF;

  IF p_table_name = 'invitations' THEN
    v_payload := v_payload - 'token' - 'invite_token' - 'invitation_token' - 'raw_token';
  END IF;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_onboarding_audit_org_id(p_row JSONB)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  IF p_row ? 'organization_id'
     AND COALESCE(p_row->>'organization_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN (p_row->>'organization_id')::UUID;
  END IF;

  IF p_row ? 'user_id'
     AND COALESCE(p_row->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_id := (p_row->>'user_id')::UUID;
  ELSIF p_row ? 'id'
     AND COALESCE(p_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_id := (p_row->>'id')::UUID;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_onboarding_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_old JSONB;
  v_new JSONB;
  v_row JSONB;
  v_org_id UUID;
  v_record_id UUID;
  v_target_user_id UUID;
  v_entity_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := public.redact_onboarding_audit_payload(TG_TABLE_NAME, to_jsonb(OLD));
    v_row := COALESCE(to_jsonb(OLD), '{}'::jsonb);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := public.redact_onboarding_audit_payload(TG_TABLE_NAME, to_jsonb(OLD));
    v_new := public.redact_onboarding_audit_payload(TG_TABLE_NAME, to_jsonb(NEW));
    v_row := COALESCE(to_jsonb(NEW), '{}'::jsonb);
  ELSE
    v_new := public.redact_onboarding_audit_payload(TG_TABLE_NAME, to_jsonb(NEW));
    v_row := COALESCE(to_jsonb(NEW), '{}'::jsonb);
  END IF;

  IF v_row ? 'id'
     AND COALESCE(v_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_record_id := (v_row->>'id')::UUID;
    v_entity_id := v_row->>'id';
  ELSE
    v_entity_id := COALESCE(v_row->>'id', TG_TABLE_NAME);
  END IF;

  IF v_row ? 'user_id'
     AND COALESCE(v_row->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := (v_row->>'user_id')::UUID;
  ELSIF TG_TABLE_NAME = 'profiles'
     AND v_row ? 'id'
     AND COALESCE(v_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := (v_row->>'id')::UUID;
  ELSIF v_row ? 'target_user_id'
     AND COALESCE(v_row->>'target_user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_user_id := (v_row->>'target_user_id')::UUID;
  END IF;

  v_org_id := public.resolve_onboarding_audit_org_id(v_row);

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    entity_type,
    entity_id,
    module,
    details
  ) VALUES (
    v_org_id,
    COALESCE(v_actor, v_target_user_id),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old,
    v_new,
    TG_TABLE_NAME,
    v_entity_id,
    'onboarding',
    jsonb_build_object(
      'source', 'onboarding_audit_trigger',
      'target_user_id', v_target_user_id,
      'actor_user_id', v_actor,
      'redacted_fields', CASE
        WHEN TG_TABLE_NAME = 'profiles' THEN jsonb_build_array('onboarding_draft')
        WHEN TG_TABLE_NAME = 'onboarding_contact_otps' THEN jsonb_build_array('code_hash', 'provider_reference_id')
        WHEN TG_TABLE_NAME = 'tenant_payment_authorizations' THEN jsonb_build_array('signature_payload', 'signature_storage_path', 'consent_text')
        WHEN TG_TABLE_NAME = 'onboarding_bank_accounts' THEN jsonb_build_array('banking_secret_id')
        WHEN TG_TABLE_NAME = 'invitations' THEN jsonb_build_array('token', 'invite_token', 'invitation_token', 'raw_token')
        ELSE '[]'::jsonb
      END
    )::TEXT
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'business_verifications',
    'organization_addresses',
    'onboarding_workflow_runs',
    'onboarding_step_events',
    'onboarding_payment_methods',
    'onboarding_contact_otps',
    'onboarding_bank_accounts',
    'tenant_payment_authorizations',
    'onboarding_admin_actions',
    'platform_onboarding_settings',
    'invitations'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_onboarding_%I ON public.%I', v_table, v_table);
      EXECUTE format('CREATE TRIGGER audit_onboarding_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.process_onboarding_audit_log()', v_table, v_table);
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS audit_onboarding_profiles ON public.profiles;
CREATE TRIGGER audit_onboarding_profiles
AFTER UPDATE OF
  onboarding_status,
  onboarding_current_step,
  onboarding_completed_at,
  onboarding_draft,
  business_email,
  business_email_verified_at,
  business_phone,
  business_phone_verified_at,
  business_verification_status,
  business_verification_score,
  business_verification_provider,
  business_verified_at,
  business_type,
  tax_identifier_type,
  tax_identifier_last4,
  payment_method_type,
  payment_method_verified_at
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.process_onboarding_audit_log();

DO $$
DECLARE
  v_table TEXT;
  v_record RECORD;
  v_record_id UUID;
  v_target_user_id UUID;
  v_org_id UUID;
  v_entity_id TEXT;
  v_row JSONB;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'business_verifications',
    'organization_addresses',
    'onboarding_workflow_runs',
    'onboarding_step_events',
    'onboarding_payment_methods',
    'onboarding_contact_otps',
    'onboarding_bank_accounts',
    'tenant_payment_authorizations',
    'onboarding_admin_actions',
    'platform_onboarding_settings',
    'invitations'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_record IN EXECUTE format('SELECT to_jsonb(t) AS row_data FROM public.%I t', v_table) LOOP
      v_row := v_record.row_data;
      v_record_id := NULL;
      v_target_user_id := NULL;
      v_entity_id := COALESCE(v_row->>'id', v_table);

      IF COALESCE(v_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_record_id := (v_row->>'id')::UUID;
      END IF;

      IF COALESCE(v_row->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_target_user_id := (v_row->>'user_id')::UUID;
      ELSIF COALESCE(v_row->>'target_user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_target_user_id := (v_row->>'target_user_id')::UUID;
      END IF;

      v_org_id := public.resolve_onboarding_audit_org_id(v_row);

      IF NOT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE table_name = v_table
          AND action = 'BACKFILL'
          AND COALESCE(entity_id, '') = COALESCE(v_entity_id, '')
      ) THEN
        INSERT INTO public.audit_logs (
          organization_id,
          user_id,
          action,
          table_name,
          record_id,
          new_data,
          entity_type,
          entity_id,
          module,
          details
        ) VALUES (
          v_org_id,
          v_target_user_id,
          'BACKFILL',
          v_table,
          v_record_id,
          public.redact_onboarding_audit_payload(v_table, v_row),
          v_table,
          v_entity_id,
          'onboarding',
          jsonb_build_object('source', 'onboarding_audit_backfill')::TEXT
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.audit_logs (
  organization_id,
  user_id,
  action,
  table_name,
  record_id,
  new_data,
  entity_type,
  entity_id,
  module,
  details
)
SELECT
  public.resolve_onboarding_audit_org_id(to_jsonb(p)),
  p.id,
  'BACKFILL',
  'profiles',
  p.id,
  public.redact_onboarding_audit_payload('profiles', to_jsonb(p)),
  'profiles',
  p.id::TEXT,
  'onboarding',
  jsonb_build_object('source', 'onboarding_profile_audit_backfill')::TEXT
FROM public.profiles p
WHERE (
    COALESCE(p.onboarding_status, 'not_started') <> 'not_started'
    OR COALESCE(p.business_verification_status, 'not_started') <> 'not_started'
    OR p.business_email_verified_at IS NOT NULL
    OR p.business_phone_verified_at IS NOT NULL
    OR p.payment_method_verified_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.table_name = 'profiles'
      AND a.action = 'BACKFILL'
      AND a.entity_id = p.id::TEXT
  );
REVOKE ALL ON FUNCTION public.redact_onboarding_audit_payload(TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_onboarding_audit_org_id(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_onboarding_audit_log() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

