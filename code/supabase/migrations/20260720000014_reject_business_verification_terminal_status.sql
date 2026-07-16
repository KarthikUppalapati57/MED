-- Reject vs "ask to resubmit" are currently indistinguishable: both
-- reject_business_verification() and request_onboarding_more_info() set
-- verification_status / business_verification_status = 'failed', and
-- BusinessVerification.jsx routes both back to the same editable, resubmittable
-- form (see 20260719000001, which deliberately merged them). Product decision:
-- Reject must be a genuine terminal state the tenant cannot resubmit from,
-- while "ask to resubmit" (request_onboarding_more_info) keeps today's 'failed'
-- resubmit behavior unchanged.
--
-- Adds a new 'rejected' status distinct from 'failed':
--   - reject_business_verification() now sets 'rejected' (terminal)
--   - request_onboarding_more_info() is untouched, still sets 'failed' (resubmittable)
--   - notify_business_verification_review_state() fires for 'rejected' too, with
--     its own title/message copy and its own onboarding_step_events event_type
--   - platform_business_verification_reviews() queue includes 'rejected' rows so
--     admins can still see the outcome
--   - CHECK constraints on profiles.business_verification_status,
--     business_verifications.verification_status, and
--     onboarding_step_events.event_type extended to allow the new value(s)

BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_business_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_business_verification_status_check
  CHECK (business_verification_status = ANY (ARRAY['not_started'::text, 'pending_review'::text, 'verified'::text, 'failed'::text, 'rejected'::text]));

ALTER TABLE public.business_verifications
  DROP CONSTRAINT business_verifications_verification_status_check;
ALTER TABLE public.business_verifications
  ADD CONSTRAINT business_verifications_verification_status_check
  CHECK (verification_status = ANY (ARRAY['pending_review'::text, 'verified'::text, 'failed'::text, 'rejected'::text]));

ALTER TABLE public.onboarding_step_events
  DROP CONSTRAINT onboarding_step_events_event_type_check;
ALTER TABLE public.onboarding_step_events
  ADD CONSTRAINT onboarding_step_events_event_type_check
  CHECK (event_type = ANY (ARRAY['started'::text, 'submitted'::text, 'verified'::text, 'failed'::text, 'completed'::text, 'skipped'::text, 'draft_saved'::text, 'bank_account_submitted'::text, 'signature_captured'::text, 'admin_approved'::text, 'admin_rejected'::text, 'more_info_requested'::text, 'failed_notification_queued'::text, 'pending_review_notification_queued'::text, 'rejected_notification_queued'::text]));

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
  SET verification_status = 'rejected',
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
  SET business_verification_status = 'rejected',
      onboarding_status = 'blocked',
      onboarding_current_step = 'business_verification',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_admin_actions(actor_user_id, target_user_id, action, reason)
  VALUES (v_actor, p_user_id, 'reject_business_verification', p_reason);

  -- Notification is handled by trg_notify_business_verification_review_state (fires on the
  -- verification_status UPDATE above) -- do not insert one here too, or the tenant gets two.

  v_run_id := public.get_or_create_onboarding_run(p_user_id);
  PERFORM public.record_onboarding_event(v_run_id, p_user_id, 'business_verification', 'admin_rejected', 'rejected', jsonb_build_object('actor_user_id', v_actor, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_business_verification_review_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin RECORD;
  v_title TEXT;
  v_message TEXT;
  v_run_id UUID;
BEGIN
  IF NEW.verification_status NOT IN ('pending_review', 'failed', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.verification_status, '') = NEW.verification_status THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.verification_status = 'rejected' THEN 'Business verification rejected'
    WHEN NEW.verification_status = 'failed' THEN 'Business verification needs changes'
    ELSE 'Business verification pending review'
  END;
  v_message := CASE
    WHEN NEW.verification_status = 'rejected' THEN COALESCE(NULLIF(NEW.rejection_reason, ''), 'Your business verification was rejected.')
    WHEN NEW.verification_status = 'failed' THEN COALESCE(NULLIF(NEW.rejection_reason, ''), 'Your business verification could not be approved. Please review and resubmit.')
    ELSE 'Your business verification is pending platform admin review.'
  END;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
  VALUES (NEW.user_id, NEW.organization_id, 'system', v_title, v_message, false);

  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'platform_admin'
  LOOP
    INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
    VALUES (
      v_admin.id,
      NEW.organization_id,
      'system',
      v_title,
      COALESCE(NEW.legal_business_name, 'Tenant') || ' requires onboarding follow-up: ' || NEW.verification_status,
      false
    );
  END LOOP;

  v_run_id := public.get_or_create_onboarding_run(NEW.user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    NEW.user_id,
    'business_verification',
    CASE
      WHEN NEW.verification_status = 'rejected' THEN 'rejected_notification_queued'
      WHEN NEW.verification_status = 'failed' THEN 'failed_notification_queued'
      ELSE 'pending_review_notification_queued'
    END,
    NEW.verification_status,
    jsonb_build_object('verification_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

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
  WHERE bv.verification_status IN ('pending_review', 'failed', 'verified', 'rejected')
  ORDER BY bv.created_at DESC
  LIMIT 200;
END;
$$;

COMMIT;
