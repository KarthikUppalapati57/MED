-- Allow all onboarding workflow event names emitted by current RPCs/triggers.
-- Earlier onboarding migrations added more granular audit events after the original
-- onboarding_step_events.event_type check constraint was created.

ALTER TABLE public.onboarding_step_events
  DROP CONSTRAINT IF EXISTS onboarding_step_events_event_type_check;

ALTER TABLE public.onboarding_step_events
  ADD CONSTRAINT onboarding_step_events_event_type_check
  CHECK (
    event_type IN (
      'started',
      'submitted',
      'verified',
      'failed',
      'completed',
      'skipped',
      'draft_saved',
      'bank_account_submitted',
      'signature_captured',
      'admin_approved',
      'admin_rejected',
      'more_info_requested',
      'failed_notification_queued',
      'pending_review_notification_queued'
    )
  );