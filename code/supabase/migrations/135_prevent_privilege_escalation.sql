-- ============================================================
-- 129: Prevent Mass Assignment / Privilege Escalation
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_profile_security_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if restricted security columns are being modified
  IF NEW.role IS DISTINCT FROM OLD.role OR
     NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
     NEW.brand_id IS DISTINCT FROM OLD.brand_id OR
     NEW.location_id IS DISTINCT FROM OLD.location_id THEN
     
     -- Only allow modifications if the current database user is NOT authenticated/anon
     -- Typically, standard API requests execute as 'authenticated'. 
     -- System backend actions run as 'postgres' or 'service_role' or 'supabase_admin'.
     IF current_setting('role') IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION '42501: Privilege escalation attempt detected. You cannot modify your own role or organization bindings.';
     END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- Apply the trigger to the profiles table
DROP TRIGGER IF EXISTS trg_protect_profile_security_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_security_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_security_columns();

COMMIT;
