-- ============================================================
-- 021: Add Phone to Profiles & Create Check Email RPC
-- ============================================================
-- Adds support for users editing their phone number on Profile
-- and enables check_email_exists function for Forgot Password.
-- ============================================================

BEGIN;

-- Add phone column if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create secure email check RPC for unauthenticated check
CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE email = email_to_check
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke public execution to ensure explicit grants
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated, service_role;

COMMIT;
