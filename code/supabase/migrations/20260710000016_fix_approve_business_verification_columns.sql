-- Fix business verification approval to use the actual business_verifications schema.
BEGIN;

CREATE OR REPLACE FUNCTION public.approve_business_verification(p_user_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_run_id UUID;
  v_verification_id UUID;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  SELECT id
  INTO v_verification_id
  FROM public.business_verifications
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_verification_id IS NULL THEN
    RAISE EXCEPTION 'Business verification row not found for user %', p_user_id;
  END IF;

  UPDATE public.business_verifications
  SET verification_status = 'verified',
      reviewed_by = v_actor,
      reviewed_at = now(),
      rejection_reason = NULL,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_note', p_note),
      updated_at = now()
  WHERE id = v_verification_id;

  UPDATE public.profiles
  SET business_verification_status = 'verified',
      business_verified_at = now(),
      onboarding_status = 'in_progress',
      onboarding_current_step = 'payment_method',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'approve_business_verification', p_note);

  INSERT INTO public.notifications(user_id, type, title, message, is_read)
  VALUES (p_user_id, 'system', 'Business verification approved', 'Your business verification was approved. You can continue onboarding.', false);

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    p_user_id,
    'business_verification',
    'admin_approved',
    'verified',
    jsonb_build_object('actor_user_id', v_actor, 'verification_id', v_verification_id)
  );

  RETURN jsonb_build_object('success', true, 'status', 'verified', 'next_step', 'payment_method', 'verification_id', v_verification_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_business_verification(UUID, TEXT) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
