-- ============================================================
-- 018: Fix Anonymous Invitation Read
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_invite_details(invite_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'email', email,
    'role', role,
    'organization_id', organization_id,
    'brand_id', brand_id,
    'location_id', location_id,
    'token', token
  ) INTO v_result
  FROM public.invitations
  WHERE token = invite_token AND accepted_at IS NULL;
  
  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

COMMIT;
