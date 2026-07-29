-- Pending R&D cron jobs that require the R&D service-role key.
-- Replace <RND_SERVICE_ROLE_KEY> before running.

select cron.schedule('onboarding-expiry-monitor', '0 9 * * *', $$
SELECT net.http_post('https://vkfrsoakhssvvavmjeoy.supabase.co/functions/v1/onboarding-expiry-monitor', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <RND_SERVICE_ROLE_KEY>'));
$$);

select cron.schedule('schedule-reports', '0 6 * * *', $$
SELECT net.http_post('https://vkfrsoakhssvvavmjeoy.supabase.co/functions/v1/schedule-reports', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <RND_SERVICE_ROLE_KEY>'));
$$);