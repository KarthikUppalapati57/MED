-- Platform Organizations onboarding review currently selects onboarding_step_events.event_data.
-- The canonical event payload column is metadata; keep event_data as a compatibility alias column for deployed clients.
ALTER TABLE public.onboarding_step_events
  ADD COLUMN IF NOT EXISTS event_data JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.onboarding_step_events
SET event_data = COALESCE(NULLIF(event_data, '{}'::jsonb), metadata, '{}'::jsonb)
WHERE metadata IS NOT NULL;

NOTIFY pgrst, 'reload schema';
