-- Enforce EIN vs SSN based on onboarding tenant/business type.

BEGIN;

CREATE OR REPLACE FUNCTION public.required_tax_identifier_type_for_business_type(p_business_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_business_type IN ('sole_proprietor', 'independent_contractor') THEN 'ssn'
    ELSE 'ein'
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_business_verification_identifier_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_required_type TEXT;
BEGIN
  v_required_type := public.required_tax_identifier_type_for_business_type(NEW.business_type);

  IF NEW.identifier_type IS DISTINCT FROM v_required_type THEN
    RAISE EXCEPTION 'Tax identifier type % is not allowed for business type %. Required type is %', NEW.identifier_type, NEW.business_type, v_required_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_business_verification_identifier_type ON public.business_verifications;
CREATE TRIGGER enforce_business_verification_identifier_type
BEFORE INSERT OR UPDATE OF business_type, identifier_type ON public.business_verifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_verification_identifier_type();

REVOKE EXECUTE ON FUNCTION public.required_tax_identifier_type_for_business_type(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.required_tax_identifier_type_for_business_type(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;