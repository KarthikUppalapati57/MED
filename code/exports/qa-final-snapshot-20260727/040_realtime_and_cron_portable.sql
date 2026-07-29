-- R&D cron and realtime settings mirrored from QA where portable.

-- Realtime publication membership.
do $$
declare
  t text;
  tables text[] := array[
    'access_requests','audit_logs_default','audit_logs_y2025','audit_logs_y2026','auto_orders','contact_requests','dashboard_action_status','dashboard_escalation_rules','dashboard_handoff_notes','dashboard_report_deliveries','dashboard_report_preferences','dashboard_review_logs','demo_requests','event_logs','inventory','invitations','invoices','notifications','organizations','payments','products','profiles','wastage_logs'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Portable cron jobs that do not embed project-specific service-role tokens.
select cron.schedule('process-webhook-queue', '* * * * *', $$SELECT public.dispatch_webhook_queue();$$)
where not exists (select 1 from cron.job where jobname = 'process-webhook-queue');

select cron.schedule('refresh_dashboard_views', '* * * * *', $$SELECT public.refresh_dashboard_materialized_views();$$)
where not exists (select 1 from cron.job where jobname = 'refresh_dashboard_views');

select cron.schedule('retry_stuck_integrations', '*/30 * * * *', $$
UPDATE public.integrations
   SET is_active = false,
       metadata = jsonb_set(
         jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sync_status}', '"failed"', true),
         '{last_error}',
         '"Timeout during sync"',
         true
       ),
       updated_at = now()
 WHERE COALESCE(metadata->>'sync_status', metadata->>'status') = 'syncing'
   AND updated_at < now() - interval '1 hour';
$$)
where not exists (select 1 from cron.job where jobname = 'retry_stuck_integrations');

select cron.schedule('send_due_date_reminders', '0 8 * * *', $$SELECT public.send_due_date_reminders();$$)
where not exists (select 1 from cron.job where jobname = 'send_due_date_reminders');