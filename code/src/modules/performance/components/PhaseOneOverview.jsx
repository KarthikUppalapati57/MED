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
  ChefHat,
  CreditCard,
  FileText,
  Package,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

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
    <Card className="border-border/50">
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
    <div className="rounded-lg border border-border/50 bg-card p-3 min-w-0">
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

function ComingSoonStrip() {
  const items = [
    'Sales report',
    'Sales forecast',
    'Labor analytics',
    'POS analytics',
    'Prime cost',
    'Benchmarking',
    'Advanced Executive BI',
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="text-xs">
          {item}: Coming soon
        </Badge>
      ))}
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
        queryFn: () => api.entities.Invoice.list('-invoice_date'),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_payments', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
        queryFn: () => api.entities.Payment.list('-payment_date'),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_products', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Product.list('-updated_at'),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_inventory', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Inventory.list('-updated_at'),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['phase1_overview_recipes', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Recipe.list('-updated_at'),
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

  const categoryReport = results[0].data || {};
  const invoices = (results[1].data || []).filter((row) =>
    inRange(row.invoice_date || row.created_at, periodStart, periodEnd)
  );
  const payments = (results[2].data || []).filter((row) =>
    inRange(row.payment_date || row.created_at, periodStart, periodEnd)
  );
  const products = results[3].data || [];
  const inventory = results[4].data || [];
  const recipes = results[5].data || [];
  const priceMoversReport = results[6].data || {};
  const isLoading = results.some((query) => query.isLoading);

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
            body: 'Open Category Report to inspect invoice allocations and vendors.',
            tab: 'category',
          }]
        : []),
      ...(invoiceUnpaid > 0
        ? [{
            tone: 'warn',
            title: `${compactMoney(invoiceUnpaid)} unpaid invoice exposure`,
            body: 'Review Payments and invoice statuses before cash-out planning.',
            tab: null,
          }]
        : []),
      ...(lowStock > 0
        ? [{
            tone: 'warn',
            title: `${lowStock} inventory items near reorder`,
            body: 'Open Usage Report to compare stock and movement pressure.',
            tab: 'usage_report',
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
            body: 'Open Price Movers to identify vendor item increases.',
            tab: 'movers',
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
          detail: `${summary.invoiceCount || 0} categorized invoices`,
          progress: Math.min(100, Number(summary.activeCategoryCount || 0) * 12),
          tone: Number(summary.categoriesOverBudget || 0) > 0 ? 'warn' : 'good',
        },
        {
          label: 'Payments',
          icon: CreditCard,
          value: compactMoney(paymentExposure),
          detail: 'open payment exposure',
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
          detail: `${compactMoney(inventoryValue)} current value`,
          progress: 100 - inventoryRisk,
          tone: lowStock ? 'warn' : 'good',
        },
        {
          label: 'Recipes',
          icon: ChefHat,
          value: String(recipeMarginRisks.length),
          detail: `${formatPct(averageRecipeMargin)} avg margin`,
          progress: recipes.length ? 100 - pctOf(recipeMarginRisks.length, recipes.length) : 0,
          tone: recipeMarginRisks.length ? 'risk' : 'good',
        },
      ],
    };
  }, [categoryReport, invoices, payments, products, inventory, recipes, priceMoversReport]);

  const chartEmpty = !isLoading && analytics.totalSpend === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Phase 1 Performance Command Center</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            One visual view for Invoices, Payments, Products, Inventory, and Recipes. Sales, labor, POS, forecasting, and advanced BI remain out of Phase 1.
          </p>
        </div>
        <ComingSoonStrip />
      </div>

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
          detail="Unpaid, scheduled, failed, or partial"
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
        <Card className="xl:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Budget vs actual category spend</CardTitle>
                <CardDescription>Actuals are invoice allocation spend. Budgets are saved product/invoice category targets.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenTab?.('category')}>
                Open Category Report
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {chartEmpty ? (
              <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground text-center">
                No invoice allocation spend found for this period.
              </div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.budgetRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(value) => formatMoney(value, 'USD')} />
                    <Legend />
                    <Bar dataKey="budget" name="Budget" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Action Signals</CardTitle>
            <CardDescription>Phase 1 alerts from the five active modules.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.actionItems.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center">
                No urgent Phase 1 performance signals for this period.
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
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoice spend trend</CardTitle>
            <CardDescription>Top category spend over the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.spendTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(value) => formatMoney(value, 'USD')} />
                  <Line type="monotone" dataKey="spend" name="Spend" stroke="#0f766e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category distribution</CardTitle>
            <CardDescription>Where invoice spend is concentrated.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.categoryDistribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84}>
                    {analytics.categoryDistribution.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value, 'USD')} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment status exposure</CardTitle>
            <CardDescription>Paid, scheduled, unpaid, and failed cash-out signals.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.paymentData} layout="vertical" margin={{ top: 10, right: 16, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatMoney(value, 'USD')} />
                  <Bar dataKey="value" name="Amount" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Phase 1 visual graph map</CardTitle>
              <CardDescription>These are the graphs we will keep production-facing now. Everything else remains Coming Soon.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">5 active modules</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[
              ['Budget vs Actual', 'Invoice/product category targets compared with allocation spend.'],
              ['Category Spend Trend', 'Daily, weekly, or monthly purchasing movement from invoices.'],
              ['Payment Exposure', 'Paid, scheduled, unpaid, and failed payment visibility.'],
              ['Product Price Movers', 'Vendor price increases and estimated cost impact.'],
              ['Inventory Usage Risk', 'Low stock, value, usage, and waste signals where available.'],
              ['Recipe Margin Pressure', 'Recipes below target margin because product costs moved.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-border/50 p-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
