-- R&D realtime table publication mirrored from QA.
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