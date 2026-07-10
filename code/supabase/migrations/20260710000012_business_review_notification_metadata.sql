-- Add explicit navigation metadata to business verification review notifications.
-- Older notifications are still supported by title/message matching in the UI, but metadata makes future routing deterministic.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;


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
  IF NEW.verification_status NOT IN ('pending_review', 'failed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.verification_status, '') = NEW.verification_status THEN
    RETURN NEW;
  END IF;

  v_title := CASE
    WHEN NEW.verification_status = 'failed' THEN 'Business verification failed'
    ELSE 'Business verification pending review'
  END;
  v_message := CASE
    WHEN NEW.verification_status = 'failed' THEN COALESCE(NULLIF(NEW.rejection_reason, ''), 'Your business verification could not be approved. Please review and resubmit.')
    ELSE 'Your business verification is pending platform admin review.'
  END;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read, metadata)
  VALUES (
    NEW.user_id,
    NEW.organization_id,
    'system',
    v_title,
    v_message,
    false,
    jsonb_build_object(
      'review_type', 'business_verification',
      'verification_id', NEW.id,
      'tenant_user_id', NEW.user_id,
      'status', NEW.verification_status
    )
  );

  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'platform_admin'
  LOOP
    INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read, metadata)
    VALUES (
      v_admin.id,
      NEW.organization_id,
      'system',
      v_title,
      COALESCE(NEW.legal_business_name, 'Tenant') || ' requires onboarding follow-up: ' || NEW.verification_status,
      false,
      jsonb_build_object(
        'action', 'business_verification_review',
        'review_type', 'business_verification',
        'verification_id', NEW.id,
        'tenant_user_id', NEW.user_id,
        'status', NEW.verification_status,
        'target_path', '/PlatformOrganizations?review=business'
      )
    );
  END LOOP;

  v_run_id := public.get_or_create_onboarding_run(NEW.user_id);
  PERFORM public.record_onboarding_event(
    v_run_id,
    NEW.user_id,
    'business_verification',
    CASE WHEN NEW.verification_status = 'failed' THEN 'failed_notification_queued' ELSE 'pending_review_notification_queued' END,
    NEW.verification_status,
    jsonb_build_object('verification_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

UPDATE public.notifications
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'action', 'business_verification_review',
  'review_type', 'business_verification',
  'target_path', '/PlatformOrganizations?review=business'
)
WHERE (
    lower(COALESCE(title, '')) LIKE '%business verification pending review%'
    OR lower(COALESCE(message, '')) LIKE '%requires onboarding follow-up%'
  )
  AND user_id IN (SELECT id FROM public.profiles WHERE role = 'platform_admin');

