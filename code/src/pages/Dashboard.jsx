import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, startOfWeek, subWeeks, subYears, isSameDay, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Circle,
  BellRing,
  Copy,
  CreditCard,
  Download,
  DollarSign,
  FileText,
  History,
  ListFilter,
  Package,
  RotateCcw,
  Save,
  Shield,
  ShoppingCart,
  Target,
  TrendingUp,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { AUDIT_MODULES, logAudit } from '@/lib/audit';
import { createNotification, notifyManagers } from '@/lib/notificationService';
import { createPageUrl } from '@/utils';
import { filterByContext } from '@/lib/contextUtils';
import { getModuleForPage, isPageInEnabledModules } from '@/lib/moduleConfig';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import BudgetProgressWidget from '@/components/dashboard/BudgetProgressWidget';

const COLORS = ['#0d9488', '#0891b2', '#6366f1', '#f59e0b', '#ef4444', '#84cc16'];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_DASHBOARD_RULES = {
  cogsPercent: 32,
  laborPercent: 28,
  primeCostPercent: 60,
  notifyCriticalActions: true,
  notifyCarryover: true,
  notifyHighActions: true,
  notifyPrimeCostBreach: true,
};
const DEFAULT_REPORT_PREFERENCES = {
  dailyHandoff: true,
  weeklyExecutive: true,
  includeForecasts: true,
  includeEscalations: true,
  recipientRoles: ['org_owner', 'brand_manager', 'branch_manager', 'location_manager'],
};

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

function targetDelta(actual, target) {
  return Number(actual || 0) - Number(target || 0);
}

function mergeRecommendations(primary, secondary) {
  const seen = new Set();
  return [...primary, ...secondary].filter((item) => {
    if (!item?.title || seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function pageKeyFromHref(href = '') {
  return href.split('?')[0];
}

function createCanAccessPage({ organization, userProfile, hasMinRole, isPlatformAdmin }) {
  return (pageName) => {
    if (!pageName) return true;
    if (isPlatformAdmin) return true;

    const explicit = userProfile?.permissions?.[pageName];
    if (explicit === 'none') return false;
    if (explicit === 'read' || explicit === 'full') return true;

    const moduleInfo = getModuleForPage(pageName);
    const roleAllowed = !moduleInfo || hasMinRole(moduleInfo.minRole);
    return roleAllowed && isPageInEnabledModules(pageName, organization?.enabled_modules, userProfile?.role);
  };
}

function canManageDashboardOperations({ scope, userProfile, isPlatformAdmin }) {
  if (isPlatformAdmin) return true;
  const role = userProfile?.role;
  if (scope === 'org') return role === 'org_owner';
  if (scope === 'brand') return ['org_owner', 'brand_manager', 'branch_manager'].includes(role);
  if (scope === 'location') return ['org_owner', 'brand_manager', 'branch_manager', 'location_manager'].includes(role);
  return false;
}

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

function actionId(title = '') {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getDataCoverageSources(metrics, data, canAccessPage = () => true) {
  const workflowCounts = metrics.workflowCounts || {};
  return [
    { label: 'POS Sales', page: 'Performance', count: metrics.monthSales > 0 ? 1 : 0, status: metrics.monthSales > 0 ? 'Connected' : 'Needs setup' },
    { label: 'Invoices/AP', page: 'Invoices', count: workflowCounts.invoices ?? data.invoices.length, status: (workflowCounts.invoices ?? data.invoices.length) > 0 ? 'Flowing' : 'No records' },
    { label: 'Inventory', page: 'Inventory', count: workflowCounts.inventoryItems ?? data.inventory.length, status: (workflowCounts.inventoryItems ?? data.inventory.length) > 0 ? 'Flowing' : 'No records' },
    { label: 'Labor', page: 'Labor', count: metrics.laborCost > 0 ? 1 : 0, status: metrics.laborCost > 0 ? 'Flowing' : 'No shifts' },
    { label: 'Budget Targets', page: 'Performance', count: metrics.budgetPacing.filter((item) => item.target > 0).length, status: metrics.budgetPacing.some((item) => item.target > 0) ? 'Configured' : 'Needs targets' },
  ].filter((source) => canAccessPage(source.page));
}

function getDataHealthScore(metrics, data, canAccessPage = () => true) {
  const sources = getDataCoverageSources(metrics, data, canAccessPage);
  if (!sources.length) return 0;
  const connected = sources.filter((source) => source.count > 0).length;
  return Math.round((connected / sources.length) * 100);
}

function getDashboardScopeContext(scope, { organization, brand, location }) {
  const orgId = organization?.id || null;
  const brandId = scope === 'brand' ? brand?.id || null : scope === 'location' || scope === 'staff' ? brand?.id || location?.brand_id || null : null;
  const locationId = scope === 'location' || scope === 'staff' ? location?.id || null : null;
  return {
    brandId,
    locationId,
    orgId,
    scopeKey: scope === 'brand' ? `brand:${brandId || 'none'}` : scope === 'location' || scope === 'staff' ? `location:${locationId || 'none'}` : `org:${orgId || 'none'}`,
  };
}

function useLocalJson(storageKey, fallbackValue) {
  const fallbackRef = React.useRef(fallbackValue);
  const [value, setValue] = React.useState(fallbackValue);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setValue(stored ? JSON.parse(stored) : fallbackRef.current);
    } catch {
      setValue(fallbackRef.current);
    }
  }, [storageKey]);

  React.useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [storageKey, value]);

  return [value, setValue];
}

function useLocalStatusMap(storageKey) {
  return useLocalJson(storageKey, {});
}

function isMissingDashboardTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /dashboard_.*not found|does not exist/i.test(error?.message || '');
}

function normalizeDashboardRules(value = {}) {
  return {
    ...DEFAULT_DASHBOARD_RULES,
    cogsPercent: Number(value.cogsPercent ?? value.cogs_percent ?? DEFAULT_DASHBOARD_RULES.cogsPercent),
    laborPercent: Number(value.laborPercent ?? value.labor_percent ?? DEFAULT_DASHBOARD_RULES.laborPercent),
    primeCostPercent: Number(value.primeCostPercent ?? value.prime_cost_percent ?? DEFAULT_DASHBOARD_RULES.primeCostPercent),
    notifyCriticalActions: Boolean(value.notifyCriticalActions ?? value.notify_critical_actions ?? DEFAULT_DASHBOARD_RULES.notifyCriticalActions),
    notifyCarryover: Boolean(value.notifyCarryover ?? value.notify_carryover ?? DEFAULT_DASHBOARD_RULES.notifyCarryover),
    notifyHighActions: Boolean(value.notifyHighActions ?? value.notify_high_actions ?? DEFAULT_DASHBOARD_RULES.notifyHighActions),
    notifyPrimeCostBreach: Boolean(value.notifyPrimeCostBreach ?? value.notify_prime_cost_breach ?? DEFAULT_DASHBOARD_RULES.notifyPrimeCostBreach),
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

function normalizeReportPreferences(value = {}) {
  const recipientRoles = Array.isArray(value.recipientRoles)
    ? value.recipientRoles
    : Array.isArray(value.recipient_roles)
      ? value.recipient_roles
      : DEFAULT_REPORT_PREFERENCES.recipientRoles;
  return {
    ...DEFAULT_REPORT_PREFERENCES,
    dailyHandoff: Boolean(value.dailyHandoff ?? value.daily_handoff ?? DEFAULT_REPORT_PREFERENCES.dailyHandoff),
    weeklyExecutive: Boolean(value.weeklyExecutive ?? value.weekly_executive ?? DEFAULT_REPORT_PREFERENCES.weeklyExecutive),
    includeForecasts: Boolean(value.includeForecasts ?? value.include_forecasts ?? DEFAULT_REPORT_PREFERENCES.includeForecasts),
    includeEscalations: Boolean(value.includeEscalations ?? value.include_escalations ?? DEFAULT_REPORT_PREFERENCES.includeEscalations),
    recipientRoles: recipientRoles.length ? recipientRoles : DEFAULT_REPORT_PREFERENCES.recipientRoles,
  };
}

function reportPreferencesPayload(preferences) {
  const normalized = normalizeReportPreferences(preferences);
  return {
    daily_handoff: normalized.dailyHandoff,
    include_escalations: normalized.includeEscalations,
    include_forecasts: normalized.includeForecasts,
    recipient_roles: normalized.recipientRoles,
    weekly_executive: normalized.weeklyExecutive,
  };
}

function useDashboardRules({ brand, location, organization, scope, userProfile }) {
  const queryClient = useQueryClient();
  const scopeContext = React.useMemo(
    () => getDashboardScopeContext(scope, { organization, brand, location }),
    [brand, location, organization, scope]
  );
  const storageKey = `dashboard-rules:${scope}:${scopeContext.scopeKey}`;
  const [rules, setRules] = useLocalJson(storageKey, DEFAULT_DASHBOARD_RULES);
  const orgReady = !!scopeContext.orgId && !!organization?.id;

  const { data: remoteRules = null } = useAuthQuery({
    queryKey: ['dashboard-escalation-rules', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_escalation_rules')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .maybeSingle();
      if (isMissingDashboardTable(error)) return null;
      if (error) throw error;
      return data;
    },
    enabled: orgReady,
    retry: false,
  });

  useEffect(() => {
    if (remoteRules) setRules(normalizeDashboardRules(remoteRules));
  }, [remoteRules, setRules]);

  useEffect(() => {
    if (!orgReady) return undefined;
    const channel = supabase.channel(`dashboard-rules-${scope}-${scopeContext.scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_escalation_rules', filter: `organization_id=eq.${scopeContext.orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-escalation-rules'] });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [orgReady, queryClient, scope, scopeContext.orgId, scopeContext.scopeKey]);

  const saveRules = React.useCallback(async (nextRules) => {
    const normalized = normalizeDashboardRules(nextRules);
    setRules(normalized);
    if (!orgReady) {
      toast.success('Dashboard rules saved locally');
      return;
    }

    try {
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
      logAudit({
        action: 'dashboard_rules_updated',
        entityId: `${scopeContext.scopeKey}:rules`,
        entityType: 'dashboard_escalation_rules',
        module: AUDIT_MODULES.SYSTEM,
        orgId: scopeContext.orgId,
        userId: userProfile?.id,
        details: { scope, rules: normalized },
      });
      toast.success('Dashboard rules synced');
    } catch (error) {
      if (isMissingDashboardTable(error)) {
        toast.success('Dashboard rules saved locally until Supabase rules table is applied');
        return;
      }
      toast.error(error.message || 'Failed to save dashboard rules');
    }
  }, [orgReady, scope, scopeContext.brandId, scopeContext.locationId, scopeContext.orgId, scopeContext.scopeKey, setRules, userProfile?.id]);

  const normalizedRules = React.useMemo(() => normalizeDashboardRules(rules), [rules]);

  return { rules: normalizedRules, saveRules };
}

function useDashboardReportPreferences({ brand, location, organization, scope, userProfile }) {
  const queryClient = useQueryClient();
  const scopeContext = React.useMemo(
    () => getDashboardScopeContext(scope, { organization, brand, location }),
    [brand, location, organization, scope]
  );
  const storageKey = `dashboard-report-preferences:${scope}:${scopeContext.scopeKey}`;
  const [preferences, setPreferences] = useLocalJson(storageKey, DEFAULT_REPORT_PREFERENCES);
  const orgReady = !!scopeContext.orgId && !!organization?.id;

  const { data: remotePreferences = null } = useAuthQuery({
    queryKey: ['dashboard-report-preferences', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_report_preferences')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .maybeSingle();
      if (isMissingDashboardTable(error)) return null;
      if (error) throw error;
      return data;
    },
    enabled: orgReady,
    retry: false,
  });

  useEffect(() => {
    if (remotePreferences) setPreferences(normalizeReportPreferences(remotePreferences));
  }, [remotePreferences, setPreferences]);

  useEffect(() => {
    if (!orgReady) return undefined;
    const channel = supabase.channel(`dashboard-report-preferences-${scope}-${scopeContext.scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_report_preferences', filter: `organization_id=eq.${scopeContext.orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-report-preferences'] });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [orgReady, queryClient, scope, scopeContext.orgId, scopeContext.scopeKey]);

  const savePreferences = React.useCallback(async (nextPreferences) => {
    const normalized = normalizeReportPreferences(nextPreferences);
    setPreferences(normalized);
    if (!orgReady) {
      toast.success('Report preferences saved locally');
      return;
    }

    try {
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
      logAudit({
        action: 'dashboard_report_preferences_updated',
        entityId: `${scopeContext.scopeKey}:report-preferences`,
        entityType: 'dashboard_report_preferences',
        module: AUDIT_MODULES.SYSTEM,
        orgId: scopeContext.orgId,
        userId: userProfile?.id,
        details: { scope, preferences: normalized },
      });
      toast.success('Report preferences synced');
    } catch (error) {
      if (isMissingDashboardTable(error)) {
        toast.success('Report preferences saved locally until Supabase table is applied');
        return;
      }
      toast.error(error.message || 'Failed to save report preferences');
    }
  }, [orgReady, scope, scopeContext.brandId, scopeContext.locationId, scopeContext.orgId, scopeContext.scopeKey, setPreferences, userProfile?.id]);

  return {
    preferences: React.useMemo(() => normalizeReportPreferences(preferences), [preferences]),
    savePreferences,
  };
}

function normalizeReportDelivery(row = {}) {
  return {
    id: row.id,
    brandId: row.brand_id || null,
    createdAt: row.created_at,
    errorMessage: row.error_message || '',
    locationId: row.location_id || null,
    notificationIds: Array.isArray(row.notification_ids) ? row.notification_ids : [],
    recipientCount: Number(row.recipient_count || 0),
    recipientRoles: Array.isArray(row.recipient_roles) ? row.recipient_roles : [],
    reportDate: row.report_date,
    reportSnapshot: row.report_snapshot || {},
    reportType: row.report_type || 'daily',
    scope: row.scope,
    scopeKey: row.scope_key,
    sentAt: row.sent_at,
    status: row.status || 'processing',
    updatedAt: row.updated_at,
  };
}

function useDashboardReportDeliveries({ brand, location, organization, scope }) {
  const queryClient = useQueryClient();
  const scopeContext = React.useMemo(
    () => getDashboardScopeContext(scope, { organization, brand, location }),
    [brand, location, organization, scope]
  );
  const orgReady = !!scopeContext.orgId && !!organization?.id;

  const { data: deliveries = [], isLoading } = useAuthQuery({
    queryKey: ['dashboard-report-deliveries', scopeContext.orgId, scope, scopeContext.scopeKey],
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
      if (isMissingDashboardTable(error)) return [];
      if (error) throw error;
      return (data || []).map(normalizeReportDelivery);
    },
    enabled: orgReady,
    retry: false,
  });

  useEffect(() => {
    if (!orgReady) return undefined;
    const channel = supabase.channel(`dashboard-report-deliveries-${scope}-${scopeContext.scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_report_deliveries', filter: `organization_id=eq.${scopeContext.orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-report-deliveries'] });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [orgReady, queryClient, scope, scopeContext.orgId, scopeContext.scopeKey]);

  return {
    deliveries,
    isLoading,
    refreshDeliveries: () => queryClient.invalidateQueries({ queryKey: ['dashboard-report-deliveries'] }),
  };
}

function useDashboardPersistence({ actions, brand, dataHealthScore, location, metrics, organization, scope, userProfile }) {
  const queryClient = useQueryClient();
  const scopeContext = React.useMemo(
    () => getDashboardScopeContext(scope, { organization, brand, location }),
    [brand, location, organization, scope]
  );
  const actionDate = todayKey();
  const actionStorageKey = `dashboard-actions:${scope}:${actionDate}:${scopeContext.scopeKey}`;
  const noteStorageKey = `dashboard-handoff-note:${scope}:${actionDate}:${scopeContext.scopeKey}`;
  const reviewStorageKey = `dashboard-review-log:${scope}:${scopeContext.scopeKey}`;
  const [statusMap, setStatusMap] = useLocalStatusMap(actionStorageKey);
  const [note, setNote] = useLocalJson(noteStorageKey, '');
  const [reviews, setReviews] = useLocalJson(reviewStorageKey, []);
  const [syncState, setSyncState] = React.useState({ mode: 'local', message: 'Saved locally', updatedAt: null });
  const orgReady = !!scopeContext.orgId && !!organization?.id;
  const markSynced = React.useCallback((message = 'Synced') => {
    setSyncState({ mode: 'synced', message, updatedAt: new Date().toISOString() });
  }, []);
  const markLocal = React.useCallback(() => {
    setSyncState({ mode: 'local', message: 'Saved locally until Supabase tables are applied', updatedAt: null });
  }, []);

  const { data: remoteActionRows = [] } = useAuthQuery({
    queryKey: ['dashboard-action-status', scopeContext.orgId, scope, scopeContext.scopeKey, actionDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_action_status')
        .select('action_key, status, updated_at, completed_at, completed_by')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .eq('action_date', actionDate);
      if (isMissingDashboardTable(error)) {
        markLocal();
        return [];
      }
      if (error) throw error;
      markSynced();
      return data || [];
    },
    enabled: orgReady,
    retry: false,
  });

  const { data: remoteNote = null } = useAuthQuery({
    queryKey: ['dashboard-handoff-note', scopeContext.orgId, scope, scopeContext.scopeKey, actionDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_handoff_notes')
        .select('note, updated_at, updated_by')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .eq('note_date', actionDate)
        .maybeSingle();
      if (isMissingDashboardTable(error)) {
        markLocal();
        return null;
      }
      if (error) throw error;
      markSynced();
      return data;
    },
    enabled: orgReady,
    retry: false,
  });

  const { data: remoteReviews = [] } = useAuthQuery({
    queryKey: ['dashboard-review-logs', scopeContext.orgId, scope, scopeContext.scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_review_logs')
        .select('*')
        .eq('organization_id', scopeContext.orgId)
        .eq('scope', scope)
        .eq('scope_key', scopeContext.scopeKey)
        .order('review_date', { ascending: false })
        .limit(7);
      if (isMissingDashboardTable(error)) {
        markLocal();
        return [];
      }
      if (error) throw error;
      markSynced();
      return data || [];
    },
    enabled: orgReady,
    retry: false,
  });

  useEffect(() => {
    if (!remoteActionRows.length) return;
    setStatusMap(Object.fromEntries(remoteActionRows.map((row) => [row.action_key, row.status])));
  }, [remoteActionRows, setStatusMap]);

  useEffect(() => {
    if (!orgReady) return undefined;
    const invalidatePersistence = () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-action-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-handoff-note'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-review-logs'] });
      setSyncState({ mode: 'synced', message: 'Updated just now', updatedAt: new Date().toISOString() });
    };
    const channel = supabase.channel(`dashboard-persistence-${scope}-${scopeContext.scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_action_status', filter: `organization_id=eq.${scopeContext.orgId}` }, invalidatePersistence)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_handoff_notes', filter: `organization_id=eq.${scopeContext.orgId}` }, invalidatePersistence)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_review_logs', filter: `organization_id=eq.${scopeContext.orgId}` }, invalidatePersistence)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncState((current) => ({ ...current, mode: current.mode === 'local' ? 'local' : 'synced', message: current.mode === 'local' ? current.message : 'Realtime synced' }));
      });

    return () => supabase.removeChannel(channel);
  }, [orgReady, queryClient, scope, scopeContext.orgId, scopeContext.scopeKey]);

  useEffect(() => {
    if (remoteNote?.note !== undefined) setNote(remoteNote.note || '');
  }, [remoteNote, setNote]);

  useEffect(() => {
    if (!remoteReviews.length) return;
    setReviews(remoteReviews.map((review) => ({
      id: review.id,
      date: review.review_date,
      savedAt: review.updated_at || review.created_at,
      completedCount: Number(review.completed_count || 0),
      totalCount: Number(review.total_count || 0),
      dataHealthScore: Number(review.data_health_score || 0),
      weekSales: Number(review.week_sales || 0),
      primeCostPercent: Number(review.prime_cost_percent || 0),
      unpaid: Number(review.unpaid_amount || 0),
      lowStockCount: Number(review.low_stock_count || 0),
      pendingInvoiceCount: Number(review.pending_invoice_count || 0),
      openActions: Array.isArray(review.open_actions) ? review.open_actions : [],
      note: review.note || '',
    })));
  }, [remoteReviews, setReviews]);

  const basePayload = React.useCallback(() => ({
    brand_id: scopeContext.brandId,
    location_id: scopeContext.locationId,
    organization_id: scopeContext.orgId,
    scope,
    scope_key: scopeContext.scopeKey,
  }), [scope, scopeContext.brandId, scopeContext.locationId, scopeContext.orgId, scopeContext.scopeKey]);

  const persistActionStatus = React.useCallback(async (title, status) => {
    if (!orgReady) return;
    const key = actionId(title);
    try {
      const { error } = await supabase.from('dashboard_action_status').upsert({
        ...basePayload(),
        action_date: actionDate,
        action_key: key,
        action_title: title,
        completed_at: status === 'done' ? new Date().toISOString() : null,
        completed_by: status === 'done' ? userProfile?.id || null : null,
        status,
      }, { onConflict: 'organization_id,scope,scope_key,action_date,action_key' });
      if (error) throw error;
      markSynced('Action synced');
      logAudit({
        action: status === 'done' ? 'dashboard_action_completed' : 'dashboard_action_reopened',
        entityId: key,
        entityType: 'dashboard_action_status',
        module: AUDIT_MODULES.SYSTEM,
        orgId: scopeContext.orgId,
        userId: userProfile?.id,
        details: { scope, scopeKey: scopeContext.scopeKey, title },
      });
    } catch (error) {
      if (isMissingDashboardTable(error)) markLocal();
      console.warn('[dashboard] Failed to persist action status:', error.message || error);
    }
  }, [actionDate, basePayload, isMissingDashboardTable, markLocal, markSynced, orgReady, scope, scopeContext.orgId, scopeContext.scopeKey, userProfile?.id]);

  const resetActions = React.useCallback(async () => {
    setStatusMap({});
    if (!orgReady || !actions.length) return;
    await Promise.all(actions.map((item) => persistActionStatus(item.title, 'open')));
  }, [actions, orgReady, persistActionStatus, setStatusMap]);

  useEffect(() => {
    if (!orgReady) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const { error } = await supabase.from('dashboard_handoff_notes').upsert({
          ...basePayload(),
          note,
          note_date: actionDate,
        }, { onConflict: 'organization_id,scope,scope_key,note_date' });
        if (error) throw error;
        markSynced('Handoff note synced');
      } catch (error) {
        if (isMissingDashboardTable(error)) markLocal();
        console.warn('[dashboard] Failed to persist handoff note:', error.message || error);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [actionDate, basePayload, isMissingDashboardTable, markLocal, markSynced, note, orgReady]);

  const saveReview = React.useCallback(async () => {
    const completed = actions.filter((item) => statusMap[actionId(item.title)] === 'done');
    const open = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
    const snapshot = {
      id: `${scope}-${Date.now()}`,
      date: actionDate,
      savedAt: new Date().toISOString(),
      completedCount: completed.length,
      totalCount: actions.length,
      dataHealthScore,
      weekSales: metrics.weekSales,
      primeCostPercent: metrics.primeCostPercent,
      unpaid: metrics.unpaid,
      lowStockCount: metrics.lowStock.length,
      pendingInvoiceCount: metrics.pendingInvoices.length,
      openActions: open.map((item) => ({ title: item.title, priority: item.priority, owner: item.owner, due: item.due })),
      note: note.trim(),
    };

    setReviews((current) => [snapshot, ...current.filter((review) => review.date !== actionDate)].slice(0, 7));
    if (orgReady) {
      try {
        const { error } = await supabase.from('dashboard_review_logs').upsert({
          ...basePayload(),
          completed_count: snapshot.completedCount,
          data_health_score: snapshot.dataHealthScore,
          low_stock_count: snapshot.lowStockCount,
          note: snapshot.note,
          open_actions: snapshot.openActions,
          pending_invoice_count: snapshot.pendingInvoiceCount,
          prime_cost_percent: snapshot.primeCostPercent,
          review_date: actionDate,
          saved_by: userProfile?.id || null,
          total_count: snapshot.totalCount,
          unpaid_amount: snapshot.unpaid,
          week_sales: snapshot.weekSales,
        }, { onConflict: 'organization_id,scope,scope_key,review_date' });
        if (error) throw error;
        markSynced('Review synced');
        logAudit({
          action: 'dashboard_review_saved',
          entityId: `${scopeContext.scopeKey}:${actionDate}`,
          entityType: 'dashboard_review_log',
          module: AUDIT_MODULES.SYSTEM,
          orgId: scopeContext.orgId,
          userId: userProfile?.id,
          details: { scope, completed: snapshot.completedCount, open: snapshot.openActions.length },
        });
      } catch (error) {
        if (isMissingDashboardTable(error)) markLocal();
        console.warn('[dashboard] Failed to persist review log:', error.message || error);
      }
    }
    toast.success('Manager review saved');
  }, [actionDate, actions, basePayload, dataHealthScore, isMissingDashboardTable, markLocal, markSynced, metrics.lowStock.length, metrics.pendingInvoices.length, metrics.primeCostPercent, metrics.unpaid, metrics.weekSales, note, orgReady, scope, scopeContext.orgId, scopeContext.scopeKey, setReviews, statusMap, userProfile?.id]);

  const clearReviews = React.useCallback(async () => {
    setReviews([]);
    if (orgReady) {
      try {
        const { error } = await supabase
          .from('dashboard_review_logs')
          .delete()
          .eq('organization_id', scopeContext.orgId)
          .eq('scope', scope)
          .eq('scope_key', scopeContext.scopeKey);
        if (error) throw error;
        markSynced('Reviews cleared');
        logAudit({
          action: 'dashboard_reviews_cleared',
          entityType: 'dashboard_review_log',
          module: AUDIT_MODULES.SYSTEM,
          orgId: scopeContext.orgId,
          userId: userProfile?.id,
          details: { scope, scopeKey: scopeContext.scopeKey },
        });
      } catch (error) {
        if (isMissingDashboardTable(error)) markLocal();
        console.warn('[dashboard] Failed to clear review logs:', error.message || error);
      }
    }
    toast.success('Review log cleared');
  }, [isMissingDashboardTable, markLocal, markSynced, orgReady, scope, scopeContext.orgId, scopeContext.scopeKey, setReviews, userProfile?.id]);

  const auditHandoffExport = React.useCallback((action) => {
    logAudit({
      action,
      entityId: `${scopeContext.scopeKey}:${actionDate}`,
      entityType: 'dashboard_handoff_note',
      module: AUDIT_MODULES.SYSTEM,
      orgId: scopeContext.orgId,
      userId: userProfile?.id,
      details: { scope, scopeKey: scopeContext.scopeKey },
    });
  }, [actionDate, scope, scopeContext.orgId, scopeContext.scopeKey, userProfile?.id]);

  return {
    auditHandoffExport,
    clearReviews,
    note,
    persistActionStatus,
    resetActions,
    reviews,
    saveReview,
    setNote,
    setReviews,
    setStatusMap,
    syncState,
    statusMap,
  };
}

function getDate(record, candidates = ['sale_date', 'invoice_date', 'created_at', 'date']) {
  const raw = candidates.map((key) => record?.[key]).find(Boolean);
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function sumBy(items, reader) {
  return items.reduce((sum, item) => sum + Number(reader(item) || 0), 0);
}

function variance(current, comparison) {
  if (!comparison) return 0;
  return ((Number(current || 0) - Number(comparison || 0)) / Number(comparison)) * 100;
}

function getMonthProgress(date = new Date()) {
  const elapsed = Math.max(date.getDate(), 1);
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return { elapsed, total, ratio: elapsed / total };
}

function getWeekProgress(date = new Date()) {
  const day = date.getDay();
  const elapsed = day === 0 ? 7 : day;
  return { elapsed, total: 7, ratio: elapsed / 7 };
}

function forecastValue(actual, progressRatio) {
  if (!actual || !progressRatio) return 0;
  return Number(actual || 0) / Math.max(progressRatio, 0.05);
}

function forecastConfidence({ dataHealthScore, salesCount }) {
  if (dataHealthScore >= 75 && salesCount >= 14) return 'High';
  if (dataHealthScore >= 45 && salesCount >= 5) return 'Medium';
  return 'Low';
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  if (!usable.length) return 0;
  return sumBy(usable, (value) => value) / usable.length;
}

function standardDeviation(values) {
  const mean = average(values);
  if (!mean || values.length < 2) return 0;
  const varianceValue = average(values.map((value) => (Number(value || 0) - mean) ** 2));
  return Math.sqrt(varianceValue);
}

function dateKeyFromDate(date) {
  return format(date, 'yyyy-MM-dd');
}

function buildSalesHistoryForecast({ now, salesData, salesInRange, monthSales, weekSales, monthProgress, weekProgress, dataHealthScore }) {
  const dailySales = salesData.reduce((acc, sale) => {
    const date = getDate(sale);
    if (!date) return acc;
    const key = dateKeyFromDate(date);
    acc[key] = (acc[key] || 0) + Number(sale.revenue || 0);
    return acc;
  }, {});
  const dailyValues = Object.values(dailySales).map(Number).filter((value) => value > 0);
  const recent28Start = addDays(now, -27);
  const recent7Start = addDays(now, -6);
  const previous7Start = addDays(now, -13);
  const previous7End = addDays(now, -7);
  const recent28Sales = salesInRange(recent28Start, now);
  const recent7Sales = salesInRange(recent7Start, now);
  const previous7Sales = salesInRange(previous7Start, previous7End);
  const recent28Days = Object.keys(dailySales).filter((key) => {
    const date = new Date(`${key}T00:00:00`);
    return date >= recent28Start && date <= now;
  }).length;
  const weekday = now.getDay();
  const sameWeekdayValues = Object.entries(dailySales)
    .map(([key, value]) => ({ date: new Date(`${key}T00:00:00`), value: Number(value || 0) }))
    .filter((item) => item.date < now && item.date.getDay() === weekday)
    .slice(-8)
    .map((item) => item.value);
  const avgDaily28 = recent28Days ? recent28Sales / recent28Days : average(dailyValues);
  const avgDaily7 = recent7Sales / 7;
  const previousDaily7 = previous7Sales / 7;
  const sameWeekdayAverage = average(sameWeekdayValues) || avgDaily28;
  const weightedDailyRunRate = (avgDaily28 * 0.45) + (avgDaily7 * 0.35) + (sameWeekdayAverage * 0.2);
  const remainingMonthDays = Math.max(monthProgress.total - monthProgress.elapsed, 0);
  const remainingWeekDays = Math.max(weekProgress.total - weekProgress.elapsed, 0);
  const volatilityPercent = avgDaily28 ? (standardDeviation(dailyValues.slice(-28)) / avgDaily28) * 100 : 0;

  return {
    activeSalesDays: recent28Days,
    confidence: forecastConfidence({ dataHealthScore, salesCount: recent28Days }),
    method: recent28Days >= 7 ? 'Weighted history' : 'Current pace',
    projectedMonthSales: recent28Days >= 3 ? monthSales + (remainingMonthDays * weightedDailyRunRate) : forecastValue(monthSales, monthProgress.ratio),
    projectedWeekSales: recent28Days >= 3 ? weekSales + (remainingWeekDays * weightedDailyRunRate) : forecastValue(weekSales, weekProgress.ratio),
    sameWeekdayAverage,
    seasonalIndex: avgDaily28 ? sameWeekdayAverage / avgDaily28 : 1,
    trendPercent: variance(avgDaily7, previousDaily7),
    volatilityPercent,
    weightedDailyRunRate,
  };
}

function getInvoiceAmount(invoice) {
  return Number(invoice?.total_amount || invoice?.amount || invoice?.total || 0);
}

function getLineItems(invoice) {
  if (Array.isArray(invoice?.line_items)) return invoice.line_items;
  return [];
}

function getLineAmount(line) {
  return Number(line?.extended_price || line?.total_price || line?.amount || line?.price || 0);
}

function StatCard({ label, value, icon: Icon, tone = 'brand', linkTo, linkText, subtext }) {
  const toneClass = {
    brand: 'bg-brand/10 text-brand',
    green: 'bg-resend-green/10 text-resend-green',
    orange: 'bg-resend-orange/10 text-resend-orange',
    red: 'bg-resend-red/10 text-resend-red',
    yellow: 'bg-resend-yellow/10 text-resend-yellow',
    blue: 'bg-resend-blue/10 text-resend-blue',
    purple: 'bg-purple-500/10 text-purple-400',
  }[tone] || 'bg-brand/10 text-brand';

  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {subtext && <div className="mt-3 text-xs text-muted-foreground">{subtext}</div>}
        {linkTo && (
          <Link to={createPageUrl(linkTo)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:opacity-80">
            {linkText || 'Open'} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
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

function EmptyState({ icon: Icon = AlertTriangle, title, description, actionHref, actionLabel }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-secondary/20 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      {actionHref && actionLabel && (
        <Link to={createPageUrl(actionHref)} className="mt-3 text-xs font-semibold text-brand hover:opacity-80">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

function formatSyncTime(value) {
  if (!value) return 'Not synced yet';
  try {
    return format(new Date(value), 'MMM d, h:mm a');
  } catch {
    return 'Recently';
  }
}

function SyncStatusBadge({ syncState }) {
  const mode = syncState?.mode || 'local';
  const isSynced = mode === 'synced';
  return (
    <Badge className={isSynced ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-yellow/10 text-resend-yellow'}>
      {isSynced ? 'Synced' : 'Local'}
    </Badge>
  );
}

function CollaborationStatusPanel({ syncState }) {
  return (
    <SectionCard title="Collaboration Status" description="Realtime dashboard persistence and multi-manager sync state.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sync Mode</p>
          <div className="mt-2 flex items-center gap-2">
            <SyncStatusBadge syncState={syncState} />
            <span className="text-sm font-semibold text-foreground">{syncState?.message || 'Saved locally'}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Update</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{formatSyncTime(syncState?.updatedAt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Updates refresh automatically when Supabase realtime is active.</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared Work</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{syncState?.mode === 'synced' ? 'Cross-device ready' : 'Waiting for Phase 9 SQL'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Action status, notes, and reviews use the same persistence scope.</p>
        </div>
      </div>
    </SectionCard>
  );
}

function useDashboardData(scope) {
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!organization?.id;
  const now = new Date();
  const periodStart = startOfMonth(now).toISOString().split('T')[0];
  const periodEnd = endOfMonth(now).toISOString().split('T')[0];
  const dashboardSummaryEnabled = enabled && (
    scope === 'org'
    || (scope === 'brand' && !!brand?.id)
    || ((scope === 'location' || scope === 'staff') && !!location?.id)
  );
  const context = React.useMemo(() => {
    if (scope === 'org') return { organization, brand: null, location: null };
    if (scope === 'brand') return { organization, brand, location: null };
    return { organization, brand, location };
  }, [brand, location, organization, scope]);

  const selectByScope = React.useCallback((data) => {
    const scoped = filterByContext(data || [], context);
    if (scope === 'org') return scoped;
    if (scope === 'brand') return brand?.id ? scoped.filter((item) => !item.brand_id || item.brand_id === brand.id) : scoped;
    if (scope === 'location' || scope === 'staff') {
      return location?.id ? scoped.filter((item) => !item.location_id || item.location_id === location.id) : scoped;
    }
    return scoped;
  }, [brand?.id, context, location?.id, scope]);

  const { data: dashboardSummary = null, isError: dashboardSummaryFailed } = useAuthQuery({
    queryKey: ['dashboard-summary', organization?.id, brand?.id, location?.id, scope, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_role_dashboard_summary', {
        p_scope: scope,
        p_org_id: organization?.id,
        p_brand_id: scope === 'brand' ? brand?.id || null : null,
        p_location_id: scope === 'location' || scope === 'staff' ? location?.id || null : null,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (error) throw error;
      return data;
    },
    enabled: dashboardSummaryEnabled,
    retry: false,
    staleTime: 60 * 1000,
  });

  const rawFallbackEnabled = enabled && dashboardSummaryFailed;

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['dashboard-invoices', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Invoice.list('-created_at', {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, total_amount, status, payment_status, due_date, invoice_date, created_at',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: payments = [] } = useAuthQuery({
    queryKey: ['dashboard-payments', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Payment.list('-created_at', {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, amount, status, payment_date, created_at',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['dashboard-inventory', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Inventory.list(null, {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, current_quantity, current_value, unit_cost, product_name',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: products = [] } = useAuthQuery({
    queryKey: ['dashboard-products', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Product.list(null, {
      limit: 1000,
      select: 'id, organization_id, brand_id, location_id, is_inventoried',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: salesData = [] } = useAuthQuery({
    queryKey: ['dashboard-sales', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.PosSalesData.list('-sale_date', {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, sale_date, date, revenue, total_sales',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: shifts = [] } = useAuthQuery({
    queryKey: ['dashboard-shifts', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.EmployeeShift.list('-shift_start', {
      limit: 500,
      select: 'id, organization_id, brand_id, location_id, shift_start, status, labor_cost',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: orders = [] } = useAuthQuery({
    queryKey: ['dashboard-orders', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.AutoOrder.list('-created_at', {
      limit: 300,
      select: 'id, organization_id, brand_id, location_id, status, created_at',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: wastageLogs = [] } = useAuthQuery({
    queryKey: ['dashboard-wastage', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.WastageLog.list('-created_at', {
      limit: 300,
      select: 'id, organization_id, brand_id, location_id, total_cost, created_at',
    }),
    select: selectByScope,
    enabled: rawFallbackEnabled,
  });

  const { data: budgetTargets = [] } = useAuthQuery({
    queryKey: ['dashboard-budget-targets', organization?.id, brand?.id, location?.id, scope, periodStart, periodEnd],
    queryFn: () => api.entities.BudgetTarget.filter({ organization_id: organization?.id }),
    select: React.useCallback((data) => selectByScope(data).filter((target) => target.period_start === periodStart && target.period_end === periodEnd), [periodEnd, periodStart, selectByScope]),
    enabled: rawFallbackEnabled,
  });

  const { data: orgUsers = [] } = useAuthQuery({
    queryKey: ['dashboard-org-users', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, role, organization_id, brand_id, location_id').eq('organization_id', organization.id);
      if (error) throw error;
      return data || [];
    },
    enabled,
  });

  useEffect(() => {
    if (!enabled || !organization?.id) return undefined;
    const orgFilter = `organization_id=eq.${organization.id}`;
    const channel = supabase.channel(`dashboard-${scope}-realtime`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: orgFilter }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: orgFilter }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales_data', filter: orgFilter }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_targets', filter: orgFilter }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_shifts', filter: orgFilter }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [enabled, organization?.id, queryClient, scope]);

  return {
    budgetTargets,
    dashboardSummary,
    invoices,
    inventory,
    orders,
    orgUsers,
    payments,
    products,
    salesData,
    shifts,
    wastageLogs,
  };
}

function useDashboardMetrics(data, rules = DEFAULT_DASHBOARD_RULES) {
  return React.useMemo(() => {
    const now = new Date();
    const today = sumBy(data.salesData.filter((sale) => {
      const date = getDate(sale);
      return date && isSameDay(date, now);
    }), (sale) => sale.revenue);

    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(thisWeekStart, 1);
    const lastYearWeekStart = subYears(thisWeekStart, 1);
    const weekEnd = new Date(thisWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
    const lastYearWeekEnd = new Date(lastYearWeekStart);
    lastYearWeekEnd.setDate(lastYearWeekEnd.getDate() + 6);

    const salesInRange = (start, end) => sumBy(data.salesData.filter((sale) => {
      const date = getDate(sale);
      return date && isWithinInterval(date, { start, end });
    }), (sale) => sale.revenue);

    const weekSales = salesInRange(thisWeekStart, weekEnd);
    const lastWeekSales = salesInRange(lastWeekStart, lastWeekEnd);
    const lastYearSales = salesInRange(lastYearWeekStart, lastYearWeekEnd);
    const monthSales = salesInRange(startOfMonth(now), endOfMonth(now));
    const unpaid = sumBy(data.invoices.filter((invoice) => invoice.payment_status === 'unpaid' || invoice.status === 'approved'), getInvoiceAmount);
    const pendingInvoices = data.invoices.filter((invoice) => invoice.status === 'pending_review');
    const lowStock = data.inventory.filter((item) => Number(item.current_quantity || 0) <= Number(item.reorder_point || 5));
    const openOrders = data.orders.filter((order) => !['completed', 'received', 'cancelled'].includes(order.status));
    const laborCost = sumBy(data.shifts, (shift) => shift.labor_cost);
    const invoiceSpend = sumBy(data.invoices, getInvoiceAmount);
    const wastageCost = sumBy(data.wastageLogs, (log) => log.value || log.total_value);
    const cogsPercent = monthSales ? (invoiceSpend / monthSales) * 100 : 0;
    const laborPercent = monthSales ? (laborCost / monthSales) * 100 : 0;
    const primeCostPercent = cogsPercent + laborPercent;
    const grossMarginPercent = monthSales ? 100 - cogsPercent : 0;
    const monthProgress = getMonthProgress(now);
    const weekProgress = getWeekProgress(now);
    const dataHealthScore = getDataHealthScore({ monthSales, budgetPacing: [], laborCost, workflowCounts: null }, data);
    const salesForecast = buildSalesHistoryForecast({
      dataHealthScore,
      monthProgress,
      monthSales,
      now,
      salesData: data.salesData,
      salesInRange,
      weekProgress,
      weekSales,
    });
    const forecastMonthSales = salesForecast.projectedMonthSales;
    const forecastWeekSales = salesForecast.projectedWeekSales;
    const projectedInvoiceSpend = forecastValue(invoiceSpend, monthProgress.ratio);
    const projectedLaborCost = forecastValue(laborCost, monthProgress.ratio);
    const projectedCogsPercent = forecastMonthSales ? (projectedInvoiceSpend / forecastMonthSales) * 100 : cogsPercent;
    const projectedLaborPercent = forecastMonthSales ? (projectedLaborCost / forecastMonthSales) * 100 : laborPercent;
    const projectedPrimeCostPercent = projectedCogsPercent + projectedLaborPercent;
    const forecast = {
      confidence: salesForecast.confidence,
      inventoryRiskCount: data.inventory.filter((item) => {
        const current = Number(item.current_quantity || 0);
        const reorder = Number(item.reorder_point || 5);
        return current > reorder && current <= reorder * 1.25;
      }).length + lowStock.length,
      method: salesForecast.method,
      monthProgress,
      projectedCogsPercent,
      projectedLaborPercent,
      projectedPrimeCostPercent,
      projectedWeekSales: forecastWeekSales,
      projectedMonthSales: forecastMonthSales,
      salesRunRate: salesForecast.weightedDailyRunRate || (monthProgress.elapsed ? monthSales / monthProgress.elapsed : 0),
      sameWeekdayAverage: salesForecast.sameWeekdayAverage,
      seasonalIndex: salesForecast.seasonalIndex,
      trendPercent: salesForecast.trendPercent,
      activeSalesDays: salesForecast.activeSalesDays,
      volatilityPercent: salesForecast.volatilityPercent,
      weekProgress,
    };

    const spendByCategoryMap = data.invoices.reduce((acc, invoice) => {
      getLineItems(invoice).forEach((line) => {
        const category = line.category || line.accounting_category || 'Other';
        acc[category] = (acc[category] || 0) + getLineAmount(line);
      });
      if (!getLineItems(invoice).length) {
        acc.Other = (acc.Other || 0) + getInvoiceAmount(invoice);
      }
      return acc;
    }, {});

    const spendByCategory = Object.entries(spendByCategoryMap)
      .map(([name, value], index) => ({ name, value, color: COLORS[index % COLORS.length] }))
      .sort((a, b) => b.value - a.value);

    const budgetByCategory = Object.fromEntries(data.budgetTargets.map((target) => [target.category, target]));
    const budgetPacing = ['Sales', 'COGS', 'Labor', 'Prime Cost', ...spendByCategory.slice(0, 5).map((item) => item.name)]
      .filter((category, index, arr) => arr.indexOf(category) === index)
      .map((category) => {
        const target = Number(budgetByCategory[category]?.target_amount || 0);
        const actual = category === 'Sales'
          ? monthSales
          : category === 'Labor'
            ? laborCost
            : category === 'Prime Cost'
              ? invoiceSpend + laborCost
              : spendByCategoryMap[category] || (category === 'COGS' ? invoiceSpend : 0);
        const fallbackTarget = target || (category === 'Sales' ? monthSales * 1.05 : actual * 0.95);
        return {
          category,
          actual,
          target: fallbackTarget,
          remaining: fallbackTarget - actual,
          pacing: fallbackTarget ? ((actual - fallbackTarget) / fallbackTarget) * 100 : 0,
          isGood: category === 'Sales' ? actual >= fallbackTarget : actual <= fallbackTarget,
        };
      });

    const dailyRows = WEEK_DAYS.map((name, index) => {
      const currentDate = new Date(thisWeekStart);
      currentDate.setDate(thisWeekStart.getDate() + index);
      const previousDate = new Date(lastWeekStart);
      previousDate.setDate(lastWeekStart.getDate() + index);
      const yearDate = new Date(lastYearWeekStart);
      yearDate.setDate(lastYearWeekStart.getDate() + index);
      const actual = sumBy(data.salesData.filter((sale) => {
        const date = getDate(sale);
        return date && isSameDay(date, currentDate);
      }), (sale) => sale.revenue);
      const lastWeek = sumBy(data.salesData.filter((sale) => {
        const date = getDate(sale);
        return date && isSameDay(date, previousDate);
      }), (sale) => sale.revenue);
      const lastYear = sumBy(data.salesData.filter((sale) => {
        const date = getDate(sale);
        return date && isSameDay(date, yearDate);
      }), (sale) => sale.revenue);
      return {
        name,
        actual,
        lastWeek,
        lastYear,
        vsLastWeek: variance(actual, lastWeek),
        vsLastYear: variance(actual, lastYear),
      };
    });

    const recommendations = [];
    if (lowStock.length) recommendations.push({ tone: 'red', title: `${lowStock.length} low stock items`, body: 'Review reorder points and place replenishment orders.', href: 'Inventory' });
    if (pendingInvoices.length) recommendations.push({ tone: 'orange', title: `${pendingInvoices.length} invoices pending`, body: 'Clear pending review so AP and inventory stay current.', href: 'Invoices' });
    const overBudget = budgetPacing.filter((item) => !item.isGood && Math.abs(item.pacing) >= 1);
    if (overBudget.length) recommendations.push({ tone: 'yellow', title: `${overBudget[0].category} pacing ${percent(overBudget[0].pacing)}`, body: 'Open budget pacing and inspect category drivers.', href: 'Performance' });
    if (laborPercent > rules.laborPercent) recommendations.push({ tone: 'red', title: `Labor at ${laborPercent.toFixed(1)}%`, body: 'Review upcoming shifts against forecasted sales.', href: 'Labor' });
    if (!monthSales) recommendations.push({ tone: 'blue', title: 'POS sales not flowing yet', body: 'Connect or map POS data to unlock daily sales benchmarking.', href: 'RestaurantSetup?tab=pos' });
    if (primeCostPercent > rules.primeCostPercent) recommendations.push({ tone: 'red', title: `Prime cost at ${plainPercent(primeCostPercent)}`, body: `COGS plus labor is above the ${plainPercent(rules.primeCostPercent)} operating guardrail.`, href: 'Performance' });
    if (forecast.projectedPrimeCostPercent > rules.primeCostPercent && primeCostPercent <= rules.primeCostPercent) {
      recommendations.push({ tone: 'orange', title: `Prime cost forecast ${plainPercent(forecast.projectedPrimeCostPercent)}`, body: 'Current pace is projected to cross the saved prime-cost target before period close.', href: 'Performance' });
    }
    if (forecast.projectedLaborPercent > rules.laborPercent && laborPercent <= rules.laborPercent) {
      recommendations.push({ tone: 'orange', title: `Labor forecast ${plainPercent(forecast.projectedLaborPercent)}`, body: 'Labor pacing may exceed the saved target if sales and staffing continue at this rate.', href: 'Labor' });
    }
    if (forecast.inventoryRiskCount > lowStock.length) {
      recommendations.push({ tone: 'yellow', title: `${forecast.inventoryRiskCount} inventory items at risk`, body: 'Some items are close to reorder thresholds and may become low stock before the next order cycle.', href: 'Inventory' });
    }
    if (forecast.trendPercent < -10 && monthSales > 0) {
      recommendations.push({ tone: 'orange', title: `Sales trend down ${plainPercent(Math.abs(forecast.trendPercent))}`, body: 'Recent daily sales velocity is below the prior week. Review promotions, staffing, and daypart performance.', href: 'Performance' });
    }
    if (forecast.volatilityPercent > 45 && forecast.activeSalesDays >= 7) {
      recommendations.push({ tone: 'yellow', title: 'Sales forecast volatility elevated', body: 'Daily sales variance is high enough that forecast confidence may move quickly. Watch labor and ordering assumptions.', href: 'Performance' });
    }

    const calculated = {
      budgetPacing,
      cogsPercent,
      dailyRows,
      grossMarginPercent,
      forecast,
      invoiceSpend,
      laborCost,
      laborPercent,
      lastWeekSales,
      lastYearSales,
      lowStock,
      monthSales,
      openOrders,
      pendingInvoices,
      primeCostPercent,
      recommendations,
      spendByCategory,
      today,
      unpaid,
      wastageCost,
      weekSales,
      weekVsLastWeek: variance(weekSales, lastWeekSales),
      weekVsLastYear: variance(weekSales, lastYearSales),
      workflowCounts: null,
    };

    const summary = data.dashboardSummary;
    if (!summary?.kpis) return calculated;

    const kpis = summary.kpis || {};
    const workflowCounts = summary.workflows || {};
    const summarySpend = (summary.spendByCategory || []).map((item, index) => ({
      name: item.name,
      value: Number(item.value || 0),
      color: COLORS[index % COLORS.length],
    }));

    const summaryCogsPercent = Number(kpis.cogsPercent || 0);
    const summaryLaborPercent = Number(kpis.laborPercent || 0);
    const summaryPrimeCostPercent = Number(kpis.primeCostPercent || 0);
    const guardrailRecommendations = [];
    if (summaryCogsPercent > rules.cogsPercent) {
      guardrailRecommendations.push({ tone: 'red', title: `COGS at ${plainPercent(summaryCogsPercent)}`, body: `Food and controllable costs are above the ${plainPercent(rules.cogsPercent)} target.`, href: 'Performance' });
    }
    if (summaryLaborPercent > rules.laborPercent) {
      guardrailRecommendations.push({ tone: 'orange', title: `Labor at ${plainPercent(summaryLaborPercent)}`, body: `Scheduled or logged labor is above the ${plainPercent(rules.laborPercent)} target.`, href: 'Labor' });
    }
    if (summaryPrimeCostPercent > rules.primeCostPercent) {
      guardrailRecommendations.push({ tone: 'red', title: `Prime cost at ${plainPercent(summaryPrimeCostPercent)}`, body: `COGS plus labor is above the ${plainPercent(rules.primeCostPercent)} operating guardrail.`, href: 'Performance' });
    }
    if (Number(kpis.unpaidAmount || 0) > 0) {
      guardrailRecommendations.push({ tone: 'yellow', title: `${currency(kpis.unpaidAmount)} unpaid AP`, body: 'Open accounts payable can distort cash planning and vendor standing.', href: 'Payments' });
    }

    return {
      ...calculated,
      budgetPacing: (summary.budgetPacing || calculated.budgetPacing).map((item) => ({
        category: item.category,
        actual: Number(item.actual || 0),
        target: Number(item.target || 0),
        remaining: Number(item.remaining || 0),
        pacing: Number(item.pacing || 0),
        isGood: Boolean(item.isGood),
      })),
      benchmarks: summary.benchmarks || calculated.benchmarks,
      cogsPercent: summaryCogsPercent,
      dailyRows: (summary.salesPerformance || calculated.dailyRows).map((row) => ({
        name: row.name,
        actual: Number(row.actual || 0),
        lastWeek: Number(row.lastWeek || 0),
        lastYear: Number(row.lastYear || 0),
        vsLastWeek: Number(row.vsLastWeek || 0),
        vsLastYear: Number(row.vsLastYear || 0),
      })),
      invoiceSpend: Number(kpis.invoiceSpend || 0),
      laborCost: Number(kpis.laborCost || 0),
      laborPercent: summaryLaborPercent,
      lastWeekSales: Number(kpis.salesLastWeek || 0),
      lastYearSales: Number(kpis.salesLastYear || 0),
      lowStock: Array.from({ length: Number(kpis.lowStockItems || workflowCounts.lowStock || 0) }),
      monthSales: Number(kpis.salesPeriod || 0),
      openOrders: Array.from({ length: Number(kpis.openOrders || workflowCounts.openOrders || 0) }),
      pendingInvoices: Array.from({ length: Number(kpis.pendingInvoices || 0) }),
      grossMarginPercent: 100 - summaryCogsPercent,
      forecast: {
        ...calculated.forecast,
        projectedMonthSales: forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio),
        projectedWeekSales: forecastValue(Number(kpis.salesWeekToDate || 0), calculated.forecast.weekProgress.ratio),
        salesRunRate: calculated.forecast.monthProgress.elapsed ? Number(kpis.salesPeriod || 0) / calculated.forecast.monthProgress.elapsed : 0,
        projectedCogsPercent: forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio) ? (forecastValue(Number(kpis.invoiceSpend || 0), calculated.forecast.monthProgress.ratio) / forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio)) * 100 : summaryCogsPercent,
        projectedLaborPercent: forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio) ? (forecastValue(Number(kpis.laborCost || 0), calculated.forecast.monthProgress.ratio) / forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio)) * 100 : summaryLaborPercent,
        projectedPrimeCostPercent: forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio)
          ? ((forecastValue(Number(kpis.invoiceSpend || 0), calculated.forecast.monthProgress.ratio) + forecastValue(Number(kpis.laborCost || 0), calculated.forecast.monthProgress.ratio)) / forecastValue(Number(kpis.salesPeriod || 0), calculated.forecast.monthProgress.ratio)) * 100
          : summaryPrimeCostPercent,
      },
      primeCostPercent: summaryPrimeCostPercent,
      recommendations: mergeRecommendations((summary.alerts || calculated.recommendations).map((item) => ({
        tone: item.tone || 'blue',
        title: item.title,
        body: item.body,
        href: item.href,
      })), guardrailRecommendations),
      spendByCategory: summarySpend.length ? summarySpend : calculated.spendByCategory,
      today: Number(kpis.salesToday || 0),
      unpaid: Number(kpis.unpaidAmount || 0),
      wastageCost: Number(kpis.wastageCost || workflowCounts.wasteCost || 0),
      weekSales: Number(kpis.salesWeekToDate || 0),
      weekVsLastWeek: Number(kpis.salesVsLastWeek || 0),
      weekVsLastYear: Number(kpis.salesVsLastYear || 0),
      workflowCounts,
    };
  }, [data, rules.cogsPercent, rules.laborPercent, rules.primeCostPercent]);
}

function DashboardHeader({ title, subtitle, scopeLabel }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {scopeLabel && <Badge variant="secondary" className="capitalize">{scopeLabel}</Badge>}
        </div>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </div>
      <Link to={createPageUrl('Performance')}>
        <Button variant="outline" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          Open Performance
        </Button>
      </Link>
    </div>
  );
}

function DataHealthBanner({ score = 80, sources = [], canAccessPage = () => true }) {
  const connected = sources.filter((source) => source.count > 0).length;
  const total = sources.length;
  const missing = Math.max(total - connected, 0);

  return (
    <Card className="border-brand/30 bg-brand/5 shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-background">
              <svg className="h-16 w-16 -rotate-90">
                <circle cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-brand/15" />
                <circle cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="170" strokeDashoffset={170 - (score / 100) * 170} className="text-brand" />
              </svg>
              <span className="absolute text-sm font-bold text-brand">{score}%</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Data Health Score</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {connected} of {total || 0} accessible data sources are feeding this dashboard. {missing ? `${missing} source${missing > 1 ? 's' : ''} still need setup or records.` : 'Core source coverage is ready for stronger AvT and benchmark recommendations.'}
              </p>
            </div>
          </div>
          {canAccessPage('RestaurantSetup') && (
            <Link to={createPageUrl('RestaurantSetup') + '?tab=pos'}>
              <Button className="bg-brand text-primary-foreground hover:opacity-90">Complete Onboarding</Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiStrip({ metrics, platformStats, mode = 'operator', scope = 'org', canAccessPage = () => true, rules = DEFAULT_DASHBOARD_RULES }) {
  if (mode === 'platform') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Organizations" value={platformStats.totalOrgs} icon={Building2} tone="blue" linkTo="PlatformOrganizations" linkText="Manage" />
        <StatCard label="Active Users" value={platformStats.totalUsers} icon={Users} tone="purple" linkTo="PlatformUsers" linkText="View users" />
        <StatCard label="Monthly Revenue" value={currency(platformStats.mrr)} icon={DollarSign} tone="green" linkTo="PlatformAdmin?tab=accounting" linkText="Accounting" />
        <StatCard label="Active Subscriptions" value={platformStats.activeSubscriptions} icon={Activity} tone="brand" linkTo="PlatformAdmin?tab=subscriptions" linkText="Manage" />
      </div>
    );
  }

  const cardsByScope = {
    org: [
      { label: 'Period Sales', value: currency(metrics.monthSales), icon: TrendingUp, tone: 'green', subtext: `${currency(metrics.weekSales)} week-to-date` },
      { label: 'Gross Margin', value: plainPercent(metrics.grossMarginPercent), icon: BarChart3, tone: metrics.grossMarginPercent >= 68 ? 'green' : 'orange', subtext: `COGS ${plainPercent(metrics.cogsPercent)}` },
      { label: 'Unpaid AP', value: currency(metrics.unpaid), icon: CreditCard, tone: metrics.unpaid > 0 ? 'yellow' : 'green', linkTo: 'Payments', linkText: 'Review', requiredPage: 'Payments' },
      { label: 'Needs Attention', value: metrics.recommendations.length, icon: AlertTriangle, tone: metrics.recommendations.length ? 'red' : 'green', subtext: `${metrics.pendingInvoices.length} invoices, ${metrics.lowStock.length} low stock` },
    ],
    brand: [
      { label: 'Brand WTD Sales', value: currency(metrics.weekSales), icon: TrendingUp, tone: 'green', subtext: `${percent(metrics.weekVsLastWeek)} vs last week` },
      { label: 'Prime Cost', value: plainPercent(metrics.primeCostPercent), icon: Activity, tone: metrics.primeCostPercent > rules.primeCostPercent ? 'red' : 'green', subtext: `Target ${plainPercent(rules.primeCostPercent)}` },
      { label: 'Open Orders', value: metrics.openOrders.length, icon: ShoppingCart, tone: metrics.openOrders.length ? 'blue' : 'green', linkTo: 'AutoOrdering', linkText: 'Open', requiredPage: 'AutoOrdering' },
      { label: 'Low Stock', value: metrics.lowStock.length, icon: Warehouse, tone: metrics.lowStock.length ? 'orange' : 'green', linkTo: 'Inventory', linkText: 'Review', requiredPage: 'Inventory' },
    ],
    location: [
      { label: "Today's Sales", value: currency(metrics.today), icon: DollarSign, tone: 'green', subtext: `${currency(metrics.weekSales)} week-to-date` },
      { label: 'COGS', value: plainPercent(metrics.cogsPercent), icon: Package, tone: metrics.cogsPercent > rules.cogsPercent ? 'red' : 'blue', subtext: `Target ${plainPercent(rules.cogsPercent)}` },
      { label: 'Labor', value: plainPercent(metrics.laborPercent), icon: Users, tone: metrics.laborPercent > rules.laborPercent ? 'orange' : 'purple', subtext: `Target ${plainPercent(rules.laborPercent)}`, requiredPage: 'Labor' },
      { label: 'Action Items', value: metrics.recommendations.length, icon: AlertTriangle, tone: metrics.recommendations.length ? 'red' : 'green', subtext: `${metrics.pendingInvoices.length} invoices, ${metrics.lowStock.length} low stock` },
    ],
  };
  const cards = (cardsByScope[scope] || cardsByScope.org)
    .filter((card) => !card.requiredPage || canAccessPage(card.requiredPage))
    .map((card) => ({
      ...card,
      linkTo: card.linkTo && canAccessPage(pageKeyFromHref(card.linkTo)) ? card.linkTo : undefined,
      linkText: card.linkTo && canAccessPage(pageKeyFromHref(card.linkTo)) ? card.linkText : undefined,
    }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}

function NeedsAttentionPanel({ items, canAccessPage = () => true }) {
  const visibleItems = items
    .filter((item) => !item.href || canAccessPage(pageKeyFromHref(item.href)))
    .map((item) => ({
      ...item,
      href: item.href && canAccessPage(pageKeyFromHref(item.href)) ? item.href : undefined,
    }));
  const visible = visibleItems.length ? visibleItems : [{ tone: 'green', title: 'No urgent dashboard alerts', body: 'Core workflows look clear based on the data currently available.' }];
  return (
    <SectionCard title="Today Needs Attention" description="Prioritized operator actions from sales, budget, inventory, labor, and AP.">
      <div className="space-y-3">
        {visible.slice(0, 5).map((item) => (
          <div key={item.title} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-secondary/40 p-3">
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5 h-2.5 w-2.5 rounded-full', {
                'bg-resend-red': item.tone === 'red',
                'bg-resend-orange': item.tone === 'orange',
                'bg-resend-yellow': item.tone === 'yellow',
                'bg-resend-blue': item.tone === 'blue',
                'bg-resend-green': item.tone === 'green',
              })} />
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
              </div>
            </div>
            {item.href && (
              <Link to={createPageUrl(item.href)} className="shrink-0 text-xs font-semibold text-brand hover:opacity-80">
                Open
              </Link>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SalesPerformanceTable({ metrics }) {
  const hasSalesData = metrics.weekSales > 0 || metrics.lastWeekSales > 0 || metrics.lastYearSales > 0 || metrics.dailyRows.some((row) => row.actual > 0 || row.lastWeek > 0 || row.lastYear > 0);

  return (
    <SectionCard title="Sales Performance" description="MarginEdge-style current week comparison against last week and last year.">
      {!hasSalesData && (
        <EmptyState
          icon={TrendingUp}
          title="No POS sales data for this comparison yet"
          description="Connect POS sales or complete menu mapping to unlock daily sales, week-over-week, and year-over-year comparisons."
          actionHref="RestaurantSetup?tab=pos"
          actionLabel="Open POS setup"
        />
      )}
      {hasSalesData && (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 text-left font-medium">Day</th>
              <th className="py-2 text-right font-medium">This Week</th>
              <th className="py-2 text-right font-medium">Last Week</th>
              <th className="py-2 text-right font-medium">Vs. Last Week</th>
              <th className="py-2 text-right font-medium">Last Year</th>
              <th className="py-2 text-right font-medium">Vs. Last Year</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-secondary/40 font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{currency(metrics.weekSales)}</td>
              <td className="py-2 text-right">{currency(metrics.lastWeekSales)}</td>
              <td className={cn('py-2 text-right', metrics.weekVsLastWeek >= 0 ? 'text-resend-green' : 'text-resend-red')}>{percent(metrics.weekVsLastWeek)}</td>
              <td className="py-2 text-right">{currency(metrics.lastYearSales)}</td>
              <td className={cn('py-2 text-right', metrics.weekVsLastYear >= 0 ? 'text-resend-green' : 'text-resend-red')}>{percent(metrics.weekVsLastYear)}</td>
            </tr>
            {metrics.dailyRows.map((row) => (
              <tr key={row.name} className="border-b last:border-0">
                <td className="py-2 font-medium">{row.name}</td>
                <td className="py-2 text-right">{currency(row.actual)}</td>
                <td className="py-2 text-right">{currency(row.lastWeek)}</td>
                <td className={cn('py-2 text-right', row.vsLastWeek >= 0 ? 'text-resend-green' : 'text-resend-red')}>{percent(row.vsLastWeek)}</td>
                <td className="py-2 text-right">{currency(row.lastYear)}</td>
                <td className={cn('py-2 text-right', row.vsLastYear >= 0 ? 'text-resend-green' : 'text-resend-red')}>{percent(row.vsLastYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </SectionCard>
  );
}
// BudgetPacingPanel has been moved to src/components/dashboard/BudgetProgressWidget.jsx
function OperatingSnapshot({ metrics, scope, rules = DEFAULT_DASHBOARD_RULES }) {
  const rows = [
    { label: scope === 'location' ? "Today's Sales" : 'Period Sales', value: scope === 'location' ? currency(metrics.today) : currency(metrics.monthSales), helper: `${currency(metrics.weekSales)} WTD` },
    { label: 'Projected Cash Pressure', value: currency(metrics.unpaid * -1), helper: `${currency(metrics.unpaid)} unpaid AP` },
    { label: 'Prime Cost', value: plainPercent(metrics.primeCostPercent), helper: `${plainPercent(targetDelta(metrics.primeCostPercent, rules.primeCostPercent))} vs target` },
    { label: 'Gross Margin', value: plainPercent(metrics.grossMarginPercent), helper: `${currency(metrics.invoiceSpend)} COGS spend` },
    { label: 'Inventory Risk', value: metrics.lowStock.length, helper: 'Low stock items' },
    { label: 'Workflow Load', value: metrics.pendingInvoices.length + metrics.openOrders.length, helper: 'Invoices + open orders' },
  ];

  return (
    <SectionCard title="Operating Snapshot" description="The shortest answer to how the business is performing and what is pressuring it.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{row.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function GuardrailPanel({ metrics, canAccessPage = () => true, rules = DEFAULT_DASHBOARD_RULES }) {
  const guardrails = [
    { label: 'COGS', actual: metrics.cogsPercent, target: rules.cogsPercent, href: 'Performance' },
    { label: 'Labor', actual: metrics.laborPercent, target: rules.laborPercent, href: 'Labor' },
    { label: 'Prime Cost', actual: metrics.primeCostPercent, target: rules.primeCostPercent, href: 'Performance' },
  ];

  return (
    <SectionCard title="Operating Guardrails" description="Restaurant target thresholds that should stay visible every day.">
      <div className="space-y-4">
        {guardrails.map((item) => {
          const over = targetDelta(item.actual, item.target);
          const isGood = over <= 0;
          const progress = Math.min((Number(item.actual || 0) / Number(item.target || 1)) * 100, 140);
          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Actual {plainPercent(item.actual)} / Target {plainPercent(item.target)}
                  </p>
                </div>
                {canAccessPage(pageKeyFromHref(item.href)) ? (
                  <Link to={createPageUrl(item.href)}>
                    <Badge className={isGood ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-red/10 text-resend-red'}>
                      {isGood ? 'Inside target' : `${plainPercent(over)} over`}
                    </Badge>
                  </Link>
                ) : (
                  <Badge className={isGood ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-red/10 text-resend-red'}>
                    {isGood ? 'Inside target' : `${plainPercent(over)} over`}
                  </Badge>
                )}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function SpendAndWorkflowGrid({ metrics, data, showWorkflow = true, canAccessPage = () => true }) {
  const hasSpendData = metrics.spendByCategory.some((item) => Number(item.value || 0) > 0);
  const pieData = hasSpendData ? metrics.spendByCategory : [{ name: 'No spend coded', value: 1, color: '#e5e7eb' }];
  const workflowCounts = metrics.workflowCounts || {};
  const workflows = [
    { label: 'Invoices', value: workflowCounts.invoices ?? data.invoices.length, href: 'Invoices', icon: FileText },
    { label: 'Payments', value: workflowCounts.payments ?? data.payments.length, href: 'Payments', icon: CreditCard },
    { label: 'Open Orders', value: workflowCounts.openOrders ?? metrics.openOrders.length, href: 'AutoOrdering', icon: ShoppingCart },
    { label: 'Low Stock', value: workflowCounts.lowStock ?? metrics.lowStock.length, href: 'Inventory', icon: Warehouse },
    { label: 'Products', value: workflowCounts.products ?? data.products.length, href: 'Products', icon: Package },
    { label: 'Waste Cost', value: currency(workflowCounts.wasteCost ?? metrics.wastageCost), href: 'Inventory?tab=wastage', icon: AlertTriangle },
  ].filter((item) => canAccessPage(pageKeyFromHref(item.href)));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionCard title="Spend by Category" description="Invoice spend grouped by coded category." className="xl:col-span-1">
        {!hasSpendData && (
          <EmptyState
            icon={FileText}
            title="No coded spend yet"
            description="Upload and code invoices to see category-level COGS and controllable spend here."
            actionHref={canAccessPage('Invoices') ? 'Invoices' : undefined}
            actionLabel={canAccessPage('Invoices') ? 'Open invoices' : undefined}
          />
        )}
        {hasSpendData && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => currency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        )}
      </SectionCard>

      {showWorkflow && (
        <SectionCard title="Operational Workflows" description="Live platform work that supports the performance dashboard." className="xl:col-span-2">
          {!workflows.length && (
            <EmptyState
              icon={Shield}
              title="No workflow modules available"
              description="This role does not currently have access to invoice, payment, ordering, inventory, product, or waste workflows."
            />
          )}
          {!!workflows.length && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {workflows.map((item) => (
              <Link key={item.label} to={createPageUrl(item.href)} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 p-3 transition-colors hover:bg-secondary/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-foreground">{item.value}</span>
              </Link>
            ))}
          </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function BenchmarkPanel({ metrics, title = 'Scope Benchmarking' }) {
  const data = metrics.benchmarks || [
    { name: 'Sales', actual: metrics.weekSales, benchmark: metrics.lastWeekSales || metrics.weekSales },
    { name: 'COGS', actual: metrics.cogsPercent, benchmark: 32 },
    { name: 'Labor', actual: metrics.laborPercent, benchmark: 28 },
    { name: 'Prime', actual: metrics.primeCostPercent, benchmark: 60 },
  ];

  return (
    <SectionCard title={title} description="Benchmarks use last-week sales and common restaurant operating targets until richer peer data is available.">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="actual" name="Actual" fill="#0d9488" radius={[4, 4, 0, 0]} />
            <Bar dataKey="benchmark" name="Benchmark" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function DataCoveragePanel({ metrics, data, canAccessPage = () => true }) {
  const sources = getDataCoverageSources(metrics, data, canAccessPage);

  if (!sources.length) return null;

  return (
    <SectionCard title="Data Coverage" description="Source modules currently feeding this dashboard. Use these links to audit the numbers.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {sources.map((source) => (
          <Link key={source.label} to={createPageUrl(source.page)} className="rounded-lg border border-border/60 bg-secondary/30 p-3 transition-colors hover:bg-secondary/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{source.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{source.status}</p>
            <p className="mt-1 text-xs text-brand">Open source</p>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function DashboardRulesPanel({ canManage = true, rules, onSaveRules }) {
  const [draft, setDraft] = React.useState(() => normalizeDashboardRules(rules));

  useEffect(() => {
    setDraft(normalizeDashboardRules(rules));
  }, [rules]);

  const updatePercent = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: Math.max(0, Number(value || 0)),
    }));
  };

  const updateToggle = (key) => {
    setDraft((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const save = () => {
    if (!canManage) return;
    onSaveRules?.(normalizeDashboardRules(draft));
  };

  const targetFields = [
    { key: 'cogsPercent', label: 'COGS Target' },
    { key: 'laborPercent', label: 'Labor Target' },
    { key: 'primeCostPercent', label: 'Prime Cost Target' },
  ];
  const notificationFields = [
    { key: 'notifyCriticalActions', label: 'Critical actions' },
    { key: 'notifyHighActions', label: 'High-priority actions' },
    { key: 'notifyCarryover', label: 'Prior review carryover' },
    { key: 'notifyPrimeCostBreach', label: 'Prime cost breach' },
  ];

  return (
    <SectionCard
      title="Dashboard Rules Center"
      description="Role and scope settings for operating targets and escalation behavior."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          {!canManage && <Badge variant="secondary">Read-only</Badge>}
          <Button size="sm" className="gap-2" onClick={save} disabled={!canManage}>
            <Save className="h-4 w-4" />
            Save Rules
          </Button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-3">
          {targetFields.map((field) => (
            <label key={field.key} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{field.label}</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft[field.key]}
                  onChange={(event) => updatePercent(field.key, event.target.value)}
                  disabled={!canManage}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                />
                <span className="text-sm font-semibold text-muted-foreground">%</span>
              </div>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {notificationFields.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
              <span className="text-sm font-semibold text-foreground">{field.label}</span>
              <input
                type="checkbox"
                checked={Boolean(draft[field.key])}
                onChange={() => updateToggle(field.key)}
                disabled={!canManage}
                className="h-4 w-4 accent-brand"
              />
            </label>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function getRoleActionLabel(scope) {
  if (scope === 'brand') return 'Brand manager';
  if (scope === 'location') return 'Location manager';
  return 'Org owner';
}

function buildRoleActionPlan(metrics, scope, canAccessPage = () => true, rules = DEFAULT_DASHBOARD_RULES) {
  const owner = getRoleActionLabel(scope);
  const items = [];

  metrics.recommendations.forEach((item) => {
    if (item.href && !canAccessPage(pageKeyFromHref(item.href))) return;
    items.push({
      title: item.title,
      body: item.body,
      href: item.href,
      owner,
      due: item.tone === 'red' ? 'Today' : 'This week',
      priority: item.tone === 'red' ? 'Critical' : item.tone === 'orange' || item.tone === 'yellow' ? 'High' : 'Normal',
      tone: item.tone,
    });
  });

  if (metrics.cogsPercent > rules.cogsPercent && canAccessPage('Performance')) {
    items.push({
      title: 'Review COGS drivers',
      body: `COGS is ${plainPercent(targetDelta(metrics.cogsPercent, rules.cogsPercent))} over target. Compare invoice categories and recipe/menu cost changes.`,
      href: 'Performance',
      owner,
      due: 'Today',
      priority: 'Critical',
      tone: 'red',
    });
  }

  if (metrics.laborPercent > rules.laborPercent && canAccessPage('Labor')) {
    items.push({
      title: 'Tighten labor pacing',
      body: `Labor is ${plainPercent(targetDelta(metrics.laborPercent, rules.laborPercent))} over target. Review schedule coverage against forecasted sales.`,
      href: 'Labor',
      owner: scope === 'org' ? 'Location managers' : owner,
      due: 'Next shift',
      priority: 'High',
      tone: 'orange',
    });
  }

  if (metrics.unpaid > 0 && canAccessPage('Payments')) {
    items.push({
      title: 'Clear unpaid AP queue',
      body: `${currency(metrics.unpaid)} is unpaid. Confirm approval status, cash timing, and vendor priority.`,
      href: 'Payments',
      owner: scope === 'location' ? 'Location manager' : 'AP owner',
      due: 'Today',
      priority: 'High',
      tone: 'yellow',
    });
  }

  if (!items.length) {
    items.push({
      title: 'Run the daily operating review',
      body: 'No urgent issues are visible. Review sales pacing, budget targets, and source data coverage before shift close.',
      href: canAccessPage('Performance') ? 'Performance' : undefined,
      owner,
      due: 'Today',
      priority: 'Normal',
      tone: 'green',
    });
  }

  const seen = new Set();
  return items
    .filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    })
    .slice(0, 6);
}

function buildEscalations({ actions, metrics, reviews, rules = DEFAULT_DASHBOARD_RULES, statusMap }) {
  const openActions = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const latestPriorReview = reviews.find((review) => review.date !== todayKey());
  const carryoverItems = latestPriorReview?.openActions || [];
  const escalations = [];

  if (rules.notifyCriticalActions) {
    openActions
      .filter((item) => item.priority === 'Critical')
      .forEach((item) => {
      escalations.push({
        title: item.title,
        body: item.body,
        owner: item.owner,
        due: item.due === 'Today' ? 'Due now' : item.due,
        href: item.href,
        priority: 'Critical',
        reason: 'Critical action still open',
        tone: 'red',
      });
    });
  }

  if (rules.notifyHighActions && openActions.some((item) => item.priority === 'High')) {
    const highCount = openActions.filter((item) => item.priority === 'High').length;
    escalations.push({
      title: `${highCount} high-priority actions open`,
      body: 'Review owner assignment before the next manager handoff.',
      owner: 'Manager on duty',
      due: 'Today',
      href: 'Dashboard',
      priority: 'High',
      reason: 'High-priority work remains open',
      tone: 'orange',
    });
  }

  if (rules.notifyCarryover && carryoverItems.length) {
    escalations.push({
      title: `${carryoverItems.length} carryover item${carryoverItems.length > 1 ? 's' : ''} from prior review`,
      body: `Last review on ${latestPriorReview.date} had unresolved dashboard actions.`,
      owner: 'Next manager',
      due: 'Due now',
      href: 'Dashboard',
      priority: 'High',
      reason: 'Prior review carryover',
      tone: 'yellow',
    });
  }

  if (rules.notifyPrimeCostBreach && metrics.primeCostPercent > rules.primeCostPercent) {
    escalations.push({
      title: `Prime cost above target at ${plainPercent(metrics.primeCostPercent)}`,
      body: 'COGS plus labor is above the daily operating guardrail.',
      owner: 'Operator leadership',
      due: 'Today',
      href: 'Performance',
      priority: 'Critical',
      reason: 'Operating guardrail breach',
      tone: 'red',
    });
  }

  const seen = new Set();
  return escalations.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  }).slice(0, 6);
}

function DecisionBriefPanel({ metrics, scope, rules = DEFAULT_DASHBOARD_RULES }) {
  const salesSignal = metrics.weekVsLastWeek >= 0
    ? `${percent(metrics.weekVsLastWeek)} vs last week`
    : `${percent(metrics.weekVsLastWeek)} vs last week`;
  const riskCount = [
    metrics.cogsPercent > rules.cogsPercent,
    metrics.laborPercent > rules.laborPercent,
    metrics.primeCostPercent > rules.primeCostPercent,
    metrics.unpaid > 0,
    metrics.lowStock.length > 0,
  ].filter(Boolean).length;
  const headline = scope === 'location'
    ? `${currency(metrics.today)} today, ${currency(metrics.weekSales)} WTD`
    : `${currency(metrics.monthSales)} period sales, ${currency(metrics.weekSales)} WTD`;
  const focus = riskCount
    ? `${riskCount} operating guardrail${riskCount > 1 ? 's' : ''} need review before the next close.`
    : 'Core guardrails are inside target based on the connected data.';

  return (
    <SectionCard title="Manager Decision Brief" description="A short operating readout for the next leadership check-in.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          { label: 'Business Read', value: headline, helper: salesSignal, icon: TrendingUp },
          { label: 'Primary Risk', value: focus, helper: `Prime cost ${plainPercent(metrics.primeCostPercent)}`, icon: Target },
          { label: 'Handoff Note', value: `${metrics.recommendations.length || 0} action items`, helper: `${metrics.pendingInvoices.length} invoices, ${metrics.lowStock.length} low stock`, icon: ClipboardList },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
            <p className="mt-3 text-sm font-semibold leading-5 text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ForecastIntelligencePanel({ metrics, rules = DEFAULT_DASHBOARD_RULES, canAccessPage = () => true }) {
  const forecast = metrics.forecast || {};
  const forecastCards = [
    {
      label: 'Week Sales Forecast',
      value: currency(forecast.projectedWeekSales),
      helper: `${currency(metrics.weekSales)} actual WTD`,
      tone: forecast.projectedWeekSales >= metrics.lastWeekSales ? 'green' : 'yellow',
      href: 'Performance',
    },
    {
      label: 'Month Sales Forecast',
      value: currency(forecast.projectedMonthSales),
      helper: `${currency(forecast.salesRunRate)} daily run rate`,
      tone: forecast.projectedMonthSales >= metrics.monthSales ? 'blue' : 'yellow',
      href: 'Performance',
    },
    {
      label: 'Prime Cost Forecast',
      value: plainPercent(forecast.projectedPrimeCostPercent),
      helper: `Target ${plainPercent(rules.primeCostPercent)}`,
      tone: forecast.projectedPrimeCostPercent > rules.primeCostPercent ? 'red' : 'green',
      href: 'Performance',
    },
    {
      label: 'Inventory Risk',
      value: forecast.inventoryRiskCount || 0,
      helper: `${metrics.lowStock.length} already low stock`,
      tone: forecast.inventoryRiskCount > metrics.lowStock.length ? 'orange' : 'green',
      href: 'Inventory',
    },
  ];
  const signalCards = [
    { label: 'Sales Trend', value: percent(forecast.trendPercent || 0), helper: 'Recent 7-day velocity vs prior 7 days', tone: Number(forecast.trendPercent || 0) >= 0 ? 'green' : 'orange' },
    { label: 'Weekday Factor', value: `${Number(forecast.seasonalIndex || 1).toFixed(2)}x`, helper: `${currency(forecast.sameWeekdayAverage)} same-weekday average`, tone: Number(forecast.seasonalIndex || 1) >= 1 ? 'blue' : 'yellow' },
    { label: 'Volatility', value: plainPercent(forecast.volatilityPercent || 0), helper: `${forecast.activeSalesDays || 0} active sales days`, tone: Number(forecast.volatilityPercent || 0) > 45 ? 'orange' : 'green' },
  ];

  return (
    <SectionCard title="Forecast Intelligence" description="Projected sales, cost pressure, and inventory risk based on current period pace.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className={cn({
          'bg-resend-green/10 text-resend-green': forecast.confidence === 'High',
          'bg-resend-yellow/10 text-resend-yellow': forecast.confidence === 'Medium',
          'bg-resend-orange/10 text-resend-orange': forecast.confidence === 'Low',
        })}>
          {forecast.confidence || 'Low'} confidence
        </Badge>
        <Badge variant="secondary">{forecast.method || 'Current pace'}</Badge>
        <span className="text-xs text-muted-foreground">
          Month {Math.round((forecast.monthProgress?.ratio || 0) * 100)}% complete / Week {Math.round((forecast.weekProgress?.ratio || 0) * 100)}% complete
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {forecastCards.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-xl font-bold text-foreground">{item.value}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{item.helper}</p>
              {item.href && canAccessPage(item.href) && (
                <Link to={createPageUrl(item.href)} className="text-xs font-semibold text-brand hover:opacity-80">
                  Open
                </Link>
              )}
            </div>
            <div className={cn('mt-3 h-1.5 rounded-full', {
              'bg-resend-green': item.tone === 'green',
              'bg-resend-blue': item.tone === 'blue',
              'bg-resend-yellow': item.tone === 'yellow',
              'bg-resend-orange': item.tone === 'orange',
              'bg-resend-red': item.tone === 'red',
            })} />
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {signalCards.map((item) => (
          <div key={item.label} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <div className={cn('h-2.5 w-2.5 rounded-full', {
                'bg-resend-green': item.tone === 'green',
                'bg-resend-blue': item.tone === 'blue',
                'bg-resend-yellow': item.tone === 'yellow',
                'bg-resend-orange': item.tone === 'orange',
              })} />
            </div>
            <p className="mt-2 text-lg font-bold text-foreground">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function RoleActionPlanPanel({ actions: providedActions, metrics, scope, canAccessPage = () => true, statusMap = {}, setStatusMap, onActionStatusChange, onResetActions }) {
  const actions = providedActions || buildRoleActionPlan(metrics, scope, canAccessPage);
  const [filter, setFilter] = React.useState('open');

  const completedCount = actions.filter((item) => statusMap[actionId(item.title)] === 'done').length;
  const openCount = actions.length - completedCount;
  const visibleActions = actions.filter((item) => {
    const isDone = statusMap[actionId(item.title)] === 'done';
    if (filter === 'completed') return isDone;
    if (filter === 'critical') return !isDone && item.priority === 'Critical';
    if (filter === 'high') return !isDone && (item.priority === 'High' || item.priority === 'Critical');
    return !isDone;
  });
  const filterOptions = [
    { value: 'open', label: `Open (${openCount})` },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
    { value: 'completed', label: `Done (${completedCount})` },
  ];

  const toggleAction = (title) => {
    const key = actionId(title);
    const nextStatus = statusMap[key] === 'done' ? 'open' : 'done';
    setStatusMap?.((current) => ({ ...current, [key]: nextStatus }));
    onActionStatusChange?.(title, nextStatus);
  };

  return (
    <SectionCard
      title="Daily Action Plan"
      description="Role-based actions converted from the dashboard signals."
      action={(
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => onResetActions ? onResetActions() : setStatusMap?.({})}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      )}
    >
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{completedCount}/{actions.length} completed today</p>
          <p className="text-xs text-muted-foreground">Progress is saved in this browser for {todayKey()}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          {filterOptions.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={filter === item.value ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {visibleActions.map((item, index) => {
          const isDone = statusMap[actionId(item.title)] === 'done';
          return (
          <div key={item.title} className={cn('flex flex-col gap-3 rounded-lg border border-border/60 p-4 md:flex-row md:items-start md:justify-between', isDone ? 'bg-resend-green/5' : 'bg-secondary/30')}>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => toggleAction(item.title)}
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors', {
                'bg-resend-red/10 text-resend-red': item.tone === 'red',
                'bg-resend-orange/10 text-resend-orange': item.tone === 'orange',
                'bg-resend-yellow/10 text-resend-yellow': item.tone === 'yellow',
                'bg-resend-blue/10 text-resend-blue': item.tone === 'blue',
                'bg-resend-green/10 text-resend-green': item.tone === 'green',
              })}
                aria-label={isDone ? `Mark ${item.title} open` : `Mark ${item.title} complete`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('text-sm font-semibold text-foreground', isDone && 'text-muted-foreground line-through')}>{item.title}</p>
                  <Badge variant="secondary">{item.priority}</Badge>
                  {isDone && <Badge className="bg-resend-green/10 text-resend-green">Completed</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> {item.owner}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {item.due}</span>
                </div>
              </div>
            </div>
            {item.href && (
              <Link to={createPageUrl(item.href)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:opacity-80">
                Open workflow <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          );
        })}
        {!visibleActions.length && (
          <EmptyState
            icon={CheckCircle2}
            title="No actions in this view"
            description="Change the filter or reset today's progress to see more action items."
          />
        )}
      </div>
    </SectionCard>
  );
}

function EscalationPanel({ escalations, organization, scope, userProfile }) {
  const [notifyingKey, setNotifyingKey] = React.useState(null);

  const notifyEscalation = async (item) => {
    if (!organization?.id) {
      toast.error('No organization found for escalation');
      return;
    }

    const key = actionId(item.title);
    setNotifyingKey(key);
    try {
      const result = await notifyManagers({
        organization_id: organization.id,
        title: `Dashboard escalation: ${item.title}`,
        message: `${item.reason}. Owner: ${item.owner}. Due: ${item.due}. ${item.body}`,
        type: item.priority === 'Critical' ? 'system' : 'system',
        metadata: {
          dashboard_scope: scope,
          escalation_title: item.title,
          href: item.href || 'Dashboard',
          priority: item.priority,
        },
        exclude_user_id: userProfile?.id,
      });

      logAudit({
        action: 'dashboard_escalation_notified',
        entityId: key,
        entityType: 'dashboard_escalation',
        module: AUDIT_MODULES.SYSTEM,
        orgId: organization.id,
        userId: userProfile?.id,
        details: { scope, title: item.title, notified: result.notified || 0 },
      });

      toast.success(result.notified ? `Notified ${result.notified} manager${result.notified > 1 ? 's' : ''}` : 'No managers found to notify');
    } catch (error) {
      toast.error(error.message || 'Failed to send escalation');
    } finally {
      setNotifyingKey(null);
    }
  };

  return (
    <SectionCard title="Escalation Center" description="Open critical work, carryover, and guardrail breaches that may need manager notification.">
      {!escalations.length && (
        <EmptyState
          icon={CheckCircle2}
          title="No escalations right now"
          description="Critical actions, carryover items, and operating guardrails are clear based on the current dashboard state."
        />
      )}
      {!!escalations.length && (
        <div className="space-y-3">
          {escalations.map((item) => {
            const key = actionId(item.title);
            return (
              <div key={item.title} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-secondary/30 p-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3">
                  <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', {
                    'bg-resend-red/10 text-resend-red': item.tone === 'red',
                    'bg-resend-orange/10 text-resend-orange': item.tone === 'orange',
                    'bg-resend-yellow/10 text-resend-yellow': item.tone === 'yellow',
                  })}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <Badge className={item.priority === 'Critical' ? 'bg-resend-red/10 text-resend-red' : 'bg-resend-orange/10 text-resend-orange'}>
                        {item.priority}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> {item.owner}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {item.due}</span>
                      <span>{item.reason}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {item.href && (
                    <Link to={createPageUrl(item.href)} className="text-xs font-semibold text-brand hover:opacity-80">
                      Open
                    </Link>
                  )}
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => notifyEscalation(item)} disabled={notifyingKey === key}>
                    <BellRing className="h-4 w-4" />
                    {notifyingKey === key ? 'Notifying' : 'Notify'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
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

async function sendDashboardReportNotifications({ brand, location, organization, preferences, reportText, reportType, scope, userProfile }) {
  if (!organization?.id) return { notified: 0 };
  const normalized = normalizeReportPreferences(preferences);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, organization_id, brand_id, location_id, status')
    .eq('organization_id', organization.id)
    .in('role', normalized.recipientRoles)
    .neq('status', 'inactive');
  if (error) throw error;

  const targets = (data || [])
    .filter((profile) => {
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

function ExecutiveReportPanel({ actions, dataHealthScore, escalations, metrics, organization, rules, scope, statusMap = {}, userProfile }) {
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

function ScheduledReportsPanel({
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
        userProfile,
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

function DashboardReportHistoryPanel({
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
        userProfile,
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

function DashboardProductionReadinessPanel({
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

function HandoffBriefPanel({ actions: providedActions, metrics, scope, statusMap = {}, dataHealthScore, canAccessPage = () => true, note = '', setNote, onHandoffExport, syncState }) {
  const actions = providedActions || buildRoleActionPlan(metrics, scope, canAccessPage);
  const completedCount = actions.filter((item) => statusMap[actionId(item.title)] === 'done').length;
  const openCount = actions.length - completedCount;
  const handoffText = createHandoffText({ metrics, scope, actions, statusMap, dataHealthScore, note });

  const copyHandoff = async () => {
    try {
      await navigator.clipboard.writeText(handoffText);
      onHandoffExport?.('dashboard_handoff_copied');
      toast.success('Daily handoff copied');
    } catch {
      toast.error('Could not copy handoff');
    }
  };

  const downloadHandoff = () => {
    const blob = new Blob([handoffText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restops-handoff-${scope}-${todayKey()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    onHandoffExport?.('dashboard_handoff_downloaded');
    toast.success('Daily handoff downloaded');
  };

  return (
    <SectionCard
      title="Daily Handoff"
      description="Copy or download a manager-ready summary of today's operating state."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <SyncStatusBadge syncState={syncState} />
          <Button variant="outline" size="sm" className="gap-2" onClick={copyHandoff}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadHandoff}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action Status</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{completedCount}/{actions.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{openCount} open for follow-up</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operating Summary</p>
          <p className="mt-2 text-sm font-semibold text-foreground">Prime {plainPercent(metrics.primeCostPercent)} / Data {dataHealthScore}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{currency(metrics.weekSales)} WTD sales</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Handoff Risk</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{metrics.lowStock.length + metrics.pendingInvoices.length} workflow exceptions</p>
          <p className="mt-1 text-xs text-muted-foreground">{currency(metrics.unpaid)} unpaid AP</p>
        </div>
      </div>
      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="dashboard-handoff-note">
          Manager note
        </label>
        <textarea
          id="dashboard-handoff-note"
          value={note}
          onChange={(event) => setNote?.(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          placeholder="Add shift context, vendor issues, staffing notes, or what the next manager should check first."
        />
      </div>
    </SectionCard>
  );
}

function ManagerReviewLogPanel({ actions: providedActions, metrics, scope, statusMap = {}, dataHealthScore, canAccessPage = () => true, reviews = [], onSaveReview, onClearReviews, syncState }) {
  const actions = providedActions || buildRoleActionPlan(metrics, scope, canAccessPage);
  const completed = actions.filter((item) => statusMap[actionId(item.title)] === 'done');
  const open = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const latestPriorReview = reviews.find((review) => review.date !== todayKey());
  const carryoverItems = latestPriorReview?.openActions || [];

  return (
    <SectionCard
      title="Manager Review Log"
      description="Save daily review snapshots and keep prior open items visible for follow-up."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <SyncStatusBadge syncState={syncState} />
          <Button variant="outline" size="sm" className="gap-2" onClick={onSaveReview}>
            <Save className="h-4 w-4" />
            Save Review
          </Button>
          {!!reviews.length && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={onClearReviews}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Today's Review
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{completed.length}/{actions.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{open.length} open actions before save</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-4 w-4" />
            Carryover
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{carryoverItems.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{latestPriorReview ? `From ${latestPriorReview.date}` : 'No prior review saved'}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-4 w-4" />
            Review Health
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{dataHealthScore}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Data health at save time</p>
        </div>
      </div>

      {!!carryoverItems.length && (
        <div className="mt-4 rounded-lg border border-border/60 bg-secondary/20 p-4">
          <p className="text-sm font-semibold text-foreground">Carryover From Last Review</p>
          <div className="mt-3 space-y-2">
            {carryoverItems.slice(0, 4).map((item) => (
              <div key={`${item.title}-${item.priority}`} className="flex flex-col gap-1 rounded-md bg-background/70 p-3 md:flex-row md:items-center md:justify-between">
                <span className="text-sm text-foreground">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.priority} / {item.owner} / {item.due}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {reviews.slice(0, 5).map((review) => (
          <div key={review.id} className="rounded-lg border border-border/60 bg-secondary/30 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{review.date}</p>
                <p className="text-xs text-muted-foreground">
                  {review.completedCount}/{review.totalCount} complete / {currency(review.weekSales)} WTD / Prime {plainPercent(review.primeCostPercent)}
                </p>
              </div>
              <Badge variant="secondary">{review.openActions.length} open</Badge>
            </div>
            {review.note && <p className="mt-3 text-xs text-muted-foreground">{review.note}</p>}
          </div>
        ))}
        {!reviews.length && (
          <EmptyState
            icon={History}
            title="No manager reviews saved yet"
            description="Save today's review after checking the action plan and handoff note."
          />
        )}
      </div>
    </SectionCard>
  );
}

function StaffShiftPlanPanel({ tasks, metrics }) {
  const checklist = [
    { label: 'Review assigned module queue', value: `${tasks.length} modules`, icon: Shield },
    { label: 'Clear invoice or inventory exceptions', value: `${metrics.pendingInvoices.length + metrics.lowStock.length} items`, icon: CheckCircle2 },
    { label: 'Escalate unresolved blockers to manager', value: metrics.recommendations.length ? 'Needed' : 'None visible', icon: ClipboardList },
  ];
  const storageKey = `dashboard-staff-shift:${todayKey()}`;
  const [statusMap, setStatusMap] = React.useState({});

  React.useEffect(() => {
    try {
      setStatusMap(JSON.parse(window.localStorage.getItem(storageKey) || '{}'));
    } catch {
      setStatusMap({});
    }
  }, [storageKey]);

  React.useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(statusMap));
  }, [statusMap, storageKey]);

  const completeCount = checklist.filter((item) => statusMap[actionId(item.label)] === 'done').length;

  return (
    <SectionCard
      title="My Shift Plan"
      description="A simple checklist for ground staff based on assigned module access."
      action={<Badge variant="secondary">{completeCount}/{checklist.length} done</Badge>}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {checklist.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              const key = actionId(item.label);
              setStatusMap((current) => ({ ...current, [key]: current[key] === 'done' ? 'open' : 'done' }));
            }}
            className={cn('rounded-lg border border-border/60 p-4 text-left transition-colors hover:bg-secondary/60', statusMap[actionId(item.label)] === 'done' ? 'bg-resend-green/5' : 'bg-secondary/30')}
          >
            <div className="flex items-center justify-between gap-3">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              {statusMap[actionId(item.label)] === 'done' ? <CheckCircle2 className="h-4 w-4 text-resend-green" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            </div>
            <p className={cn('mt-3 text-sm font-semibold text-foreground', statusMap[actionId(item.label)] === 'done' && 'text-muted-foreground line-through')}>{item.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.value}</p>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function PlatformActionQueue({ platformStats, recentLogs }) {
  const actions = [
    {
      title: 'Review trial or pending organizations',
      body: `${Math.max(platformStats.totalOrgs - platformStats.activeSubscriptions, 0)} organizations are not active subscriptions.`,
      href: 'PlatformOrganizations',
      priority: platformStats.totalOrgs === platformStats.activeSubscriptions ? 'Normal' : 'High',
      tone: platformStats.totalOrgs === platformStats.activeSubscriptions ? 'green' : 'yellow',
    },
    {
      title: 'Audit platform activity',
      body: recentLogs.length ? `${recentLogs.length} recent audit events are available for review.` : 'No recent audit events are currently visible.',
      href: 'PlatformAdmin?tab=audit',
      priority: recentLogs.length ? 'Normal' : 'High',
      tone: recentLogs.length ? 'blue' : 'orange',
    },
    {
      title: 'Check revenue operations',
      body: `${currency(platformStats.mrr)} monthly recurring revenue is represented by active plans.`,
      href: 'PlatformAdmin?tab=accounting',
      priority: 'Normal',
      tone: 'green',
    },
  ];

  return (
    <SectionCard title="Platform Action Queue" description="Production operations that keep the hosted platform healthy.">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {actions.map((item) => (
          <Link key={item.title} to={createPageUrl(item.href)} className="rounded-lg border border-border/60 bg-secondary/30 p-4 transition-colors hover:bg-secondary/60">
            <div className="flex items-center justify-between gap-3">
              <Badge className={cn({
                'bg-resend-green/10 text-resend-green': item.tone === 'green',
                'bg-resend-yellow/10 text-resend-yellow': item.tone === 'yellow',
                'bg-resend-blue/10 text-resend-blue': item.tone === 'blue',
                'bg-resend-orange/10 text-resend-orange': item.tone === 'orange',
              })}>
                {item.priority}
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function OrgOperatorDashboard({ scope, title, subtitle, scopeLabel }) {
  const { organization, brand, location, userProfile } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();
  const data = useDashboardData(scope);
  const dashboardRules = useDashboardRules({ brand, location, organization, scope, userProfile });
  const reportPreferences = useDashboardReportPreferences({ brand, location, organization, scope, userProfile });
  const reportDeliveries = useDashboardReportDeliveries({ brand, location, organization, scope });
  const metrics = useDashboardMetrics(data, dashboardRules.rules);
  const canAccessPage = React.useMemo(
    () => createCanAccessPage({ organization, userProfile, hasMinRole, isPlatformAdmin }),
    [hasMinRole, isPlatformAdmin, organization, userProfile]
  );
  const canManageSettings = React.useMemo(
    () => canManageDashboardOperations({ scope, userProfile, isPlatformAdmin }),
    [isPlatformAdmin, scope, userProfile]
  );
  const dataHealthScore = getDataHealthScore(metrics, data, canAccessPage);
  const dataCoverageSources = getDataCoverageSources(metrics, data, canAccessPage);
  const roleActions = React.useMemo(() => buildRoleActionPlan(metrics, scope, canAccessPage, dashboardRules.rules), [canAccessPage, dashboardRules.rules, metrics, scope]);
  const dashboardPersistence = useDashboardPersistence({
    actions: roleActions,
    brand,
    dataHealthScore,
    location,
    metrics,
    organization,
    scope,
    userProfile,
  });
  const escalations = React.useMemo(() => buildEscalations({
    actions: roleActions,
    metrics,
    reviews: dashboardPersistence.reviews,
    rules: dashboardRules.rules,
    statusMap: dashboardPersistence.statusMap,
  }), [dashboardPersistence.reviews, dashboardPersistence.statusMap, dashboardRules.rules, metrics, roleActions]);

  return (
    <div className="space-y-6">
      <DashboardHeader title={title} subtitle={subtitle} scopeLabel={scopeLabel} />
      <DataHealthBanner score={dataHealthScore} sources={dataCoverageSources} canAccessPage={canAccessPage} />
      <KpiStrip metrics={metrics} scope={scope} canAccessPage={canAccessPage} rules={dashboardRules.rules} />
      <DecisionBriefPanel metrics={metrics} scope={scope} rules={dashboardRules.rules} />
      <ForecastIntelligencePanel metrics={metrics} rules={dashboardRules.rules} canAccessPage={canAccessPage} />
      <ExecutiveReportPanel
        actions={roleActions}
        dataHealthScore={dataHealthScore}
        escalations={escalations}
        metrics={metrics}
        organization={organization}
        rules={dashboardRules.rules}
        scope={scope}
        statusMap={dashboardPersistence.statusMap}
        userProfile={userProfile}
      />
      <ScheduledReportsPanel
        actions={roleActions}
        brand={brand}
        canManage={canManageSettings}
        dataHealthScore={dataHealthScore}
        escalations={escalations}
        location={location}
        metrics={metrics}
        onSavePreferences={reportPreferences.savePreferences}
        organization={organization}
        preferences={reportPreferences.preferences}
        rules={dashboardRules.rules}
        scope={scope}
        statusMap={dashboardPersistence.statusMap}
        userProfile={userProfile}
      />
      <DashboardReportHistoryPanel
        brand={brand}
        canManage={canManageSettings}
        deliveries={reportDeliveries.deliveries}
        isLoading={reportDeliveries.isLoading}
        location={location}
        onRefresh={reportDeliveries.refreshDeliveries}
        organization={organization}
        preferences={reportPreferences.preferences}
        scope={scope}
        userProfile={userProfile}
      />
      <CollaborationStatusPanel syncState={dashboardPersistence.syncState} />
      <DashboardProductionReadinessPanel
        canManageSettings={canManageSettings}
        dataCoverageSources={dataCoverageSources}
        dataHealthScore={dataHealthScore}
        metrics={metrics}
        reportDeliveries={reportDeliveries.deliveries}
        reportPreferences={reportPreferences.preferences}
        rules={dashboardRules.rules}
        syncState={dashboardPersistence.syncState}
      />
      <DashboardRulesPanel canManage={canManageSettings} rules={dashboardRules.rules} onSaveRules={dashboardRules.saveRules} />
      <RoleActionPlanPanel
        actions={roleActions}
        metrics={metrics}
        scope={scope}
        canAccessPage={canAccessPage}
        statusMap={dashboardPersistence.statusMap}
        setStatusMap={dashboardPersistence.setStatusMap}
        onActionStatusChange={dashboardPersistence.persistActionStatus}
        onResetActions={dashboardPersistence.resetActions}
      />
      <EscalationPanel escalations={escalations} organization={organization} scope={scope} userProfile={userProfile} />
      <HandoffBriefPanel
        actions={roleActions}
        metrics={metrics}
        scope={scope}
        statusMap={dashboardPersistence.statusMap}
        dataHealthScore={dataHealthScore}
        canAccessPage={canAccessPage}
        note={dashboardPersistence.note}
        setNote={dashboardPersistence.setNote}
        onHandoffExport={dashboardPersistence.auditHandoffExport}
        syncState={dashboardPersistence.syncState}
      />
      <ManagerReviewLogPanel
        actions={roleActions}
        metrics={metrics}
        scope={scope}
        statusMap={dashboardPersistence.statusMap}
        dataHealthScore={dataHealthScore}
        canAccessPage={canAccessPage}
        reviews={dashboardPersistence.reviews}
        onSaveReview={dashboardPersistence.saveReview}
        onClearReviews={dashboardPersistence.clearReviews}
        syncState={dashboardPersistence.syncState}
      />
      <OperatingSnapshot metrics={metrics} scope={scope} rules={dashboardRules.rules} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <NeedsAttentionPanel items={metrics.recommendations} canAccessPage={canAccessPage} />
        </div>
        <div className="xl:col-span-2">
          <SalesPerformanceTable metrics={metrics} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BudgetProgressWidget metrics={metrics} />
        <GuardrailPanel metrics={metrics} canAccessPage={canAccessPage} rules={dashboardRules.rules} />
      </div>
      <BenchmarkPanel metrics={metrics} title={scope === 'location' ? 'Location Benchmarking' : scope === 'brand' ? 'Brand Benchmarking' : 'Organization Benchmarking'} />
      <SpendAndWorkflowGrid metrics={metrics} data={data} canAccessPage={canAccessPage} />
      <DataCoveragePanel metrics={metrics} data={data} canAccessPage={canAccessPage} />
    </div>
  );
}

function GroundStaffDashboard() {
  const { organization, location, userProfile } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();
  const data = useDashboardData('staff');
  const metrics = useDashboardMetrics(data);
  const enabledModules = organization?.enabled_modules || [];
  const permissions = userProfile?.permissions || {};
  const canAccessPage = React.useMemo(
    () => createCanAccessPage({ organization, userProfile, hasMinRole, isPlatformAdmin }),
    [hasMinRole, isPlatformAdmin, organization, userProfile]
  );
  const workflowCounts = metrics.workflowCounts || {};

  const tasks = [
    { module: 'Invoices', href: 'Invoices', label: 'Upload or review invoices', value: workflowCounts.invoices ?? data.invoices.length, icon: Upload },
    { module: 'Inventory', href: 'Inventory', label: 'Check inventory and counts', value: workflowCounts.lowStock ?? metrics.lowStock.length, icon: Warehouse },
    { module: 'Products', href: 'Products', label: 'Review products', value: workflowCounts.products ?? data.products.length, icon: Package },
    { module: 'AutoOrdering', href: 'AutoOrdering', label: 'Receive or place orders', value: workflowCounts.openOrders ?? metrics.openOrders.length, icon: ShoppingCart },
  ].filter((task) => {
    const explicit = permissions[task.module];
    if (explicit === 'none') return false;
    if (explicit === 'read' || explicit === 'full') return true;
    return isPageInEnabledModules(task.module, enabledModules, userProfile?.role);
  });

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="My Dashboard"
        subtitle={location?.name ? `Assigned to ${location.name}. Tasks are filtered to your module access.` : 'Tasks are filtered to your module access.'}
        scopeLabel="Ground Staff"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="My Uploads" value={workflowCounts.invoices ?? data.invoices.length} icon={Upload} tone="blue" linkTo="Invoices" linkText="Upload invoice" />
        <StatCard label="Pending Invoices" value={metrics.pendingInvoices.length} icon={Clock} tone="orange" linkTo="Invoices" linkText="View invoices" />
        <StatCard label="Assigned Modules" value={tasks.length} icon={Shield} tone="brand" />
      </div>
      <SectionCard title="My Module Tasks" description="Only actions available to your role and permissions are shown here.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tasks.map((task) => (
            <Link key={task.href} to={createPageUrl(task.href)} className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 p-3 transition-colors hover:bg-secondary/60">
              <div className="flex items-center gap-3">
                <task.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{task.label}</span>
              </div>
              <Badge variant="secondary">{task.value}</Badge>
            </Link>
          ))}
          {!tasks.length && <p className="text-sm text-muted-foreground">No module tasks are assigned yet.</p>}
        </div>
      </SectionCard>
      <StaffShiftPlanPanel tasks={tasks} metrics={metrics} />
      <NeedsAttentionPanel
        items={metrics.recommendations.filter((item) => ['Invoices', 'Inventory', 'Products', 'AutoOrdering'].some((page) => item.href?.startsWith(page)))}
        canAccessPage={canAccessPage}
      />
    </div>
  );
}

function PlatformDashboard() {
  const queryClient = useQueryClient();
  const { data: allOrgs = [] } = useAuthQuery({
    queryKey: ['platform-dashboard-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('id, name, subscription_status, plan_id, enabled_modules');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: allProfiles = [] } = useAuthQuery({
    queryKey: ['platform-dashboard-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, role, organization_id');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: allPlans = [] } = useAuthQuery({
    queryKey: ['platform-dashboard-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('id, price_monthly');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: recentLogs = [] } = useAuthQuery({
    queryKey: ['platform-dashboard-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_logs').select('id, action, table_name, created_at').order('created_at', { ascending: false }).limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel('platform-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => queryClient.invalidateQueries({ queryKey: ['platform-dashboard-orgs'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => queryClient.invalidateQueries({ queryKey: ['platform-dashboard-profiles'] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [queryClient]);

  const planPriceMap = Object.fromEntries(allPlans.map((plan) => [plan.id, Number(plan.price_monthly || 0)]));
  const platformStats = {
    totalOrgs: allOrgs.length,
    totalUsers: allProfiles.length,
    activeSubscriptions: allOrgs.filter((org) => org.subscription_status === 'active').length,
    mrr: allOrgs.reduce((sum, org) => sum + (planPriceMap[org.plan_id] || 0), 0),
  };

  return (
    <div className="space-y-6">
      <DashboardHeader title="Platform Overview" subtitle="Global SaaS health, customer activity, and revenue operations." scopeLabel="Platform Admin" />
      <KpiStrip mode="platform" platformStats={platformStats} />
      <PlatformActionQueue platformStats={platformStats} recentLogs={recentLogs} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Organization Status" description="Current platform tenant mix.">
          <div className="space-y-3">
            {[
              { label: 'Active', count: platformStats.activeSubscriptions, color: 'bg-resend-green' },
              { label: 'Trial or Pending', count: allOrgs.filter((org) => org.subscription_status !== 'active').length, color: 'bg-resend-yellow' },
              { label: 'Total', count: allOrgs.length, color: 'bg-resend-blue' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', item.color)} />
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{item.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Recent Platform Activity" description="Latest audit events across the platform.">
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium capitalize text-foreground">{log.action}</span>
                  <Badge variant="secondary" className="text-[10px]">{log.table_name}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}</span>
              </div>
            ))}
            {!recentLogs.length && <p className="py-6 text-center text-sm text-muted-foreground">No recent platform activity</p>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { organization, brand, location } = useAuth();
  const { isPlatformAdmin, isOrgOwner, isBranchManager, isLocationManager } = usePermissions();

  if (isPlatformAdmin) return <PlatformDashboard />;
  if (isOrgOwner) {
    return (
      <OrgOperatorDashboard
        scope="org"
        title={`${organization?.name || 'Organization'} Dashboard`}
        subtitle="Organization control center with daily restaurant performance and platform workflows."
        scopeLabel="Org Owner"
      />
    );
  }
  if (isBranchManager) {
    return (
      <OrgOperatorDashboard
        scope="brand"
        title={`${brand?.name || location?.name || 'Brand'} Dashboard`}
        subtitle="Brand-level platform operations plus sales, budget, labor, and inventory performance."
        scopeLabel="Brand Manager"
      />
    );
  }
  if (isLocationManager) {
    return (
      <OrgOperatorDashboard
        scope="location"
        title={`${location?.name || 'Location'} Dashboard`}
        subtitle="Daily restaurant operator dashboard for sales, pacing, AP, inventory, and labor."
        scopeLabel="Location Manager"
      />
    );
  }
  return <GroundStaffDashboard />;
}
