-- Small follow-up to 20260720000020_hierarchy_review_gate.sql: the frontend needs the
-- rejection/resubmit reason text to show the tenant why their hierarchy submission was sent
-- back. profiles.hierarchy_review_status (the status itself) is already visible via the
-- normal profile load, but the reason text lives on onboarding_hierarchy_submissions.
-- Extends get_my_onboarding_state() with a 'hierarchy_submission' key, same pattern already
-- used there for business_verification/payment_method/coupon_redemption.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile JSONB;
  v_verification JSONB;
  v_payment JSONB;
  v_coupon JSONB;
  v_run JSONB;
  v_hierarchy JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id;

  SELECT to_jsonb(bv) INTO v_verification
  FROM public.business_verifications bv
  WHERE bv.user_id = v_user_id
  ORDER BY bv.created_at DESC
  LIMIT 1;

  SELECT to_jsonb(pm) INTO v_payment
  FROM public.onboarding_payment_methods pm
  WHERE pm.user_id = v_user_id
  ORDER BY pm.created_at DESC
  LIMIT 1;

  SELECT to_jsonb(r) INTO v_coupon
  FROM public.onboarding_coupon_redemptions r
  WHERE r.user_id = v_user_id
    AND r.status = 'applied'
  ORDER BY r.redeemed_at DESC
  LIMIT 1;

  SELECT to_jsonb(w) INTO v_run
  FROM public.onboarding_workflow_runs w
  WHERE w.user_id = v_user_id
  ORDER BY w.started_at DESC
  LIMIT 1;

  SELECT jsonb_build_object('status', h.status, 'rejection_reason', h.rejection_reason) INTO v_hierarchy
  FROM public.onboarding_hierarchy_submissions h
  WHERE h.user_id = v_user_id
  ORDER BY h.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'workflow_run', v_run,
    'business_verification', v_verification,
    'payment_method', v_payment,
    'coupon_redemption', v_coupon,
    'hierarchy_submission', v_hierarchy
  );
END;
$function$;

COMMIT;
