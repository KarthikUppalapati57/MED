BEGIN;

CREATE OR REPLACE FUNCTION public.skip_banking_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_run_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_profile.business_verification_status, '') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be approved before banking setup can be skipped';
  END IF;

  IF v_profile.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization setup must be completed before banking setup can be skipped';
  END IF;

  IF COALESCE(v_profile.payment_verified, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Subscription payment must be verified before banking setup can be skipped';
  END IF;

  UPDATE public.profiles
  SET banking_onboarding_completed = true,
      updated_at = now()
  WHERE id = v_user_id;

  v_run_id := public.get_or_create_onboarding_run(v_user_id);

  PERFORM public.record_onboarding_event(
    v_run_id,
    v_user_id,
    'banking_setup',
    'skipped',
    'completed',
    jsonb_build_object('source', 'complete_onboarding', 'follow_up_path', '/Payments/setup')
  );

  RETURN jsonb_build_object(
    'success', true,
    'banking_onboarding_completed', true,
    'follow_up_path', '/Payments/setup'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.skip_banking_onboarding() FROM public;
GRANT EXECUTE ON FUNCTION public.skip_banking_onboarding() TO authenticated, service_role;

COMMIT;

