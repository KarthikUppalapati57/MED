-- Remove the deprecated Ask Tom chat workflow.
-- AI Insights remains the restaurant-specific AI surface.

BEGIN;

UPDATE public.plans
SET features = (
  SELECT COALESCE(jsonb_agg(DISTINCT feature), '[]'::jsonb)
  FROM (
    SELECT feature
    FROM jsonb_array_elements_text(features) AS feature
    WHERE feature <> 'ask_tom'
    UNION ALL
    SELECT 'ai_insights'
  ) plan_features
)
WHERE jsonb_typeof(features) = 'array'
  AND features ? 'ask_tom';

UPDATE public.organizations
SET enabled_modules = (
  SELECT COALESCE(jsonb_agg(DISTINCT module_key), '[]'::jsonb)
  FROM (
    SELECT module_key
    FROM jsonb_array_elements_text(enabled_modules) AS module_key
    WHERE module_key <> 'ask_tom'
    UNION ALL
    SELECT 'ai_insights'
  ) org_modules
)
WHERE jsonb_typeof(enabled_modules) = 'array'
  AND enabled_modules ? 'ask_tom';

DROP TABLE IF EXISTS public.ask_tom_messages;
DROP TABLE IF EXISTS public.ask_tom_threads;
DROP FUNCTION IF EXISTS public.ai_chat_response(UUID, TEXT);

COMMIT;
