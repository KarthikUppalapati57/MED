ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

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
  metadata jsonb,
  status text,
  status_message text
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
    i.metadata,
    CASE
      WHEN i.accepted_at IS NOT NULL THEN 'accepted'
      WHEN i.closed_at IS NOT NULL THEN 'closed'
      WHEN i.expires_at IS NOT NULL AND i.expires_at <= now() THEN 'expired'
      ELSE 'active'
    END AS status,
    CASE
      WHEN i.accepted_at IS NOT NULL THEN 'This invitation was already accepted. Please sign in instead.'
      WHEN i.closed_at IS NOT NULL THEN 'This invitation was closed by the Platform Admin. Please ask for a new invite.'
      WHEN i.expires_at IS NOT NULL AND i.expires_at <= now() THEN 'This invitation link has expired. Please ask the Platform Admin to reissue the invite.'
      ELSE 'Invitation is active.'
    END AS status_message
  FROM public.invitations i
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  WHERE btrim(i.token) = btrim(invite_token)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';