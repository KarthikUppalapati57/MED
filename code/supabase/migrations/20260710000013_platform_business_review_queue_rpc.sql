-- Platform admins need a reliable review queue even before tenant hierarchy rows exist.
-- This bypasses table RLS only after verifying the caller is a platform_admin.

CREATE OR REPLACE FUNCTION public.platform_business_verification_reviews()
RETURNS SETOF public.business_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'platform_admin role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT bv.*
  FROM public.business_verifications bv
  WHERE bv.verification_status IN ('pending_review', 'failed', 'verified')
  ORDER BY bv.created_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_business_verification_reviews() TO authenticated, service_role;
