import React, { useEffect } from 'react';
import { BellRing, Circle, Copy, Download, History, Save } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabaseClient';
import { AUDIT_MODULES, logAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notificationService';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function currency(value) {
  const numeric = Number(value || 0);
  const formatted = Math.abs(numeric).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(Number(value || 0)) < 1000 ? 2 : 0,
    maximumFractionDigits: Math.abs(Number(value || 0)) < 1000 ? 2 : 0,
  });
  return `${numeric < 0 ? '-' : ''}$${formatted}`;
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return '0%';
  return `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
}

function plainPercent(value) {
  if (!Number.isFinite(Number(value))) return '0.0%';
  return `${Number(value).toFixed(1)}%`;
}

function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function actionId(title = '') {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function SectionCard({ title, description, action, children, className }) {
  return (
    <Card className={cn('border-border/70 shadow-sm', className)}>
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

function EmptyState({ icon: Icon = History, title, description }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-secondary/20 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function normalizeReportPreferences(value = {}) {
  const recipientRoles = Array.isArray(value.recipientRoles)
    ? value.recipientRoles
    : Array.isArray(value.recipient_roles)
      ? value.recipient_roles
      : ['org_owner', 'brand_manager', 'branch_manager', 'location_manager'];
  return {
    dailyHandoff: Boolean(value.dailyHandoff ?? value.daily_handoff ?? true),
    weeklyExecutive: Boolean(value.weeklyExecutive ?? value.weekly_executive ?? true),
    includeForecasts: Boolean(value.includeForecasts ?? value.include_forecasts ?? true),
    includeEscalations: Boolean(value.includeEscalations ?? value.include_escalations ?? true),
    recipientRoles: recipientRoles.length ? recipientRoles : ['org_owner', 'brand_manager', 'branch_manager', 'location_manager'],
  };
}

function formatSyncTime(value) {
  if (!value) return 'Not synced yet';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
    }).format(new Date(value));
  } catch {
    return 'Recently';
  }
}

function createHandoffText({ metrics, scope, actions, statusMap, dataHealthScore, note }) {
  const completed = actions.filter((item) => statusMap[actionId(item.title)] === 'done');
  const open = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const scopeName = scope === 'brand' ? 'Brand Manager' : scope === 'location' ? 'Location Manager' : 'Org Owner';

  return [
    `${scopeName} Daily Handoff`,
    `Date: ${todayKey()}`,
    '',
    `Sales: ${scope === 'location' ? currency(metrics.today) + ' today' : currency(metrics.monthSales) + ' period'} | ${currency(metrics.weekSales)} WTD`,
    `Prime Cost: ${plainPercent(metrics.primeCostPercent)} | COGS: ${plainPercent(metrics.cogsPercent)} | Labor: ${plainPercent(metrics.laborPercent)}`,
    `Data Health: ${dataHealthScore}%`,
    `Open AP: ${currency(metrics.unpaid)} | Low Stock: ${metrics.lowStock.length} | Pending Invoices: ${metrics.pendingInvoices.length}`,
    '',
    `Completed Actions (${completed.length})`,
    ...(completed.length ? completed.map((item) => `- ${item.title}`) : ['- None yet']),
    '',
    `Open Actions (${open.length})`,
    ...(open.length ? open.map((item) => `- [${item.priority}] ${item.title} (${item.owner}, ${item.due})`) : ['- None']),
    '',
    'Manager Note',
    note?.trim() || 'No note added.',
  ].join('\n');
}

function createExecutiveReportText({ metrics, scope, actions, statusMap, dataHealthScore, escalations, rules }) {
  const completed = actions.filter((item) => statusMap[actionId(item.title)] === 'done');
  const open = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const scopeName = scope === 'brand' ? 'Brand' : scope === 'location' ? 'Location' : 'Organization';
  const forecast = metrics.forecast || {};

  return [
    `Restops 360 ${scopeName} Executive Report`,
    `Date: ${todayKey()}`,
    '',
    'Performance',
    `- Period sales: ${currency(metrics.monthSales)}`,
    `- Week-to-date sales: ${currency(metrics.weekSales)} (${percent(metrics.weekVsLastWeek)} vs last week)`,
    `- Gross margin: ${plainPercent(metrics.grossMarginPercent)}`,
    `- COGS: ${plainPercent(metrics.cogsPercent)} / Target ${plainPercent(rules.cogsPercent)}`,
    `- Labor: ${plainPercent(metrics.laborPercent)} / Target ${plainPercent(rules.laborPercent)}`,
    `- Prime cost: ${plainPercent(metrics.primeCostPercent)} / Target ${plainPercent(rules.primeCostPercent)}`,
    '',
    'Forecast',
    `- Week sales forecast: ${currency(forecast.projectedWeekSales)}`,
    `- Month sales forecast: ${currency(forecast.projectedMonthSales)}`,
    `- Prime cost forecast: ${plainPercent(forecast.projectedPrimeCostPercent)}`,
    `- Forecast method: ${forecast.method || 'Current pace'}`,
    `- Sales trend: ${percent(forecast.trendPercent || 0)}`,
    `- Volatility: ${plainPercent(forecast.volatilityPercent || 0)}`,
    `- Inventory risk count: ${forecast.inventoryRiskCount || 0}`,
    `- Forecast confidence: ${forecast.confidence || 'Low'}`,
    '',
    'Workflow',
    `- Data health: ${dataHealthScore}%`,
    `- Unpaid AP: ${currency(metrics.unpaid)}`,
    `- Pending invoices: ${metrics.pendingInvoices.length}`,
    `- Low stock items: ${metrics.lowStock.length}`,
    `- Completed actions: ${completed.length}/${actions.length}`,
    `- Open actions: ${open.length}`,
    `- Escalations: ${escalations.length}`,
    '',
    'Top Actions',
    ...(open.length ? open.slice(0, 5).map((item) => `- [${item.priority}] ${item.title} (${item.owner}, ${item.due})`) : ['- No open actions']),
  ].join('\n');
}

async function sendDashboardReportNotifications({ brand, location, organization, preferences, reportText, reportType, scope }) {
  if (!organization?.id) return { notified: 0 };
  const normalized = normalizeReportPreferences(preferences);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, organization_id, brand_id, location_id, status')
    .eq('organization_id', organization.id)
    .in('role', normalized.recipientRoles)
    .neq('status', 'inactive');
  if (error) throw error;

  const targets = (data || []).filter((profile) => {
    if (scope === 'brand') return !profile.brand_id || !brand?.id || profile.brand_id === brand.id || profile.role === 'org_owner';
    if (scope === 'location') {
      if (profile.role === 'org_owner') return true;
      if (profile.role === 'brand_manager' || profile.role === 'branch_manager') return !profile.brand_id || !brand?.id || profile.brand_id === brand.id;
      if (profile.role === 'location_manager') return !profile.location_id || !location?.id || profile.location_id === location.id;
      return false;
    }
    return true;
  });

  const notificationResults = await Promise.all(targets.map((profile) => createNotification({
    organization_id: organization.id,
    user_id: profile.id,
    title: reportType === 'daily' ? 'Daily dashboard handoff ready' : 'Weekly executive dashboard report ready',
    message: reportText.slice(0, 950),
    type: 'system',
    metadata: {
      dashboard_scope: scope,
      report_type: reportType,
      source: 'dashboard_scheduled_report',
    },
  })));

  return { notified: notificationResults.filter((result) => result?.success).length };
}

export function ExecutiveReportPanel({ actions, dataHealthScore, escalations, metrics, organization, rules, scope, statusMap = {}, userProfile }) {
  const reportText = React.useMemo(
    () => createExecutiveReportText({ actions, dataHealthScore, escalations, metrics, rules, scope, statusMap }),
    [actions, dataHealthScore, escalations, metrics, rules, scope, statusMap]
  );
  const forecast = metrics.forecast || {};
  const openActions = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const executiveRows = [
    { label: 'Sales Forecast', value: currency(forecast.projectedMonthSales), helper: `${forecast.confidence || 'Low'} confidence` },
    { label: 'Prime Forecast', value: plainPercent(forecast.projectedPrimeCostPercent), helper: `Target ${plainPercent(rules.primeCostPercent)}` },
    { label: 'Open Actions', value: openActions.length, helper: `${escalations.length} escalations` },
    { label: 'Data Health', value: `${dataHealthScore}%`, helper: `${metrics.pendingInvoices.length} pending invoices` },
  ];

  const auditReport = (action) => {
    logAudit({
      action,
      entityId: `${scope}:${todayKey()}:executive-report`,
      entityType: 'dashboard_executive_report',
      module: AUDIT_MODULES.SYSTEM,
      orgId: organization?.id,
      userId: userProfile?.id,
      details: { scope, escalations: escalations.length, openActions: openActions.length },
    });
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      auditReport('dashboard_executive_report_copied');
      toast.success('Executive report copied');
    } catch {
      toast.error('Could not copy executive report');
    }
  };

  const downloadReport = () => {
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restops-executive-report-${scope}-${todayKey()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    auditReport('dashboard_executive_report_downloaded');
    toast.success('Executive report downloaded');
  };

  return (
    <SectionCard
      title="Executive Report"
      description="Owner-ready scorecard with performance, forecast, workflow, and unresolved action summary."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={copyReport}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadReport}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {executiveRows.map((row) => (
          <div key={row.label} className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</p>
            <p className="mt-2 text-xl font-bold text-foreground">{row.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ScheduledReportsPanel({
  actions,
  brand,
  canManage = true,
  dataHealthScore,
  escalations,
  location,
  metrics,
  onSavePreferences,
  organization,
  preferences,
  rules,
  scope,
  statusMap = {},
  userProfile,
}) {
  const [draft, setDraft] = React.useState(() => normalizeReportPreferences(preferences));
  const [sending, setSending] = React.useState(null);

  useEffect(() => {
    setDraft(normalizeReportPreferences(preferences));
  }, [preferences]);

  const roleOptions = [
    { value: 'org_owner', label: 'Org owners' },
    { value: 'brand_manager', label: 'Brand managers' },
    { value: 'branch_manager', label: 'Branch managers' },
    { value: 'location_manager', label: 'Location managers' },
  ];

  const updateToggle = (key) => {
    setDraft((current) => ({ ...current, [key]: !current[key] }));
  };

  const updateRole = (role) => {
    setDraft((current) => {
      const roles = new Set(current.recipientRoles || []);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      return { ...current, recipientRoles: Array.from(roles) };
    });
  };

  const save = () => {
    if (!canManage) return;
    onSavePreferences?.(normalizeReportPreferences(draft));
  };

  const sendNow = async (reportType) => {
    if (!canManage) return;
    const normalized = normalizeReportPreferences(draft);
    const reportText = reportType === 'daily'
      ? createHandoffText({ actions, dataHealthScore, metrics, note: '', scope, statusMap })
      : createExecutiveReportText({ actions, dataHealthScore, escalations, metrics, rules, scope, statusMap });
    setSending(reportType);
    try {
      const result = await sendDashboardReportNotifications({
        brand,
        location,
        organization,
        preferences: normalized,
        reportText,
        reportType,
        scope,
      });
      logAudit({
        action: reportType === 'daily' ? 'dashboard_daily_report_sent' : 'dashboard_weekly_report_sent',
        entityId: `${scope}:${todayKey()}:${reportType}-report`,
        entityType: 'dashboard_scheduled_report',
        module: AUDIT_MODULES.SYSTEM,
        orgId: organization?.id,
        userId: userProfile?.id,
        details: { scope, notified: result.notified, recipientRoles: normalized.recipientRoles },
      });
      toast.success(result.notified ? `Sent to ${result.notified} recipient${result.notified > 1 ? 's' : ''}` : 'No matching recipients found');
    } catch (error) {
      toast.error(error.message || 'Failed to send report');
    } finally {
      setSending(null);
    }
  };

  const preferenceCards = [
    { key: 'dailyHandoff', label: 'Daily handoff', helper: 'Manager report for open work, risks, and action status.' },
    { key: 'weeklyExecutive', label: 'Weekly executive', helper: 'Owner scorecard with performance, forecast, and escalation summary.' },
    { key: 'includeForecasts', label: 'Include forecasts', helper: 'Adds sales, prime cost, and inventory risk projections.' },
    { key: 'includeEscalations', label: 'Include escalations', helper: 'Adds open escalation count and unresolved blocker context.' },
  ];

  return (
    <SectionCard
      title="Scheduled Reports"
      description="Report automation preferences for daily handoffs and weekly executive summaries."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          {!canManage && <Badge variant="secondary">Read-only</Badge>}
          <Button size="sm" className="gap-2" onClick={save} disabled={!canManage}>
            <Save className="h-4 w-4" />
            Save Schedule
          </Button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {preferenceCards.map((item) => (
            <label key={item.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
              <span>
                <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.helper}</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(draft[item.key])}
                onChange={() => updateToggle(item.key)}
                disabled={!canManage}
                className="mt-1 h-4 w-4 accent-brand"
              />
            </label>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipients</p>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {roleOptions.map((role) => (
                <label key={role.value} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{role.label}</span>
                  <input
                    type="checkbox"
                    checked={(draft.recipientRoles || []).includes(role.value)}
                    onChange={() => updateRole(role.value)}
                    disabled={!canManage}
                    className="h-4 w-4 accent-brand"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => sendNow('daily')} disabled={!canManage || sending === 'daily'}>
              <BellRing className="h-4 w-4" />
              {sending === 'daily' ? 'Sending' : 'Send Daily Now'}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => sendNow('weekly')} disabled={!canManage || sending === 'weekly'}>
              <BellRing className="h-4 w-4" />
              {sending === 'weekly' ? 'Sending' : 'Send Weekly Now'}
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function reportStatusClass(status) {
  return {
    failed: 'bg-resend-red/10 text-resend-red',
    processing: 'bg-resend-blue/10 text-resend-blue',
    sent: 'bg-resend-green/10 text-resend-green',
    skipped: 'bg-resend-yellow/10 text-resend-yellow',
  }[status] || 'bg-secondary text-muted-foreground';
}

function reportTypeLabel(type) {
  return type === 'weekly' ? 'Weekly executive' : 'Daily handoff';
}

export function DashboardReportHistoryPanel({
  brand,
  canManage = true,
  deliveries = [],
  isLoading,
  location,
  onRefresh,
  organization,
  preferences,
  scope,
  userProfile,
}) {
  const [resendingId, setResendingId] = React.useState(null);
  const visibleDeliveries = deliveries.slice(0, 8);

  const reportTextForDelivery = (delivery) => delivery.reportSnapshot?.reportText || [
    `Restops 360 ${reportTypeLabel(delivery.reportType)}`,
    `Date: ${delivery.reportDate}`,
    '',
    delivery.errorMessage ? `Error: ${delivery.errorMessage}` : 'No report snapshot was stored for this delivery.',
  ].join('\n');

  const copyDelivery = async (delivery) => {
    try {
      await navigator.clipboard.writeText(reportTextForDelivery(delivery));
      toast.success('Report snapshot copied');
    } catch {
      toast.error('Could not copy report snapshot');
    }
  };

  const downloadDelivery = (delivery) => {
    const blob = new Blob([reportTextForDelivery(delivery)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restops-${delivery.reportType}-report-${delivery.reportDate}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report snapshot downloaded');
  };

  const resendDelivery = async (delivery) => {
    if (!canManage) return;
    const reportText = reportTextForDelivery(delivery);
    setResendingId(delivery.id);
    try {
      const result = await sendDashboardReportNotifications({
        brand,
        location,
        organization,
        preferences,
        reportText,
        reportType: delivery.reportType,
        scope,
      });
      logAudit({
        action: 'dashboard_report_delivery_resent',
        entityId: delivery.id,
        entityType: 'dashboard_report_delivery',
        module: AUDIT_MODULES.SYSTEM,
        orgId: organization?.id,
        userId: userProfile?.id,
        details: { reportType: delivery.reportType, reportDate: delivery.reportDate, notified: result.notified },
      });
      toast.success(result.notified ? `Resent to ${result.notified} recipient${result.notified > 1 ? 's' : ''}` : 'No matching recipients found');
      onRefresh?.();
    } catch (error) {
      toast.error(error.message || 'Failed to resend report');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <SectionCard
      title="Report Delivery Log"
      description="Recent scheduled dashboard report runs, delivery status, recipients, and stored snapshots."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          {!canManage && <Badge variant="secondary">Read-only</Badge>}
          <Button variant="ghost" size="sm" className="gap-2" onClick={onRefresh}>
            <History className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      )}
    >
      {isLoading && (
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4 text-sm text-muted-foreground">
          Loading report deliveries...
        </div>
      )}
      {!isLoading && !visibleDeliveries.length && (
        <EmptyState
          icon={History}
          title="No report deliveries yet"
          description="Scheduled report runs will appear here after the Phase 16 scheduler and SQL are deployed."
        />
      )}
      {!!visibleDeliveries.length && (
        <div className="space-y-3">
          {visibleDeliveries.map((delivery) => (
            <div key={delivery.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-secondary/30 p-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={reportStatusClass(delivery.status)}>{delivery.status}</Badge>
                  <p className="text-sm font-semibold text-foreground">{reportTypeLabel(delivery.reportType)}</p>
                  <span className="text-xs text-muted-foreground">{delivery.reportDate}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{delivery.recipientCount} recipient{delivery.recipientCount === 1 ? '' : 's'}</span>
                  <span>{delivery.notificationIds.length} notification{delivery.notificationIds.length === 1 ? '' : 's'}</span>
                  <span>Updated {formatSyncTime(delivery.sentAt || delivery.updatedAt || delivery.createdAt)}</span>
                </div>
                {!!delivery.errorMessage && (
                  <p className="mt-2 text-xs text-resend-red">{delivery.errorMessage}</p>
                )}
                {!!delivery.recipientRoles.length && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {delivery.recipientRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[11px] capitalize">{role.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => copyDelivery(delivery)}>
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadDelivery(delivery)}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => resendDelivery(delivery)} disabled={!canManage || resendingId === delivery.id}>
                  <BellRing className="h-4 w-4" />
                  {resendingId === delivery.id ? 'Resending' : 'Resend'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function DashboardProductionReadinessPanel({
  canManageSettings,
  dataCoverageSources = [],
  dataHealthScore,
  metrics,
  reportDeliveries = [],
  reportPreferences,
  rules,
  syncState,
}) {
  const connectedSources = dataCoverageSources.filter((source) => source.count > 0).length;
  const latestDelivery = reportDeliveries[0];
  const enabledReports = [
    reportPreferences?.dailyHandoff ? 'Daily' : null,
    reportPreferences?.weeklyExecutive ? 'Weekly' : null,
  ].filter(Boolean);
  const forecastConfidence = metrics?.forecast?.confidence || 'Low';
  const schedulerStatus = latestDelivery
    ? `${latestDelivery.status || 'recorded'} ${reportTypeLabel(latestDelivery.reportType).toLowerCase()}`
    : 'No delivery runs';
  const readinessItems = [
    {
      label: 'Data Sources',
      value: `${connectedSources}/${dataCoverageSources.length || 0}`,
      helper: `${dataHealthScore}% data health across accessible modules`,
      tone: connectedSources === dataCoverageSources.length && connectedSources > 0 ? 'green' : 'yellow',
    },
    {
      label: 'Persistence',
      value: syncState?.mode === 'synced' ? 'Synced' : 'Local',
      helper: syncState?.message || 'Dashboard state fallback is active',
      tone: syncState?.mode === 'synced' ? 'green' : 'yellow',
    },
    {
      label: 'Report Scheduler',
      value: enabledReports.length ? enabledReports.join(' + ') : 'Disabled',
      helper: schedulerStatus,
      tone: latestDelivery?.status === 'sent' ? 'green' : latestDelivery?.status === 'failed' ? 'red' : 'yellow',
    },
    {
      label: 'Forecast Model',
      value: forecastConfidence,
      helper: `${metrics?.forecast?.activeSalesDays || 0} active sales days in the model`,
      tone: forecastConfidence === 'High' ? 'green' : forecastConfidence === 'Medium' ? 'yellow' : 'orange',
    },
    {
      label: 'Operating Rules',
      value: `${plainPercent(rules?.primeCostPercent)} prime`,
      helper: `${plainPercent(rules?.cogsPercent)} COGS, ${plainPercent(rules?.laborPercent)} labor targets`,
      tone: 'blue',
    },
    {
      label: 'Manager Controls',
      value: canManageSettings ? 'Enabled' : 'Read-only',
      helper: canManageSettings ? 'This role can change rules and schedules' : 'This role can review without changing controls',
      tone: canManageSettings ? 'green' : 'yellow',
    },
  ];

  const toneClasses = {
    blue: 'bg-resend-blue/10 text-resend-blue',
    green: 'bg-resend-green/10 text-resend-green',
    orange: 'bg-resend-orange/10 text-resend-orange',
    red: 'bg-resend-red/10 text-resend-red',
    yellow: 'bg-resend-yellow/10 text-resend-yellow',
  };

  return (
    <SectionCard title="Production Readiness" description="Final operating checks for role-based dashboard rollout.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        {readinessItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <Circle className={cn('h-3 w-3 fill-current', toneClasses[item.tone] || 'text-muted-foreground')} />
            </div>
            <p className="mt-2 text-lg font-bold text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
