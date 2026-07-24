import React from 'react';
import { format } from 'date-fns';
import { BarChart3, BellRing, CalendarDays, CheckCircle2, Clock, Copy, Download, FileText, History, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabaseClient';
import { AUDIT_MODULES, logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notificationService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const DEFAULT_REPORT_PREFERENCES = {
  dailyHandoff: true,
  weeklyExecutive: true,
  includeForecasts: true,
  includeEscalations: true,
  recipientRoles: ['tenant_super_admin', 'org_manager', 'branch_manager', 'location_manager'],
};

const DEFAULT_DASHBOARD_RULES = {
  cogsPercent: 32,
  laborPercent: 28,
  primeCostPercent: 60,
  notifyCriticalActions: true,
  notifyCarryover: true,
  notifyHighActions: true,
  notifyPrimeCostBreach: true,
};

function normalizeReportPreferences(value = {}) {
  const recipientRoles = Array.isArray(value.recipientRoles)
    ? value.recipientRoles
    : Array.isArray(value.recipient_roles)
      ? value.recipient_roles
      : DEFAULT_REPORT_PREFERENCES.recipientRoles;
  return {
    dailyHandoff: Boolean(value.dailyHandoff ?? value.daily_handoff ?? DEFAULT_REPORT_PREFERENCES.dailyHandoff),
    weeklyExecutive: Boolean(value.weeklyExecutive ?? value.weekly_executive ?? DEFAULT_REPORT_PREFERENCES.weeklyExecutive),
    includeForecasts: Boolean(value.includeForecasts ?? value.include_forecasts ?? DEFAULT_REPORT_PREFERENCES.includeForecasts),
    includeEscalations: Boolean(value.includeEscalations ?? value.include_escalations ?? DEFAULT_REPORT_PREFERENCES.includeEscalations),
    recipientRoles: recipientRoles.length ? recipientRoles : DEFAULT_REPORT_PREFERENCES.recipientRoles,
  };
}

function normalizeDashboardRules(value = {}) {
  return {
    cogsPercent: Number(value.cogsPercent ?? value.cogs_percent ?? DEFAULT_DASHBOARD_RULES.cogsPercent),
    laborPercent: Number(value.laborPercent ?? value.labor_percent ?? DEFAULT_DASHBOARD_RULES.laborPercent),
    primeCostPercent: Number(value.primeCostPercent ?? value.prime_cost_percent ?? DEFAULT_DASHBOARD_RULES.primeCostPercent),
    notifyCriticalActions: Boolean(value.notifyCriticalActions ?? value.notify_critical_actions ?? DEFAULT_DASHBOARD_RULES.notifyCriticalActions),
    notifyCarryover: Boolean(value.notifyCarryover ?? value.notify_carryover ?? DEFAULT_DASHBOARD_RULES.notifyCarryover),
    notifyHighActions: Boolean(value.notifyHighActions ?? value.notify_high_actions ?? DEFAULT_DASHBOARD_RULES.notifyHighActions),
    notifyPrimeCostBreach: Boolean(value.notifyPrimeCostBreach ?? value.notify_prime_cost_breach ?? DEFAULT_DASHBOARD_RULES.notifyPrimeCostBreach),
  };
}

function getScopeContext(scope, { organization, brand, location }) {
  const orgId = organization?.id || null;
  const brandId = scope === 'brand' ? (brand?.brand_id || brand?.id) || null : scope === 'location' ? (brand?.brand_id || brand?.id) || location?.brand_id || null : null;
  const locationId = scope === 'location' ? location?.id || null : null;
  return {
    orgId,
    brandId,
    locationId,
    scopeKey: scope === 'brand' ? `brand:${brandId || 'none'}` : scope === 'location' ? `location:${locationId || 'none'}` : `org:${orgId || 'none'}`,
  };
}

function reportPreferencesPayload(preferences) {
  const normalized = normalizeReportPreferences(preferences);
  return {
    daily_handoff: normalized.dailyHandoff,
    weekly_executive: normalized.weeklyExecutive,
    include_forecasts: normalized.includeForecasts,
    include_escalations: normalized.includeEscalations,
    recipient_roles: normalized.recipientRoles,
  };
}

function dashboardRulesPayload(rules) {
  const normalized = normalizeDashboardRules(rules);
  return {
    cogs_percent: normalized.cogsPercent,
    labor_percent: normalized.laborPercent,
    prime_cost_percent: normalized.primeCostPercent,
    notify_carryover: normalized.notifyCarryover,
    notify_critical_actions: normalized.notifyCriticalActions,
    notify_high_actions: normalized.notifyHighActions,
    notify_prime_cost_breach: normalized.notifyPrimeCostBreach,
  };
}

function reportTypeLabel(type) {
  return type === 'weekly' ? 'Weekly executive' : 'Daily handoff';
}

function statusClass(status) {
  return {
    failed: 'bg-resend-red/10 text-resend-red',
    processing: 'bg-resend-blue/10 text-resend-blue',
    sent: 'bg-resend-green/10 text-resend-green',
    skipped: 'bg-resend-yellow/10 text-resend-yellow',
  }[status] || 'bg-secondary text-muted-foreground';
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  try { return format(new Date(value), 'MMM d, yyyy h:mm a'); } catch { return 'Recently'; }
}

function getReportText(delivery) {
  const snapshot = delivery?.report_snapshot || {};
  if (typeof snapshot.reportText === 'string' && snapshot.reportText.trim()) return snapshot.reportText;
  return [
    `Restops 360 ${reportTypeLabel(delivery?.report_type)} Report`,
    `Date: ${delivery?.report_date || 'Not recorded'}`,
    '',
    delivery?.error_message ? `Error: ${delivery.error_message}` : 'No report snapshot was stored for this delivery.',
  ].join('\n');
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function VisualReportShell({ title, description, children, action, className }) {
  return (
    <Card className={cn('dashboard-visual-card border-border/70 shadow-sm', className)} string="progress">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function DashboardReports() {
  const { organization, brand, location, userProfile } = useAuth();
  const { isTenantSuperAdmin, isOrgManager, isBranchManager, isLocationManager, isPlatformAdmin } = usePermissions();
  const scope = isBranchManager ? 'brand' : isLocationManager ? 'location' : 'org';
  const scopeContext = React.useMemo(() => getScopeContext(scope, { organization, brand, location }), [brand, location, organization, scope]);
  const canManage = isPlatformAdmin || isTenantSuperAdmin || isOrgManager || isBranchManager || isLocationManager;
  const [saving, setSaving] = React.useState(null);
  const [resendingId, setResendingId] = React.useState(null);
  const [generatingReports, setGeneratingReports] = React.useState(false);

  const { data: remotePreferences = null, refetch: refetchPreferences } = useAuthQuery({
    queryKey: ['dashboard-report-module-preferences', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_report_preferences')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .maybeSingle();
      if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error;
      return data || null;
    },
    enabled: !!scopeContext.orgId,
    throwOnError: false,
  });

  const { data: remoteRules = null, refetch: refetchRules } = useAuthQuery({
    queryKey: ['dashboard-report-module-rules', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_escalation_rules')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .maybeSingle();
      if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error;
      return data || null;
    },
    enabled: !!scopeContext.orgId,
    throwOnError: false,
  });

  const { data: deliveries = [], refetch: refetchDeliveries, isLoading: isLoadingDeliveries } = useAuthQuery({
    queryKey: ['dashboard-report-module-deliveries', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_report_deliveries')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12);
      if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error;
      return data || [];
    },
    enabled: !!scopeContext.orgId,
    throwOnError: false,
  });

  const preferences = React.useMemo(() => normalizeReportPreferences(remotePreferences || {}), [remotePreferences]);
  const rules = React.useMemo(() => normalizeDashboardRules(remoteRules || {}), [remoteRules]);
  const latestDelivery = deliveries[0];
  const sentCount = deliveries.filter((delivery) => delivery.status === 'sent').length;
  const failedCount = deliveries.filter((delivery) => delivery.status === 'failed').length;
  const readinessScore = Math.round(([
    preferences.dailyHandoff || preferences.weeklyExecutive,
    preferences.recipientRoles.length > 0,
    rules.primeCostPercent > 0,
    latestDelivery?.status === 'sent',
  ].filter(Boolean).length / 4) * 100);

  const savePreferences = async (nextPreferences) => {
    if (!canManage || !scopeContext.orgId) return;
    setSaving('preferences');
    try {
      const normalized = normalizeReportPreferences(nextPreferences);
      const { error } = await supabase.from('dashboard_report_preferences').upsert({
        brand_id: scopeContext.brandId,
        location_id: scopeContext.locationId,
        organization_id: scopeContext.orgId,
        scope,
        scope_key: scopeContext.scopeKey,
        updated_by: userProfile?.id || null,
        ...reportPreferencesPayload(normalized),
      }, { onConflict: 'organization_id,scope,scope_key' });
      if (error) throw error;
      await logAudit({
        action: 'dashboard_report_preferences_updated',
        entityId: `${scopeContext.scopeKey}:report-preferences`,
        entityType: 'dashboard_report_preferences',
        module: AUDIT_MODULES.SYSTEM,
        orgId: scopeContext.orgId,
        brandId: scopeContext.brandId,
        locationId: scopeContext.locationId,
        userId: userProfile?.id,
        details: { scope, preferences: normalized },
      });
      toast.success('Report preferences saved');
      refetchPreferences();
    } catch (error) {
      toast.error(error.message || 'Failed to save report preferences');
    } finally {
      setSaving(null);
    }
  };

  const saveRules = async (nextRules) => {
    if (!canManage || !scopeContext.orgId) return;
    setSaving('rules');
    try {
      const normalized = normalizeDashboardRules(nextRules);
      const { error } = await supabase.from('dashboard_escalation_rules').upsert({
        brand_id: scopeContext.brandId,
        location_id: scopeContext.locationId,
        organization_id: scopeContext.orgId,
        scope,
        scope_key: scopeContext.scopeKey,
        updated_by: userProfile?.id || null,
        ...dashboardRulesPayload(normalized),
      }, { onConflict: 'organization_id,scope,scope_key' });
      if (error) throw error;
      toast.success('Report guardrails saved');
      refetchRules();
    } catch (error) {
      toast.error(error.message || 'Failed to save report guardrails');
    } finally {
      setSaving(null);
    }
  };

  const togglePreference = (key) => savePreferences({ ...preferences, [key]: !preferences[key] });
  const updateRule = (key, value) => saveRules({ ...rules, [key]: Number(value) });

  React.useEffect(() => {
    if (!scopeContext.orgId) return undefined;
    const channel = supabase.channel(`dashboard-reports-module-${scope}-${scopeContext.scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_report_preferences', filter: `organization_id=eq.${scopeContext.orgId}` }, () => refetchPreferences())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_escalation_rules', filter: `organization_id=eq.${scopeContext.orgId}` }, () => refetchRules())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_report_deliveries', filter: `organization_id=eq.${scopeContext.orgId}` }, () => refetchDeliveries())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [refetchDeliveries, refetchPreferences, refetchRules, scope, scopeContext.orgId, scopeContext.scopeKey]);

  const copyDelivery = async (delivery) => {
    try {
      await navigator.clipboard.writeText(getReportText(delivery));
      toast.success('Report snapshot copied');
    } catch {
      toast.error('Could not copy report snapshot');
    }
  };

  const downloadDelivery = (delivery) => {
    downloadTextFile(getReportText(delivery), `restops-${delivery.report_type || 'dashboard'}-report-${delivery.report_date || 'snapshot'}.txt`);
    toast.success('Report snapshot downloaded');
  };

  const resendDelivery = async (delivery) => {
    if (!canManage || !scopeContext.orgId) return;
    setResendingId(delivery.id);
    try {
      const normalized = normalizeReportPreferences({
        ...preferences,
        recipientRoles: Array.isArray(delivery.recipient_roles) && delivery.recipient_roles.length
          ? delivery.recipient_roles
          : preferences.recipientRoles,
      });
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, role, organization_id, brand_id, location_id, status')
        .eq('organization_id', scopeContext.orgId)
        .in('role', normalized.recipientRoles)
        .neq('status', 'inactive');
      if (error) throw error;

      const targets = (profiles || []).filter((profile) => {
        if (scope === 'brand') {
          if (['org_manager', 'tenant_super_admin'].includes(profile.role)) return true;
          return !profile.brand_id || !scopeContext.brandId || profile.brand_id === scopeContext.brandId;
        }
        if (scope === 'location') {
          if (['org_manager', 'tenant_super_admin'].includes(profile.role)) return true;
          if (profile.role === 'branch_manager') return !profile.brand_id || !scopeContext.brandId || profile.brand_id === scopeContext.brandId;
          if (profile.role === 'location_manager') return !profile.location_id || !scopeContext.locationId || profile.location_id === scopeContext.locationId;
          return false;
        }
        return true;
      });

      const reportText = getReportText(delivery);
      const results = await Promise.all(targets.map((profile) => createNotification({
        organization_id: scopeContext.orgId,
        user_id: profile.id,
        title: delivery.report_type === 'weekly' ? 'Weekly executive dashboard report ready' : 'Daily dashboard handoff ready',
        message: reportText.slice(0, 950),
        type: 'system',
        metadata: {
          dashboard_scope: scope,
          report_delivery_id: delivery.id,
          report_type: delivery.report_type || 'daily',
          source: 'dashboard_report_resend',
        },
      })));
      const notified = results.filter((result) => result?.success && !result?.skipped).length;
      await logAudit({
        action: 'dashboard_report_delivery_resent',
        entityId: delivery.id,
        entityType: 'dashboard_report_delivery',
        module: AUDIT_MODULES.SYSTEM,
        orgId: scopeContext.orgId,
        brandId: scopeContext.brandId,
        locationId: scopeContext.locationId,
        userId: userProfile?.id,
        details: { scope, reportType: delivery.report_type, reportDate: delivery.report_date, notified },
      });
      toast.success(notified ? `Resent to ${notified} recipient${notified > 1 ? 's' : ''}` : 'No matching recipients found');
    } catch (error) {
      toast.error(error.message || 'Failed to resend report');
    } finally {
      setResendingId(null);
    }
  };

  const generateReportsNow = async () => {
    if (!canManage || !scopeContext.orgId) return;
    setGeneratingReports(true);
    try {
      const { data, error } = await supabase.functions.invoke('schedule-reports', {
        body: { force: true, report_type: 'both' },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Dashboard report scheduler failed');
      toast.success('Dashboard reports generated');
      await refetchDeliveries();
    } catch (error) {
      toast.error(error.message || 'Failed to generate dashboard reports');
    } finally {
      setGeneratingReports(false);
    }
  };

  return (
    <div className="dashboard-visual-page space-y-6 p-4 md:p-8" string="progress">
      <section className="dashboard-visual-hero overflow-hidden rounded-2xl border border-border/70 p-6 md:p-8" string="progress">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-4 bg-brand text-primary-foreground">Dashboard Reports</Badge>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-foreground md:text-5xl">Reports live here now.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Scheduling, delivery history, readiness checks, and guardrail rules are separated from the daily cockpit so Dashboard stays fast and glanceable.</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-3 gap-3">
            <div className="rounded-xl bg-background/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-foreground">{readinessScore}%</p>
              <p className="text-[11px] uppercase text-muted-foreground">Ready</p>
            </div>
            <div className="rounded-xl bg-background/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-resend-green">{sentCount}</p>
              <p className="text-[11px] uppercase text-muted-foreground">Sent</p>
            </div>
            <div className="rounded-xl bg-background/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-resend-red">{failedCount}</p>
              <p className="text-[11px] uppercase text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <VisualReportShell title="Readiness" description="Signals needed for reliable scheduled reporting." className="xl:col-span-1">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Report system</span>
              <Badge className={readinessScore >= 75 ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-yellow/10 text-resend-yellow'}>{readinessScore}%</Badge>
            </div>
            <Progress value={readinessScore} className="h-2" />
            {[
              { label: 'At least one schedule enabled', ok: preferences.dailyHandoff || preferences.weeklyExecutive },
              { label: 'Recipient roles selected', ok: preferences.recipientRoles.length > 0 },
              { label: 'Guardrails configured', ok: rules.primeCostPercent > 0 },
              { label: 'Successful delivery recorded', ok: latestDelivery?.status === 'sent' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                {item.ok ? <CheckCircle2 className="h-4 w-4 text-resend-green" /> : <Clock className="h-4 w-4 text-resend-yellow" />}
              </div>
            ))}
          </div>
        </VisualReportShell>

        <VisualReportShell title="Schedules" description="Turn report cadences and content blocks on or off." className="xl:col-span-2" action={!canManage && <Badge variant="secondary">Read only</Badge>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { key: 'dailyHandoff', label: 'Daily handoff', icon: CalendarDays, helper: 'Open work, risks, and action status.' },
              { key: 'weeklyExecutive', label: 'Weekly executive', icon: BarChart3, helper: 'Owner scorecard and trend summary.' },
              { key: 'includeForecasts', label: 'Forecast block', icon: BellRing, helper: 'Sales, prime cost, and inventory projections.' },
              { key: 'includeEscalations', label: 'Escalations block', icon: ShieldCheck, helper: 'Unresolved critical and high-priority work.' },
            ].map((item) => (
              <button key={item.key} type="button" disabled={!canManage || saving === 'preferences'} onClick={() => togglePreference(item.key)} className={cn('dashboard-signal-tile text-left transition', preferences[item.key] ? 'border-brand/50 bg-brand/10' : 'border-border/60 bg-secondary/30')}>
                <div className="flex items-start justify-between gap-3">
                  <item.icon className="h-5 w-5 text-brand" />
                  <Badge variant={preferences[item.key] ? 'default' : 'secondary'}>{preferences[item.key] ? 'On' : 'Off'}</Badge>
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
              </button>
            ))}
          </div>
        </VisualReportShell>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <VisualReportShell title="Report Guardrails" description="Targets used by report warnings and escalation summaries." action={saving === 'rules' && <Badge variant="secondary">Saving</Badge>}>
          <div className="space-y-4">
            {[
              { key: 'cogsPercent', label: 'COGS target' },
              { key: 'laborPercent', label: 'Labor target' },
              { key: 'primeCostPercent', label: 'Prime cost target' },
            ].map((rule) => (
              <label key={rule.key} className="grid grid-cols-[1fr_96px] items-center gap-3 rounded-lg bg-secondary/40 p-3">
                <span className="text-sm font-medium text-foreground">{rule.label}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={rules[rule.key]}
                  onChange={(event) => updateRule(rule.key, event.target.value)}
                  disabled={!canManage || saving === 'rules'}
                  className="h-10 rounded-md border border-border bg-background px-3 text-right text-sm font-semibold text-foreground"
                />
              </label>
            ))}
          </div>
        </VisualReportShell>

        <VisualReportShell
          title="Delivery History"
          description="Recent automated report runs and stored snapshots."
          action={(
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={generateReportsNow} disabled={!canManage || generatingReports}>
                <BellRing className="h-4 w-4" />
                {generatingReports ? 'Generating' : 'Generate now'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => refetchDeliveries()}>
                <History className="mr-2 h-4 w-4" />Refresh
              </Button>
            </div>
          )}
        >
          {isLoadingDeliveries ? (
            <div className="rounded-lg bg-secondary/30 p-4 text-sm text-muted-foreground">Loading deliveries...</div>
          ) : deliveries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">No deliveries yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Generate a report now to create the first saved snapshot for copy, export, and resend.</p>
              <Button className="mt-4 gap-2" onClick={generateReportsNow} disabled={!canManage || generatingReports}>
                <BellRing className="h-4 w-4" />
                {generatingReports ? 'Generating reports' : 'Generate reports now'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.slice(0, 6).map((delivery) => (
                <div key={delivery.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusClass(delivery.status)}>{delivery.status}</Badge>
                      <p className="text-sm font-semibold text-foreground">{reportTypeLabel(delivery.report_type)}</p>
                      <Badge variant="secondary">{delivery.report_date}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(delivery.sent_at || delivery.updated_at || delivery.created_at)} - {delivery.recipient_count || 0} recipients - {(delivery.notification_ids || []).length} notifications
                    </p>
                    {delivery.error_message && <p className="mt-1 text-xs text-resend-red">{delivery.error_message}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => copyDelivery(delivery)}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadDelivery(delivery)}>
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => resendDelivery(delivery)} disabled={!canManage || resendingId === delivery.id}>
                      <RotateCcw className="h-4 w-4" />
                      {resendingId === delivery.id ? 'Resending' : 'Resend'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </VisualReportShell>
      </div>
    </div>
  );
}
