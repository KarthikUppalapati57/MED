// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseServiceRoleClient } from '../_shared/supabase.ts';

type ReportType = 'daily' | 'weekly';

const toDateKey = (value = new Date()) => new Date(value).toISOString().slice(0, 10);

const monthBounds = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start: toDateKey(start), end: toDateKey(end) };
};

const money = (value: unknown) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (value: unknown) => `${Number(value || 0).toFixed(1)}%`;

function scopeName(scope: string) {
  if (scope === 'brand') return 'Brand';
  if (scope === 'location') return 'Location';
  return 'Organization';
}

function shouldSendPreference(preference: Record<string, unknown>, reportType: ReportType, dateKey: string, force: boolean) {
  if (reportType === 'daily') return Boolean(preference.daily_handoff);
  if (!preference.weekly_executive) return false;
  if (force) return true;
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 1;
}

function buildReportText({ preference, reportType, summary, dateKey }: {
  preference: Record<string, unknown>;
  reportType: ReportType;
  summary: Record<string, unknown>;
  dateKey: string;
}) {
  const kpis = summary?.kpis || {};
  const workflows = summary?.workflows || {};
  const alerts = Array.isArray(summary?.alerts) ? summary.alerts : [];
  const heading = reportType === 'daily' ? 'Daily Dashboard Handoff' : 'Weekly Executive Dashboard Report';

  return [
    `Restops 360 ${scopeName(String(preference.scope))} ${heading}`,
    `Date: ${dateKey}`,
    '',
    'Performance',
    `- Period sales: ${money(kpis.salesPeriod)}`,
    `- Week-to-date sales: ${money(kpis.salesWeekToDate)}`,
    `- Today sales: ${money(kpis.salesToday)}`,
    `- Gross margin: ${pct(100 - Number(kpis.cogsPercent || 0))}`,
    `- COGS: ${pct(kpis.cogsPercent)}`,
    `- Labor: ${pct(kpis.laborPercent)}`,
    `- Prime cost: ${pct(kpis.primeCostPercent)}`,
    '',
    'Workflow',
    `- Pending invoices: ${Number(kpis.pendingInvoices || workflows.pendingInvoices || 0)}`,
    `- Low stock items: ${Number(kpis.lowStockItems || workflows.lowStock || 0)}`,
    `- Open orders: ${Number(kpis.openOrders || workflows.openOrders || 0)}`,
    `- Unpaid AP: ${money(kpis.unpaidAmount)}`,
    '',
    'Alerts',
    ...(alerts.length ? alerts.slice(0, 5).map((item) => `- ${item.title}: ${item.body}`) : ['- No dashboard alerts in this run']),
  ].join('\n');
}

function filterRecipients({ profiles, preference }: {
  profiles: Array<Record<string, unknown>>;
  preference: Record<string, unknown>;
}) {
  const roles = Array.isArray(preference.recipient_roles) ? preference.recipient_roles : [];
  return profiles
    .filter((profile) => roles.includes(profile.role))
    .filter((profile) => {
      if (preference.scope === 'brand') {
        if (profile.role === 'org_owner') return true;
        return !profile.brand_id || !preference.brand_id || profile.brand_id === preference.brand_id;
      }
      if (preference.scope === 'location') {
        if (profile.role === 'org_owner') return true;
        if (profile.role === 'brand_manager' || profile.role === 'branch_manager') return !profile.brand_id || !preference.brand_id || profile.brand_id === preference.brand_id;
        if (profile.role === 'location_manager') return !profile.location_id || !preference.location_id || profile.location_id === preference.location_id;
        return false;
      }
      return true;
    });
}

async function startDelivery({ supabase, preference, reportType, dateKey, force }: {
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>;
  preference: Record<string, unknown>;
  reportType: ReportType;
  dateKey: string;
  force: boolean;
}) {
  const payload = {
    brand_id: preference.brand_id || null,
    location_id: preference.location_id || null,
    organization_id: preference.organization_id,
    preference_id: preference.id,
    recipient_roles: preference.recipient_roles || [],
    report_date: dateKey,
    report_type: reportType,
    scope: preference.scope,
    scope_key: preference.scope_key,
    status: 'processing',
  };

  if (force) {
    const { data, error } = await supabase
      .from('dashboard_report_deliveries')
      .upsert(payload, { onConflict: 'organization_id,scope,scope_key,report_type,report_date' })
      .select('id')
      .single();
    if (error) throw error;
    return { delivery: data, duplicate: false };
  }

  const { data, error } = await supabase
    .from('dashboard_report_deliveries')
    .insert(payload)
    .select('id')
    .single();
  if (error?.code === '23505') return { delivery: null, duplicate: true };
  if (error) throw error;
  return { delivery: data, duplicate: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const schedulerSecret = Deno.env.get('DASHBOARD_REPORT_SCHEDULER_SECRET');
    if (schedulerSecret && req.headers.get('x-scheduler-secret') !== schedulerSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized scheduler request' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dateKey = body.date || toDateKey();
    const force = Boolean(body.force);
    const requested = body.report_type || 'both';
    const reportTypes: ReportType[] = requested === 'daily' ? ['daily'] : requested === 'weekly' ? ['weekly'] : ['daily', 'weekly'];
    const { start, end } = monthBounds(dateKey);
    const supabase = getSupabaseServiceRoleClient();

    const { data: preferences, error: preferenceError } = await supabase
      .from('dashboard_report_preferences')
      .select('*');
    if (preferenceError) throw preferenceError;

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, organization_id, brand_id, location_id, status')
      .neq('status', 'inactive');
    if (profileError) throw profileError;

    const results = [];

    for (const preference of preferences || []) {
      for (const reportType of reportTypes) {
        if (!shouldSendPreference(preference, reportType, dateKey, force)) {
          results.push({ preference_id: preference.id, report_type: reportType, status: 'skipped_preferences' });
          continue;
        }

        const { delivery, duplicate } = await startDelivery({ supabase, preference, reportType, dateKey, force });
        if (duplicate) {
          results.push({ preference_id: preference.id, report_type: reportType, status: 'skipped_duplicate' });
          continue;
        }

        try {
          const { data: summary, error: summaryError } = await supabase.rpc('get_role_dashboard_summary', {
            p_brand_id: preference.scope === 'brand' ? preference.brand_id || null : null,
            p_location_id: preference.scope === 'location' || preference.scope === 'staff' ? preference.location_id || null : null,
            p_org_id: preference.organization_id,
            p_period_end: end,
            p_period_start: start,
            p_scope: preference.scope,
          });
          if (summaryError) throw summaryError;

          const reportText = buildReportText({ preference, reportType, summary: summary || {}, dateKey });
          const recipients = filterRecipients({
            preference,
            profiles: (profiles || []).filter((profile) => profile.organization_id === preference.organization_id),
          });

          if (!recipients.length) {
            await supabase.from('dashboard_report_deliveries').update({
              error_message: 'No matching recipients found',
              recipient_count: 0,
              report_snapshot: { summary, reportText },
              status: 'skipped',
            }).eq('id', delivery.id);
            results.push({ delivery_id: delivery.id, report_type: reportType, status: 'skipped_no_recipients' });
            continue;
          }

          const { data: notifications, error: notificationError } = await supabase
            .from('notifications')
            .insert(recipients.map((recipient) => ({
              is_read: false,
              message: reportText.slice(0, 950),
              organization_id: preference.organization_id,
              title: reportType === 'daily' ? 'Daily dashboard handoff ready' : 'Weekly executive dashboard report ready',
              type: 'system',
              user_id: recipient.id,
            })))
            .select('id');
          if (notificationError) throw notificationError;

          await supabase.from('dashboard_report_deliveries').update({
            error_message: null,
            notification_ids: (notifications || []).map((item) => item.id),
            recipient_count: recipients.length,
            report_snapshot: { summary, reportText },
            sent_at: new Date().toISOString(),
            status: 'sent',
          }).eq('id', delivery.id);

          const { error: auditError } = await supabase.from('audit_logs').insert({
            action: `dashboard_${reportType}_report_scheduler_sent`,
            details: JSON.stringify({ scope: preference.scope, scopeKey: preference.scope_key, recipients: recipients.length }),
            entity_id: delivery.id,
            entity_type: 'dashboard_report_delivery',
            module: 'system',
            org_id: preference.organization_id,
            table_name: 'dashboard_report_deliveries',
          });
          if (auditError) console.warn('Dashboard report audit insert failed:', auditError.message);

          results.push({ delivery_id: delivery.id, notified: recipients.length, report_type: reportType, status: 'sent' });
        } catch (error) {
          await supabase.from('dashboard_report_deliveries').update({
            error_message: error.message || String(error),
            status: 'failed',
          }).eq('id', delivery.id);
          results.push({ delivery_id: delivery.id, error: error.message || String(error), report_type: reportType, status: 'failed' });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, date: dateKey, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
