-- Clean up remaining DB lint blockers that are not part of runtime invoice behavior.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- pgTAP helper functions are test-only and should not live in the public runtime schema.
-- Keeping them there causes schema lint failures on modern Postgres catalogs.
DROP EXTENSION IF EXISTS pgtap CASCADE;

CREATE OR REPLACE FUNCTION public.log_frontend_event(
    p_event_name TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_payload JSONB
) RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
    v_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_org_id := public.get_my_org();
    v_role := public.get_auth_role();

    IF v_org_id IS NULL AND v_role <> 'platform_admin' THEN
        RAISE EXCEPTION 'Cannot emit event without organization context';
    END IF;

    RETURN public.emit_domain_event(p_event_name, p_entity_type, p_entity_id, v_org_id, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reissue_owner_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    tenant_id, organization_id, email, role, token, invited_by, expires_at, metadata, status
  )
  VALUES (
    v_old.tenant_id,
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

COMMIT;
