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
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Package,
  Shield,
  ShoppingCart,
  TrendingUp,
  Upload,
  Users,
  Warehouse,
} from 'lucide-react';
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
import { isPageInEnabledModules } from '@/lib/moduleConfig';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const COLORS = ['#0d9488', '#0891b2', '#6366f1', '#f59e0b', '#ef4444', '#84cc16'];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function currency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(Number(value || 0)) < 1000 ? 2 : 0,
    maximumFractionDigits: Math.abs(Number(value || 0)) < 1000 ? 2 : 0,
  })}`;
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return '0%';
  return `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
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

    const calculated = {
      budgetPacing,
      cogsPercent,
      dailyRows,
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
      cogsPercent: Number(kpis.cogsPercent || 0),
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
      laborPercent: Number(kpis.laborPercent || 0),
      lastWeekSales: Number(kpis.salesLastWeek || 0),
      lastYearSales: Number(kpis.salesLastYear || 0),
      lowStock: Array.from({ length: Number(kpis.lowStockItems || workflowCounts.lowStock || 0) }),
      monthSales: Number(kpis.salesPeriod || 0),
      openOrders: Array.from({ length: Number(kpis.openOrders || workflowCounts.openOrders || 0) }),
      pendingInvoices: Array.from({ length: Number(kpis.pendingInvoices || 0) }),
      primeCostPercent: Number(kpis.primeCostPercent || 0),
      recommendations: (summary.alerts || calculated.recommendations).map((item) => ({
        tone: item.tone || 'blue',
        title: item.title,
        body: item.body,
        href: item.href,
      })),
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

function DataHealthBanner({ score = 80 }) {
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
                POS sales, invoice coding, inventory counts, and labor data feed the operating dashboard. Complete setup to unlock stronger AvT and benchmark recommendations.
              </p>
            </div>
          </div>
          <Link to={createPageUrl('RestaurantSetup') + '?tab=pos'}>
            <Button className="bg-brand text-primary-foreground hover:opacity-90">Complete Onboarding</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiStrip({ metrics, platformStats, mode = 'operator' }) {
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

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Week-To-Date Sales" value={currency(metrics.weekSales)} icon={TrendingUp} tone="green" subtext={`${percent(metrics.weekVsLastWeek)} vs last week`} />
      <StatCard label="COGS" value={`${metrics.cogsPercent.toFixed(1)}%`} icon={Package} tone={metrics.cogsPercent > 32 ? 'red' : 'blue'} subtext={`${currency(metrics.invoiceSpend)} period spend`} />
      <StatCard label="Labor" value={`${metrics.laborPercent.toFixed(1)}%`} icon={Users} tone={metrics.laborPercent > 28 ? 'orange' : 'purple'} subtext={`${currency(metrics.laborCost)} scheduled/logged`} />
      <StatCard label="Needs Attention" value={metrics.recommendations.length} icon={AlertTriangle} tone={metrics.recommendations.length ? 'red' : 'green'} subtext={`${metrics.pendingInvoices.length} invoices, ${metrics.lowStock.length} low stock`} />
    </div>
  );
}

function NeedsAttentionPanel({ items }) {
  const visible = items.length ? items : [{ tone: 'green', title: 'No urgent dashboard alerts', body: 'Core workflows look clear based on the data currently available.' }];
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
  return (
    <SectionCard title="Sales Performance" description="MarginEdge-style current week comparison against last week and last year.">
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
    </SectionCard>
  );
}

function BudgetPacingPanel({ metrics }) {
  return (
    <SectionCard title="Budget Pacing" description="Targets, actual spend, remaining budget, and over/under signal for this period.">
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
    </SectionCard>
  );
}

function SpendAndWorkflowGrid({ metrics, data, showWorkflow = true }) {
  const pieData = metrics.spendByCategory.length ? metrics.spendByCategory : [{ name: 'No spend coded', value: 1, color: '#e5e7eb' }];
  const workflowCounts = metrics.workflowCounts || {};
  const workflows = [
    { label: 'Invoices', value: workflowCounts.invoices ?? data.invoices.length, href: 'Invoices', icon: FileText },
    { label: 'Payments', value: workflowCounts.payments ?? data.payments.length, href: 'Payments', icon: CreditCard },
    { label: 'Open Orders', value: workflowCounts.openOrders ?? metrics.openOrders.length, href: 'AutoOrdering', icon: ShoppingCart },
    { label: 'Low Stock', value: workflowCounts.lowStock ?? metrics.lowStock.length, href: 'Inventory', icon: Warehouse },
    { label: 'Products', value: workflowCounts.products ?? data.products.length, href: 'Products', icon: Package },
    { label: 'Waste Cost', value: currency(workflowCounts.wasteCost ?? metrics.wastageCost), href: 'Inventory?tab=wastage', icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionCard title="Spend by Category" description="Invoice spend grouped by coded category." className="xl:col-span-1">
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
      </SectionCard>

      {showWorkflow && (
        <SectionCard title="Operational Workflows" description="Live platform work that supports the performance dashboard." className="xl:col-span-2">
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

function OrgOperatorDashboard({ scope, title, subtitle, scopeLabel }) {
  const data = useDashboardData(scope);
  const metrics = useDashboardMetrics(data);

  return (
    <div className="space-y-6">
      <DashboardHeader title={title} subtitle={subtitle} scopeLabel={scopeLabel} />
      <DataHealthBanner />
      <KpiStrip metrics={metrics} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <NeedsAttentionPanel items={metrics.recommendations} />
        </div>
        <div className="xl:col-span-2">
          <SalesPerformanceTable metrics={metrics} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BudgetPacingPanel metrics={metrics} />
        <BenchmarkPanel metrics={metrics} title={scope === 'location' ? 'Location Benchmarking' : scope === 'brand' ? 'Brand Benchmarking' : 'Organization Benchmarking'} />
      </div>
      <SpendAndWorkflowGrid metrics={metrics} data={data} />
    </div>
  );
}

function GroundStaffDashboard() {
  const { organization, location, userProfile } = useAuth();
  const data = useDashboardData('staff');
  const metrics = useDashboardMetrics(data);
  const enabledModules = organization?.enabled_modules || [];
  const permissions = userProfile?.permissions || {};

  const tasks = [
    { module: 'Invoices', href: 'Invoices', label: 'Upload or review invoices', value: data.invoices.length, icon: Upload },
    { module: 'Inventory', href: 'Inventory', label: 'Check inventory and counts', value: metrics.lowStock.length, icon: Warehouse },
    { module: 'Products', href: 'Products', label: 'Review products', value: data.products.length, icon: Package },
    { module: 'AutoOrdering', href: 'AutoOrdering', label: 'Receive or place orders', value: metrics.openOrders.length, icon: ShoppingCart },
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
      <NeedsAttentionPanel items={metrics.recommendations.filter((item) => ['Invoices', 'Inventory', 'Products', 'AutoOrdering'].some((page) => item.href?.startsWith(page)))} />
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
