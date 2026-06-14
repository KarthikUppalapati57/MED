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
import { createPageUrl } from '@/utils';
import { filterByContext } from '@/lib/contextUtils';
import { getModuleForPage, isPageInEnabledModules } from '@/lib/moduleConfig';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const COLORS = ['#0d9488', '#0891b2', '#6366f1', '#f59e0b', '#ef4444', '#84cc16'];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OPERATING_TARGETS = {
  cogsPercent: 32,
  laborPercent: 28,
  primeCostPercent: 60,
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

function useLocalStatusMap(storageKey) {
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

  return [statusMap, setStatusMap];
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

function useDashboardData(scope) {
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!organization?.id;
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

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['dashboard-invoices', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Invoice.list('-created_at'),
    select: selectByScope,
    enabled,
  });

  const { data: payments = [] } = useAuthQuery({
    queryKey: ['dashboard-payments', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Payment.list('-created_at'),
    select: selectByScope,
    enabled,
  });

  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['dashboard-inventory', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Inventory.list(),
    select: selectByScope,
    enabled,
  });

  const { data: products = [] } = useAuthQuery({
    queryKey: ['dashboard-products', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.Product.list(),
    select: selectByScope,
    enabled,
  });

  const { data: salesData = [] } = useAuthQuery({
    queryKey: ['dashboard-sales', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.PosSalesData.list('-sale_date'),
    select: selectByScope,
    enabled,
  });

  const { data: shifts = [] } = useAuthQuery({
    queryKey: ['dashboard-shifts', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.EmployeeShift.list('-shift_start'),
    select: selectByScope,
    enabled,
  });

  const { data: orders = [] } = useAuthQuery({
    queryKey: ['dashboard-orders', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.AutoOrder.list('-created_at'),
    select: selectByScope,
    enabled,
  });

  const { data: wastageLogs = [] } = useAuthQuery({
    queryKey: ['dashboard-wastage', organization?.id, brand?.id, location?.id, scope],
    queryFn: () => api.entities.WastageLog.list('-created_at'),
    select: selectByScope,
    enabled,
  });

  const now = new Date();
  const periodStart = startOfMonth(now).toISOString().split('T')[0];
  const periodEnd = endOfMonth(now).toISOString().split('T')[0];

  const { data: dashboardSummary = null } = useAuthQuery({
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
    enabled: enabled && (scope === 'org' || (scope === 'brand' && !!brand?.id) || ((scope === 'location' || scope === 'staff') && !!location?.id)),
    retry: false,
  });

  const { data: budgetTargets = [] } = useAuthQuery({
    queryKey: ['dashboard-budget-targets', organization?.id, brand?.id, location?.id, scope, periodStart, periodEnd],
    queryFn: () => api.entities.BudgetTarget.filter({ organization_id: organization?.id }),
    select: React.useCallback((data) => selectByScope(data).filter((target) => target.period_start === periodStart && target.period_end === periodEnd), [periodEnd, periodStart, selectByScope]),
    enabled,
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
    if (!enabled) return undefined;
    const channel = supabase.channel(`dashboard-${scope}-realtime`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-invoices'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-inventory'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_sales_data' }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_targets' }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-budget-targets'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_shifts' }, () => queryClient.invalidateQueries({ queryKey: ['dashboard-shifts'] }))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [enabled, queryClient, scope]);

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

function useDashboardMetrics(data) {
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
    if (laborPercent > 28) recommendations.push({ tone: 'red', title: `Labor at ${laborPercent.toFixed(1)}%`, body: 'Review upcoming shifts against forecasted sales.', href: 'Labor' });
    if (!monthSales) recommendations.push({ tone: 'blue', title: 'POS sales not flowing yet', body: 'Connect or map POS data to unlock daily sales benchmarking.', href: 'RestaurantSetup?tab=pos' });
    if (primeCostPercent > OPERATING_TARGETS.primeCostPercent) recommendations.push({ tone: 'red', title: `Prime cost at ${plainPercent(primeCostPercent)}`, body: 'COGS plus labor is above the 60% operating guardrail.', href: 'Performance' });

    const calculated = {
      budgetPacing,
      cogsPercent,
      dailyRows,
      grossMarginPercent,
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
    if (summaryCogsPercent > OPERATING_TARGETS.cogsPercent) {
      guardrailRecommendations.push({ tone: 'red', title: `COGS at ${plainPercent(summaryCogsPercent)}`, body: 'Food and controllable costs are above the 32% target.', href: 'Performance' });
    }
    if (summaryLaborPercent > OPERATING_TARGETS.laborPercent) {
      guardrailRecommendations.push({ tone: 'orange', title: `Labor at ${plainPercent(summaryLaborPercent)}`, body: 'Scheduled or logged labor is above the 28% target.', href: 'Labor' });
    }
    if (summaryPrimeCostPercent > OPERATING_TARGETS.primeCostPercent) {
      guardrailRecommendations.push({ tone: 'red', title: `Prime cost at ${plainPercent(summaryPrimeCostPercent)}`, body: 'COGS plus labor is above the 60% operating guardrail.', href: 'Performance' });
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
  }, [data]);
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

function KpiStrip({ metrics, platformStats, mode = 'operator', scope = 'org', canAccessPage = () => true }) {
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
      { label: 'Prime Cost', value: plainPercent(metrics.primeCostPercent), icon: Activity, tone: metrics.primeCostPercent > OPERATING_TARGETS.primeCostPercent ? 'red' : 'green', subtext: `Target ${plainPercent(OPERATING_TARGETS.primeCostPercent)}` },
      { label: 'Open Orders', value: metrics.openOrders.length, icon: ShoppingCart, tone: metrics.openOrders.length ? 'blue' : 'green', linkTo: 'AutoOrdering', linkText: 'Open', requiredPage: 'AutoOrdering' },
      { label: 'Low Stock', value: metrics.lowStock.length, icon: Warehouse, tone: metrics.lowStock.length ? 'orange' : 'green', linkTo: 'Inventory', linkText: 'Review', requiredPage: 'Inventory' },
    ],
    location: [
      { label: "Today's Sales", value: currency(metrics.today), icon: DollarSign, tone: 'green', subtext: `${currency(metrics.weekSales)} week-to-date` },
      { label: 'COGS', value: plainPercent(metrics.cogsPercent), icon: Package, tone: metrics.cogsPercent > OPERATING_TARGETS.cogsPercent ? 'red' : 'blue', subtext: `Target ${plainPercent(OPERATING_TARGETS.cogsPercent)}` },
      { label: 'Labor', value: plainPercent(metrics.laborPercent), icon: Users, tone: metrics.laborPercent > OPERATING_TARGETS.laborPercent ? 'orange' : 'purple', subtext: `Target ${plainPercent(OPERATING_TARGETS.laborPercent)}`, requiredPage: 'Labor' },
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

function BudgetPacingPanel({ metrics }) {
  const hasBudgetData = metrics.budgetPacing.some((item) => Number(item.actual || 0) > 0 || Number(item.target || 0) > 0);

  return (
    <SectionCard title="Budget Pacing" description="Targets, actual spend, remaining budget, and over/under signal for this period.">
      {!hasBudgetData && (
        <EmptyState
          icon={BarChart3}
          title="No budget targets or actuals yet"
          description="Set period targets in Performance so this panel can show pacing by Sales, COGS, Labor, and Prime Cost."
          actionHref="Performance"
          actionLabel="Set budget targets"
        />
      )}
      {hasBudgetData && (
      <div className="space-y-4">
        {metrics.budgetPacing.slice(0, 8).map((item) => {
          const progress = item.target ? Math.min((item.actual / item.target) * 100, 140) : 0;
          return (
            <div key={item.category} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.category}</p>
                  <p className="text-xs text-muted-foreground">
                    Actual {currency(item.actual)} / Target {currency(item.target)}
                  </p>
                </div>
                <Badge className={item.isGood ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-red/10 text-resend-red'}>
                  {item.isGood ? 'On track' : 'Needs review'}
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
              <p className={cn('text-xs', item.remaining >= 0 ? 'text-muted-foreground' : 'text-resend-red')}>
                {item.remaining >= 0 ? `${currency(item.remaining)} remaining` : `${currency(Math.abs(item.remaining))} over`} ({percent(item.pacing)})
              </p>
            </div>
          );
        })}
      </div>
      )}
    </SectionCard>
  );
}

function OperatingSnapshot({ metrics, scope }) {
  const rows = [
    { label: scope === 'location' ? "Today's Sales" : 'Period Sales', value: scope === 'location' ? currency(metrics.today) : currency(metrics.monthSales), helper: `${currency(metrics.weekSales)} WTD` },
    { label: 'Projected Cash Pressure', value: currency(metrics.unpaid * -1), helper: `${currency(metrics.unpaid)} unpaid AP` },
    { label: 'Prime Cost', value: plainPercent(metrics.primeCostPercent), helper: `${plainPercent(targetDelta(metrics.primeCostPercent, OPERATING_TARGETS.primeCostPercent))} vs target` },
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

function GuardrailPanel({ metrics, canAccessPage = () => true }) {
  const guardrails = [
    { label: 'COGS', actual: metrics.cogsPercent, target: OPERATING_TARGETS.cogsPercent, href: 'Performance' },
    { label: 'Labor', actual: metrics.laborPercent, target: OPERATING_TARGETS.laborPercent, href: 'Labor' },
    { label: 'Prime Cost', actual: metrics.primeCostPercent, target: OPERATING_TARGETS.primeCostPercent, href: 'Performance' },
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

function getRoleActionLabel(scope) {
  if (scope === 'brand') return 'Brand manager';
  if (scope === 'location') return 'Location manager';
  return 'Org owner';
}

function buildRoleActionPlan(metrics, scope, canAccessPage = () => true) {
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

  if (metrics.cogsPercent > OPERATING_TARGETS.cogsPercent && canAccessPage('Performance')) {
    items.push({
      title: 'Review COGS drivers',
      body: `COGS is ${plainPercent(targetDelta(metrics.cogsPercent, OPERATING_TARGETS.cogsPercent))} over target. Compare invoice categories and recipe/menu cost changes.`,
      href: 'Performance',
      owner,
      due: 'Today',
      priority: 'Critical',
      tone: 'red',
    });
  }

  if (metrics.laborPercent > OPERATING_TARGETS.laborPercent && canAccessPage('Labor')) {
    items.push({
      title: 'Tighten labor pacing',
      body: `Labor is ${plainPercent(targetDelta(metrics.laborPercent, OPERATING_TARGETS.laborPercent))} over target. Review schedule coverage against forecasted sales.`,
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

function DecisionBriefPanel({ metrics, scope }) {
  const salesSignal = metrics.weekVsLastWeek >= 0
    ? `${percent(metrics.weekVsLastWeek)} vs last week`
    : `${percent(metrics.weekVsLastWeek)} vs last week`;
  const riskCount = [
    metrics.cogsPercent > OPERATING_TARGETS.cogsPercent,
    metrics.laborPercent > OPERATING_TARGETS.laborPercent,
    metrics.primeCostPercent > OPERATING_TARGETS.primeCostPercent,
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

function RoleActionPlanPanel({ metrics, scope, canAccessPage = () => true, statusMap = {}, setStatusMap }) {
  const actions = buildRoleActionPlan(metrics, scope, canAccessPage);
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
    setStatusMap?.((current) => ({
      ...current,
      [key]: current[key] === 'done' ? 'open' : 'done',
    }));
  };

  return (
    <SectionCard
      title="Daily Action Plan"
      description="Role-based actions converted from the dashboard signals."
      action={(
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setStatusMap?.({})}>
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

function HandoffBriefPanel({ metrics, scope, statusMap = {}, dataHealthScore, canAccessPage = () => true }) {
  const actions = buildRoleActionPlan(metrics, scope, canAccessPage);
  const noteKey = `dashboard-handoff-note:${scope}:${todayKey()}`;
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    setNote(window.localStorage.getItem(noteKey) || '');
  }, [noteKey]);

  React.useEffect(() => {
    window.localStorage.setItem(noteKey, note);
  }, [note, noteKey]);

  const completedCount = actions.filter((item) => statusMap[actionId(item.title)] === 'done').length;
  const openCount = actions.length - completedCount;
  const handoffText = createHandoffText({ metrics, scope, actions, statusMap, dataHealthScore, note });

  const copyHandoff = async () => {
    try {
      await navigator.clipboard.writeText(handoffText);
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
    toast.success('Daily handoff downloaded');
  };

  return (
    <SectionCard
      title="Daily Handoff"
      description="Copy or download a manager-ready summary of today's operating state."
      action={(
        <div className="flex flex-wrap gap-2">
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
          onChange={(event) => setNote(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          placeholder="Add shift context, vendor issues, staffing notes, or what the next manager should check first."
        />
      </div>
    </SectionCard>
  );
}

function ManagerReviewLogPanel({ metrics, scope, statusMap = {}, dataHealthScore, canAccessPage = () => true }) {
  const actions = buildRoleActionPlan(metrics, scope, canAccessPage);
  const historyKey = `dashboard-review-log:${scope}`;
  const noteKey = `dashboard-handoff-note:${scope}:${todayKey()}`;
  const [reviews, setReviews] = React.useState([]);

  React.useEffect(() => {
    try {
      setReviews(JSON.parse(window.localStorage.getItem(historyKey) || '[]'));
    } catch {
      setReviews([]);
    }
  }, [historyKey]);

  React.useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(reviews));
  }, [historyKey, reviews]);

  const completed = actions.filter((item) => statusMap[actionId(item.title)] === 'done');
  const open = actions.filter((item) => statusMap[actionId(item.title)] !== 'done');
  const latestPriorReview = reviews.find((review) => review.date !== todayKey());
  const carryoverItems = latestPriorReview?.openActions || [];

  const saveReview = () => {
    const managerNote = window.localStorage.getItem(noteKey) || '';
    const snapshot = {
      id: `${scope}-${Date.now()}`,
      date: todayKey(),
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
      note: managerNote.trim(),
    };

    setReviews((current) => [snapshot, ...current.filter((review) => review.date !== todayKey())].slice(0, 7));
    toast.success('Manager review saved');
  };

  const clearReviews = () => {
    setReviews([]);
    toast.success('Review log cleared');
  };

  return (
    <SectionCard
      title="Manager Review Log"
      description="Save daily review snapshots and keep prior open items visible for follow-up."
      action={(
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={saveReview}>
            <Save className="h-4 w-4" />
            Save Review
          </Button>
          {!!reviews.length && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={clearReviews}>
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
  const { organization, userProfile } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();
  const data = useDashboardData(scope);
  const metrics = useDashboardMetrics(data);
  const canAccessPage = React.useMemo(
    () => createCanAccessPage({ organization, userProfile, hasMinRole, isPlatformAdmin }),
    [hasMinRole, isPlatformAdmin, organization, userProfile]
  );
  const dataHealthScore = getDataHealthScore(metrics, data, canAccessPage);
  const dataCoverageSources = getDataCoverageSources(metrics, data, canAccessPage);
  const [actionStatusMap, setActionStatusMap] = useLocalStatusMap(`dashboard-actions:${scope}:${todayKey()}`);

  return (
    <div className="space-y-6">
      <DashboardHeader title={title} subtitle={subtitle} scopeLabel={scopeLabel} />
      <DataHealthBanner score={dataHealthScore} sources={dataCoverageSources} canAccessPage={canAccessPage} />
      <KpiStrip metrics={metrics} scope={scope} canAccessPage={canAccessPage} />
      <DecisionBriefPanel metrics={metrics} scope={scope} />
      <RoleActionPlanPanel metrics={metrics} scope={scope} canAccessPage={canAccessPage} statusMap={actionStatusMap} setStatusMap={setActionStatusMap} />
      <HandoffBriefPanel metrics={metrics} scope={scope} statusMap={actionStatusMap} dataHealthScore={dataHealthScore} canAccessPage={canAccessPage} />
      <ManagerReviewLogPanel metrics={metrics} scope={scope} statusMap={actionStatusMap} dataHealthScore={dataHealthScore} canAccessPage={canAccessPage} />
      <OperatingSnapshot metrics={metrics} scope={scope} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <NeedsAttentionPanel items={metrics.recommendations} canAccessPage={canAccessPage} />
        </div>
        <div className="xl:col-span-2">
          <SalesPerformanceTable metrics={metrics} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BudgetPacingPanel metrics={metrics} />
        <GuardrailPanel metrics={metrics} canAccessPage={canAccessPage} />
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
        <StatCard label="My Uploads" value={data.invoices.length} icon={Upload} tone="blue" linkTo="Invoices" linkText="Upload invoice" />
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
