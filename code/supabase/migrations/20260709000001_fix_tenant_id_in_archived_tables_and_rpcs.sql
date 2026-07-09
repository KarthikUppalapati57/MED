-- Fix missing tenant_id columns in archive tables
-- Updates reissue_owner_invitation to maintain tenant association

BEGIN;

-- 1. Add tenant_id to archive tables to prevent data loss on deletion
ALTER TABLE public.archived_organizations ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.archived_profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.archived_invitations ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 2. Update reissue_owner_invitation to explicitly copy the tenant_id 
CREATE OR REPLACE FUNCTION public.reissue_owner_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
