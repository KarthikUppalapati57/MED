-- Fixes two onboarding review bugs found in an end-to-end trace of the tenant onboarding flow:
--
-- 1. request_onboarding_more_info() set business_verifications.verification_status and
--    profiles.business_verification_status to 'pending_review' -- the exact value
--    BusinessVerification.jsx treats as a dead-end "wait for admin, you're logged out" screen
--    (see App.jsx needsBusinessVerification / BusinessVerification.jsx status handling). A
--    tenant asked for more info could never see an editable form again. Fix: reuse the
--    existing 'failed' status (same value reject_business_verification already uses) so the
--    tenant lands back on an editable, resubmittable business-verification form. Only
--    approve_business_verification (unchanged) can ever set 'verified' and unlock hierarchy
--    setup. Reject and Request Info remain distinct admin-facing actions/audit entries
--    (onboarding_admin_actions.action, business_verifications.metadata reason key) but now
--    share the same tenant-facing effect.
--
-- 2. Both reject_business_verification() and request_onboarding_more_info() each insert their
--    own row into public.notifications *and* the business_verifications status UPDATE fires
--    trigger notify_business_verification_review_state() (which inserts its own notification
--    for the tenant, plus one per platform_admin) whenever the new status is 'pending_review'
--    or 'failed'. That produced two near-identical in-app notifications per action. Fix: drop
--    the direct notifications insert from both RPCs and rely solely on the trigger (single
--    writer for tenant-facing status-change notifications). approve_business_verification's
--    own insert is untouched -- the trigger explicitly skips 'verified'.
--
-- Also extends get_my_business_verification_draft() to return the latest rejection reason so
-- BusinessVerification.jsx can show the tenant what to fix (previously it only returned the
-- draft form payload, current step, and onboarding_status -- nothing about *why* they were
-- sent back).

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_business_verification(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'failed',
      rejection_reason = p_reason,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_reason', p_reason),
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.business_verifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
  );

  UPDATE public.profiles
  SET business_verification_status = 'failed',
      onboarding_status = 'blocked',
      onboarding_current_step = 'business_verification',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'reject_business_verification', p_reason);

  -- Notification is handled by trg_notify_business_verification_review_state (fires on the
  -- verification_status UPDATE above) -- do not insert one here too, or the tenant gets two.

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'admin_rejected', 'failed', jsonb_build_object('actor_user_id', v_actor, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_onboarding_more_info(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'failed',
      rejection_reason = p_reason,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('more_info_reason', p_reason),
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.business_verifications
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1
  );

  UPDATE public.profiles
  SET business_verification_status = 'failed',
      onboarding_status = 'blocked',
      onboarding_current_step = 'business_verification',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'request_more_info', p_reason);

  -- Notification is handled by trg_notify_business_verification_review_state (fires on the
  -- verification_status UPDATE above) -- do not insert one here too, or the tenant gets two.

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'more_info_requested', 'failed', jsonb_build_object('actor_user_id', v_actor, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_business_verification_draft()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_profile RECORD;
  v_verification RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT onboarding_draft, onboarding_current_step, onboarding_status, business_verification_status
  INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT rejection_reason, metadata
  INTO v_verification
  FROM public.business_verifications
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'draft', COALESCE(v_profile.onboarding_draft, '{}'::jsonb),
    'current_step', v_profile.onboarding_current_step,
    'status', v_profile.onboarding_status,
    'business_verification_status', v_profile.business_verification_status,
    'rejection_reason', v_verification.rejection_reason,
    'more_info_reason', v_verification.metadata->>'more_info_reason'
  );
END;
$function$;

COMMIT;
