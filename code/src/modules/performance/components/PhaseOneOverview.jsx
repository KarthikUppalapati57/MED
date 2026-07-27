import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChefHat,
  CreditCard,
  FileText,
  Package,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { filterByContext } from '@/lib/contextUtils';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#14b8a6', '#f97316', '#3b82f6', '#e11d48', '#8b5cf6', '#22c55e'];
const CHART_GRID = 'hsl(var(--border) / 0.42)';
const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const PREMIUM_TOOLTIP = {
  border: '1px solid hsl(var(--border) / 0.72)',
  borderRadius: 8,
  background: 'hsl(var(--card) / 0.96)',
  boxShadow: '0 18px 45px -28px rgba(0,0,0,0.55)',
};

function toDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function inRange(value, start, end) {
  const key = toDateKey(value);
  return key && key >= start && key <= end;
}

function sum(rows, selector) {
  return (rows || []).reduce((total, row) => total + Number(selector(row) || 0), 0);
}

function pctOf(part, total) {
  const t = Number(total) || 0;
  if (!t) return 0;
  return (Number(part || 0) / t) * 100;
}

function formatPeriodDate(value) {
  if (!value) return 'Not set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function compactMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 1 : 0,
    notation: n >= 10000 ? 'compact' : 'standard',
  }).format(n);
}

function StatCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  const toneClass = {
    default: 'bg-muted/40 text-foreground',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    risk: 'bg-rose-50 text-rose-700',
  }[tone] || 'bg-muted/40 text-foreground';

  return (
    <Card className="performance-chart-card overflow-hidden" string="progress">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
          </div>
          <div className={`shrink-0 rounded-md p-2 ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniModule({ icon: Icon, label, value, detail, progress, tone = 'default' }) {
  const badgeClass = tone === 'risk'
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : tone === 'warn'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <div className="glass-card hover-lift rounded-lg border border-border/50 p-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{label}</span>
        </div>
        <Badge variant="outline" className={badgeClass}>{value}</Badge>
      </div>
      <Progress value={Math.min(100, Math.max(0, Number(progress) || 0))} className="h-2 mt-3" />
      <p className="text-xs text-muted-foreground mt-2 truncate">{detail}</p>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="h-full min-h-[220px] flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {children}
    </div>
  );
}

export default function PhaseOneOverview({
  periodStart,
  periodEnd,
  onOpenTab,
}) {
  const { organization, brand, location } = useAuth();
  const scopedFilter = React.useCallback(
    (data) => filterByContext(data || [], { organization, brand, location }),
    [organization, brand, location]
  );

  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['phase1_overview_category_report', organization?.id, location?.id, periodStart, periodEnd],
        queryFn: () => api.reports.getCategoryPerformanceReport({
          organizationId: organization?.id,
          locationIds: location?.id ? [location.id] : null,
          dateFrom: periodStart,
          dateTo: periodEnd,
        }),
        enabled: !!organization?.id && !!periodStart && !!periodEnd,
      },
      {
        queryKey: ['phase1_overview_invoices', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
        queryFn: async () => {
          const startTs = `${periodStart}T00:00:00.000Z`;
          const endTs = `${periodEnd}T23:59:59.999Z`;
          const { data, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('organization_id', organization?.id)
            .is('deleted_at', null)
            .or(`and(invoice_date.gte.${periodStart},invoice_date.lte.${periodEnd}),and(invoice_date.is.null,created_at.gte.${startTs},created_at.lte.${endTs})`)
            .order('invoice_date', { ascending: false, nullsFirst: false })
            .limit(5000);
          if (error) throw error;
          return data || [];
        },
        select: scopedFilter,
        enabled: !!organization?.id && !!periodStart && !!periodEnd,
      },
      {
        queryKey: ['phase1_overview_payments', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
        queryFn: async () => {
          const startTs = `${periodStart}T00:00:00.000Z`;
          const endTs = `${periodEnd}T23:59:59.999Z`;
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('organization_id', organization?.id)
            .is('deleted_at', null)
            .or(`and(payment_date.gte.${periodStart},payment_date.lte.${periodEnd}),and(payment_date.is.null,created_at.gte.${startTs},created_at.lte.${endTs})`)
            .order('payment_date', { ascending: false, nullsFirst: false })
            .limit(5000);
          if (error) throw error;
          return data || [];
        },
        select: scopedFilter,
        enabled: !!organization?.id && !!periodStart && !!periodEnd,
      },
      {
        queryKey: ['phase1_overview_products', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Product.list('-updated_at', { limit: 5000 }),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_inventory', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Inventory.list('-updated_at', { limit: 5000 }),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_recipes', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Recipe.list('-updated_at', { limit: 5000 }),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_price_movers', organization?.id, location?.id, periodStart, periodEnd],
        queryFn: () => api.reports.getPriceMoversReport({
          organizationId: organization?.id,
          locationIds: location?.id ? [location.id] : null,
          dateFrom: periodStart,
          dateTo: periodEnd,
        }),
        enabled: !!organization?.id && !!periodStart && !!periodEnd,
      },
    ],
  });

  const categoryReport = results[0]?.data || {};
  const invoices = (results[1]?.data || []).filter((row) =>
    inRange(row.invoice_date || row.created_at, periodStart, periodEnd)
  );
  const payments = (results[2]?.data || []).filter((row) =>
    inRange(row.payment_date || row.created_at, periodStart, periodEnd)
  );
  const products = results[3]?.data || [];
  const inventory = results[4]?.data || [];
  const recipes = results[5]?.data || [];
  const priceMoversReport = results[6]?.data || {};
  const isLoading = results.some((query) => query.isLoading);
  const queryErrors = results
    .map((query, index) => (query?.isError ? {
      key: ['Category report', 'Invoices', 'Payments', 'Products', 'Inventory', 'Recipes', 'Price movers'][index],
    } : null))
    .filter(Boolean);

  const analytics = useMemo(() => {
    const summary = categoryReport.summary || {};
    const tableRows = categoryReport.tableRows || [];
    const totalSpend = Number(summary.totalSpend || 0);
    const previousSpend = Number(summary.previousSpend || 0);
    const spendChange = previousSpend ? ((totalSpend - previousSpend) / Math.abs(previousSpend)) * 100 : null;

    const budgetRows = tableRows
      .filter((row) => row.budget != null || Number(row.currentSpend || 0) > 0)
      .slice(0, 7)
      .map((row) => ({
        category: row.category,
        actual: Number(row.currentSpend || 0),
        budget: Number(row.budget ?? row.currentSpend ?? 0),
        variance: row.budget == null ? null : Number(row.budgetVariance || 0),
      }));

    const spendTrendMap = new Map();
    for (const point of categoryReport.trend || []) {
      const bucket = point.bucket;
      const prev = spendTrendMap.get(bucket) || { bucket, bucketStart: point.bucketStart, spend: 0 };
      prev.spend += Number(point.spend || 0);
      spendTrendMap.set(bucket, prev);
    }
    const spendTrend = [...spendTrendMap.values()]
      .sort((a, b) => String(a.bucketStart).localeCompare(String(b.bucketStart)))
      .slice(-12);

    const paymentCompleted = sum(payments, (p) =>
      ['completed', 'paid'].includes(String(p.status || '').toLowerCase()) ? p.amount : 0
    );
    const paymentScheduled = sum(payments, (p) =>
      ['pending', 'processing', 'scheduled'].includes(String(p.status || '').toLowerCase()) ? p.amount : 0
    );
    const paymentFailed = sum(payments, (p) =>
      ['failed', 'cancelled', 'refunded'].includes(String(p.status || '').toLowerCase()) ? p.amount : 0
    );
    const invoiceUnpaid = sum(invoices, (i) =>
      ['unpaid', 'partial', 'processing'].includes(String(i.payment_status || '').toLowerCase()) ? i.total_amount : 0
    );
    const paymentExposure = paymentScheduled + paymentFailed + invoiceUnpaid;
    const paymentData = [
      { name: 'Paid', value: paymentCompleted },
      { name: 'Scheduled', value: paymentScheduled },
      { name: 'Unpaid', value: invoiceUnpaid },
      { name: 'Failed', value: paymentFailed },
    ].filter((row) => row.value > 0);

    const categorizedProducts = products.filter((p) => String(p.category || p.accounting_category || '').trim()).length;
    const productCoverage = products.length ? pctOf(categorizedProducts, products.length) : 0;
    const priceMovers = priceMoversReport.ranking || priceMoversReport.tableRows || [];

    const inventoryValue = sum(inventory, (row) => row.current_value);
    const lowStock = inventory.filter((row) => {
      const qty = Number(row.current_quantity || 0);
      const reorder = Number(row.reorder_point ?? row.par_level ?? 0);
      return reorder > 0 && qty <= reorder;
    }).length;
    const inventoryRisk = inventory.length ? pctOf(lowStock, inventory.length) : 0;

    const recipeRows = recipes.map((recipe) => {
      const cost = Number(recipe.cost_per_serving || recipe.total_cost || 0);
      const price = Number(recipe.selling_price || recipe.suggested_price || 0);
      const targetMargin = Number(recipe.target_margin_percent || 0);
      const margin = price > 0 ? ((price - cost) / price) * 100 : null;
      return { ...recipe, cost, price, margin, targetMargin };
    });
    const recipeMarginRisks = recipeRows.filter((recipe) =>
      recipe.margin != null && recipe.targetMargin > 0 && recipe.margin < recipe.targetMargin
    );
    const averageRecipeMargin = recipeRows.filter((r) => r.margin != null).length
      ? recipeRows.filter((r) => r.margin != null).reduce((acc, r) => acc + r.margin, 0) / recipeRows.filter((r) => r.margin != null).length
      : 0;

    const categoryDistribution = (categoryReport.distribution || []).slice(0, 6).map((row) => ({
      name: row.category,
      value: Number(row.spend || 0),
    }));

    const actionItems = [
      ...(Number(summary.categoriesOverBudget || 0) > 0
        ? [{
            tone: 'risk',
            title: `${summary.categoriesOverBudget} categories over budget`,
            body: 'Open Spend & Products to inspect invoice allocations, vendors, and product movement.',
            tab: 'spend_products',
          }]
        : []),
      ...(invoiceUnpaid > 0
        ? [{
            tone: 'warn',
            title: `${compactMoney(invoiceUnpaid)} unpaid invoice exposure`,
            body: 'Review unpaid invoice obligations separately from scheduled, processing, failed, cancelled, or refunded payment attempts.',
            tab: null,
          }]
        : []),
      ...(lowStock > 0
        ? [{
            tone: 'warn',
            title: `${lowStock} inventory items near reorder`,
            body: 'Open Inventory & Recipes to compare stock, usage, and recipe margin pressure.',
            tab: 'inventory_recipes',
          }]
        : []),
      ...(recipeMarginRisks.length > 0
        ? [{
            tone: 'risk',
            title: `${recipeMarginRisks.length} recipes below target margin`,
            body: 'Review recipe costs and products with recent price movement.',
            tab: null,
          }]
        : []),
      ...(priceMovers.length > 0
        ? [{
            tone: 'warn',
            title: `${priceMovers.length} product price movers`,
            body: 'Open Spend & Products to identify vendor item increases.',
            tab: 'spend_products',
          }]
        : []),
    ].slice(0, 5);

    return {
      summary,
      tableRows,
      totalSpend,
      spendChange,
      budgetRows,
      spendTrend,
      paymentData,
      paymentExposure,
      productCoverage,
      priceMovers,
      inventoryValue,
      lowStock,
      inventoryRisk,
      recipeMarginRisks,
      averageRecipeMargin,
      categoryDistribution,
      actionItems,
      moduleSignals: [
        {
          label: 'Invoices',
          icon: FileText,
          value: compactMoney(totalSpend),
          detail: `${summary.invoiceCount || 0} invoices contributing allocated spend`,
          progress: Math.min(100, Number(summary.activeCategoryCount || 0) * 12),
          tone: Number(summary.categoriesOverBudget || 0) > 0 ? 'warn' : 'good',
        },
        {
          label: 'Payments',
          icon: CreditCard,
          value: compactMoney(paymentExposure),
          detail: 'separate invoice and payment status exposure',
          progress: paymentExposure ? 68 : 100,
          tone: paymentExposure ? 'warn' : 'good',
        },
        {
          label: 'Products',
          icon: Package,
          value: `${Math.round(productCoverage)}%`,
          detail: `${categorizedProducts}/${products.length || 0} categorized`,
          progress: productCoverage,
          tone: productCoverage >= 80 ? 'good' : 'warn',
        },
        {
          label: 'Inventory',
          icon: Boxes,
          value: String(lowStock),
          detail: `${compactMoney(inventoryValue)} current-state value`,
          progress: 100 - inventoryRisk,
          tone: lowStock ? 'warn' : 'good',
        },
        {
          label: 'Recipes',
          icon: ChefHat,
          value: String(recipeMarginRisks.length),
          detail: `${formatPct(averageRecipeMargin)} current avg margin`,
          progress: recipes.length ? 100 - pctOf(recipeMarginRisks.length, recipes.length) : 0,
          tone: recipeMarginRisks.length ? 'risk' : 'good',
        },
      ],
    };
  }, [categoryReport, invoices, payments, products, inventory, recipes, priceMoversReport]);

  const budgetEmpty = !isLoading && analytics.budgetRows.length === 0;
  const trendEmpty = !isLoading && analytics.spendTrend.length === 0;
  const distributionEmpty = !isLoading && analytics.categoryDistribution.length === 0;
  const paymentEmpty = !isLoading && analytics.paymentData.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Performance analytics</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Performance Command Center</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            One visual view for Invoices, Payments, Products, Inventory, and Recipes.
          </p>
        </div>
        <div className="glass-card border border-border/50 rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2 w-fit">
          <CalendarDays className="h-4 w-4" />
          <span>{formatPeriodDate(periodStart)} - {formatPeriodDate(periodEnd)}</span>
        </div>
      </div>

      {queryErrors.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-900">Some analytics did not load</p>
                <p className="text-xs text-amber-800 mt-1">
                  The dashboard is showing all available data and keeping failed sources isolated.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {queryErrors.map((error) => (
                  <Badge key={error.key} variant="outline" className="bg-card/80 border-amber-300 text-amber-900">
                    {error.key}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Invoice category spend"
          value={isLoading ? '...' : compactMoney(analytics.totalSpend)}
          detail={analytics.spendChange == null ? 'Current period actuals' : `${formatPct(analytics.spendChange)} vs comparison period`}
          tone={analytics.spendChange > 0 ? 'warn' : 'good'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Over budget"
          value={isLoading ? '...' : String(analytics.summary?.categoriesOverBudget ?? 0)}
          detail="Invoice/product categories only"
          tone={Number(analytics.summary?.categoriesOverBudget || 0) > 0 ? 'risk' : 'good'}
        />
        <StatCard
          icon={CreditCard}
          label="Payment exposure"
          value={isLoading ? '...' : compactMoney(analytics.paymentExposure)}
          detail="Invoice obligations and payment attempts kept separate"
          tone={analytics.paymentExposure > 0 ? 'warn' : 'good'}
        />
        <StatCard
          icon={ChefHat}
          label="Recipe margin risks"
          value={isLoading ? '...' : String(analytics.recipeMarginRisks.length)}
          detail={`${recipes.length || 0} recipes in scope`}
          tone={analytics.recipeMarginRisks.length ? 'risk' : 'good'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        {analytics.moduleSignals.map((signal) => (
          <MiniModule key={signal.label} {...signal} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 performance-chart-card overflow-hidden" string="progress">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Budget vs actual category spend</CardTitle>
                <CardDescription>Actuals are invoice allocation spend. Budgets are saved product/invoice category targets.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenTab?.('spend_products')}>
                Open Spend & Products
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {budgetEmpty ? (
              <div className="h-[320px]">
                <EmptyState>No saved category budget or invoice allocation spend found for this period.</EmptyState>
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.budgetRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={CHART_GRID} />
                    <XAxis dataKey="category" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={PREMIUM_TOOLTIP} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} formatter={(value) => formatMoney(value, 'USD')} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <defs>
                      <linearGradient id="budgetBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#64748b" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="actualBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#0f766e" />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="budget" name="Budget" fill="url(#budgetBarGradient)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                    <Bar dataKey="actual" name="Actual" fill="url(#actualBarGradient)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="performance-chart-card overflow-hidden" string="progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Action Signals</CardTitle>
            <CardDescription>Source loaded successfully; empty and failed sources are shown separately.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.actionItems.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center">
                No urgent performance signals for this period.
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.actionItems.map((item) => (
                  <div key={item.title} className="rounded-lg border border-border/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.body}</p>
                      </div>
                      <Badge variant={item.tone === 'risk' ? 'destructive' : 'secondary'}>
                        {item.tone === 'risk' ? 'Risk' : 'Watch'}
                      </Badge>
                    </div>
                    {item.tab ? (
                      <Button type="button" variant="link" size="sm" className="px-0 mt-2 h-auto" onClick={() => onOpenTab?.(item.tab)}>
                        Review
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="performance-chart-card overflow-hidden" string="progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoice spend trend</CardTitle>
            <CardDescription>Top category spend over the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {trendEmpty ? (
                <EmptyState>No invoice spend trend is available for the selected period.</EmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.spendTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={CHART_GRID} />
                    <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={PREMIUM_TOOLTIP} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} formatter={(value) => formatMoney(value, 'USD')} />
                    <defs>
                      <linearGradient id="spendLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#14b8a6" />
                        <stop offset="55%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                    <Line type="monotone" dataKey="spend" name="Spend" stroke="url(#spendLineGradient)" strokeWidth={4} dot={{ r: 3, fill: '#14b8a6', strokeWidth: 0 }} activeDot={{ r: 7, fill: '#f97316', stroke: 'white', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="performance-chart-card overflow-hidden" string="progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category distribution</CardTitle>
            <CardDescription>Where invoice allocation spend is concentrated.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {distributionEmpty ? (
                <EmptyState>No category distribution is available yet.</EmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.categoryDistribution} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={3} stroke="hsl(var(--card))" strokeWidth={3}>
                      {analytics.categoryDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={PREMIUM_TOOLTIP} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} formatter={(value) => formatMoney(value, 'USD')} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="performance-chart-card overflow-hidden" string="progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Separate payment status exposure</CardTitle>
            <CardDescription>Invoice obligations and payment attempts are displayed separately for review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {paymentEmpty ? (
                <EmptyState>No paid, scheduled, unpaid, or failed payment exposure found for this period.</EmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.paymentData} layout="vertical" margin={{ top: 10, right: 16, left: 12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" horizontal={false} stroke={CHART_GRID} />
                    <XAxis type="number" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={78} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={PREMIUM_TOOLTIP} cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} formatter={(value) => formatMoney(value, 'USD')} />
                    <defs>
                      <linearGradient id="paymentExposureGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="value" name="Amount" fill="url(#paymentExposureGradient)" radius={[0, 8, 8, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}



