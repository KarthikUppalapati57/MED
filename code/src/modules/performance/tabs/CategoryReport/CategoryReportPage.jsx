import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PerformanceFilterBar } from '@/modules/performance/components/shared/PerformanceFilterBar';
import { EnterpriseKpiCard, KpiRibbon } from '@/modules/performance/components/shared/EnterpriseKpiCard';
import {
  ChartCard,
  ChartEmptyState,
  ChartErrorState,
  ChartLoadingState,
} from '@/modules/performance/components/shared/ChartCard';
import { AnalyticsDataGrid } from '@/modules/performance/components/shared/AnalyticsDataGrid';
import { InsightPanel } from '@/modules/performance/components/shared/InsightPanel';
import { DrilldownDrawer } from '@/modules/performance/components/shared/DrilldownDrawer';
import { ExportMenu, DataFreshnessLabel } from '@/modules/performance/components/shared/ExportMenu';
import { usePerformanceFilters } from '@/modules/performance/hooks/usePerformanceFilters';
import {
  useCategoryPerformance,
  useCategoryPerformanceDrilldown,
} from '@/modules/performance/hooks/useCategoryPerformance';
import {
  formatMoney,
  formatPct,
  exportRowsToCsv,
  CATEGORY_TABLE_EXPORT_COLUMNS,
} from '@/modules/performance/services/performanceAnalytics';
import { groupSmallCategories } from '@/modules/performance/services/categoryPerformanceCalculations';

const CHART_COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857', '#c2410c', '#334155'];

const SPEND_TOOLTIP =
  'Net purchasing spend from approved invoice line-item allocations, dated by invoice_date. Excludes deleted invoices. Not sales-based COGS.';

function varianceStatus(absoluteChange) {
  if (absoluteChange == null) return 'neutral';
  if (absoluteChange > 0) return 'negative'; // higher spend = worse for cost control
  if (absoluteChange < 0) return 'positive';
  return 'neutral';
}

export default function CategoryReportPage({ periodStart, periodEnd } = {}) {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    dateFrom: periodStart,
    dateTo: periodEnd,
    locationIds: location?.id ? [location.id] : [],
  });

  const [spendMode, setSpendMode] = useState('comparison'); // spend | pct | variance
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [drillCategory, setDrillCategory] = useState(null);
  const [trendCats, setTrendCats] = useState([]);

  const locationsQuery = useAuthQueries({
    queries: [
      {
        queryKey: ['perf_locations', organization?.id],
        queryFn: async () => {
          const { api } = await import('@/lib/apiClient');
          return api.entities.Location.filter({ organization_id: organization?.id });
        },
        enabled: !!organization?.id,
      },
    ],
  });
  const locations = locationsQuery[0]?.data || [];

  const {
    report,
    summary,
    categoryBreakdown,
    trend,
    distribution,
    pareto,
    vendorContribution,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
    isFetching,
  } = useCategoryPerformance({
    organizationId: organization?.id,
    filters: filterState.filters,
    selectedCategory,
    trendCategories: trendCats.length ? trendCats : null,
  });

  const drilldown = useCategoryPerformanceDrilldown({
    organizationId: organization?.id,
    filters: filterState.filters,
    category: drillCategory,
    enabled: Boolean(drillCategory),
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterVendors = metadata?.filterOptions?.vendors || [];

  const openCategory = (category) => {
    if (!category || category === 'Other') return;
    setSelectedCategory(category);
    setDrillCategory(category);
  };

  const barData = useMemo(() => {
    const grouped = groupSmallCategories(categoryBreakdown, { maxVisible: 12 });
    return grouped.map((row) => {
      const current = Number(row.currentSpend ?? row.spend) || 0;
      const previous = Number(row.previousSpend) || 0;
      const total = Number(summary?.totalSpend) || 0;
      return {
        category: row.category,
        current,
        previous,
        pct: total ? (current / total) * 100 : 0,
        variance: current - previous,
        percentageVariance: row.percentageVariance,
        isOther: row.isOther,
      };
    });
  }, [categoryBreakdown, summary?.totalSpend]);

  const trendSeries = useMemo(() => {
    const byBucket = new Map();
    for (const point of trend || []) {
      const key = point.bucket;
      if (!byBucket.has(key)) {
        byBucket.set(key, { bucket: key, bucketStart: point.bucketStart });
      }
      byBucket.get(key)[point.category] = Number(point.spend) || 0;
    }
    return [...byBucket.values()].sort((a, b) => String(a.bucketStart).localeCompare(String(b.bucketStart)));
  }, [trend]);

  const trendCategoryKeys = useMemo(() => {
    const keys = new Set();
    for (const point of trend || []) keys.add(point.category);
    return [...keys];
  }, [trend]);

  const tableColumns = useMemo(() => {
    const cols = [
      { accessor: 'category', header: 'Category', cell: (row) => <span className="font-medium">{row.category}</span> },
      { accessor: 'currentSpend', header: 'Current spend', cell: (row) => formatMoney(row.currentSpend, currency) },
      { accessor: 'previousSpend', header: 'Comparison spend', cell: (row) => formatMoney(row.previousSpend, currency) },
      {
        accessor: 'absoluteVariance',
        header: 'Abs. variance',
        cell: (row) => formatMoney(row.absoluteVariance, currency),
      },
      {
        accessor: 'percentageVariance',
        header: '% variance',
        cell: (row) => formatPct(row.percentageVariance),
      },
      {
        accessor: 'percentageOfTotal',
        header: '% of total',
        cell: (row) => formatPct(row.percentageOfTotal),
      },
      { accessor: 'invoiceCount', header: 'Invoices' },
      { accessor: 'vendorCount', header: 'Vendors' },
      {
        accessor: 'averageInvoiceValue',
        header: 'Avg invoice',
        cell: (row) => formatMoney(row.averageInvoiceValue, currency),
      },
      { accessor: 'largestVendor', header: 'Largest vendor', cell: (row) => row.largestVendor || '—' },
      {
        accessor: 'trendStatus',
        header: 'Trend',
        cell: (row) => (
          <Badge variant="secondary" className="capitalize">
            {row.trendStatus || '—'}
          </Badge>
        ),
      },
    ];
    if (metadata?.hasBudgetData) {
      cols.splice(10, 0,
        { accessor: 'budget', header: 'Budget', cell: (row) => (row.budget == null ? '—' : formatMoney(row.budget, currency)) },
        {
          accessor: 'budgetVariance',
          header: 'Budget var.',
          cell: (row) => (row.budgetVariance == null ? '—' : formatMoney(row.budgetVariance, currency)),
        }
      );
    }
    return cols;
  }, [currency, metadata?.hasBudgetData]);

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Category Report</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Where purchasing spend is going, which categories drive cost, and how category spend is changing over time.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(tableRows, CATEGORY_TABLE_EXPORT_COLUMNS, `category-report-${filterState.dateFrom}-${filterState.dateTo}.csv`)
          }
        />
      </div>

      <PerformanceFilterBar
        dateFrom={filterState.dateFrom}
        dateTo={filterState.dateTo}
        comparisonDateFrom={filterState.comparisonDateFrom}
        comparisonDateTo={filterState.comparisonDateTo}
        locationIds={filterState.locationIds}
        categoryIds={filterState.categoryIds}
        vendorIds={filterState.vendorIds}
        locations={locations}
        categories={filterCategories}
        vendors={filterVendors}
        autoComparison={filterState.autoComparison}
        onDateFromChange={filterState.setDateFrom}
        onDateToChange={filterState.setDateTo}
        onComparisonDateFromChange={filterState.setComparisonDateFrom}
        onComparisonDateToChange={filterState.setComparisonDateTo}
        onLocationChange={filterState.setLocationIds}
        onCategoryChange={filterState.setCategoryIds}
        onVendorChange={filterState.setVendorIds}
        onAutoComparisonChange={filterState.setAutoComparison}
        onClear={filterState.clearFilters}
        onDateRangeCommit={filterState.updateDateRange}
      />

      {Number(summary?.uncategorizedSpend || 0) > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          Some invoice spend is uncategorized ({formatMoney(summary.uncategorizedSpend, currency)}).
          <Button type="button" variant="link" className="px-2 h-auto" onClick={() => openCategory('Uncategorized')}>
            Review uncategorized
          </Button>
        </div>
      ) : null}

      {showError ? (
        <ChartErrorState
          message={error?.message || 'Failed to load category performance.'}
          onRetry={() => refetch()}
        />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Total Purchasing Spend"
          tooltip={SPEND_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.totalSpend, currency)}
          previousValue={summary?.previousSpend}
          absoluteChange={summary?.absoluteChange}
          percentageChange={summary?.percentageChange}
          status={varianceStatus(summary?.absoluteChange)}
        />
        <EnterpriseKpiCard
          label="Period Change"
          tooltip="Current purchasing spend minus comparison-period purchasing spend."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.absoluteChange, currency)}
          previousValue={summary?.previousSpend}
          absoluteChange={summary?.absoluteChange}
          percentageChange={summary?.percentageChange}
          status={varianceStatus(summary?.absoluteChange)}
          sublabel={formatPct(summary?.percentageChange)}
        />
        <EnterpriseKpiCard
          label="Largest Spend Category"
          tooltip="Category with the highest purchasing spend in the selected period."
          loading={isLoading}
          empty={showEmpty || !summary?.largestCategory}
          error={showError}
          value={summary?.largestCategory?.category || '—'}
          sublabel={
            summary?.largestCategory
              ? `${formatMoney(summary.largestCategory.spend, currency)} · ${formatPct(summary.largestCategory.percentageOfTotal)} of total`
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Fastest-Growing Category"
          tooltip="Highest % growth vs comparison period among categories meeting a minimum spend threshold."
          loading={isLoading}
          empty={showEmpty || !summary?.fastestGrowingCategory}
          error={showError}
          value={summary?.fastestGrowingCategory?.category || '—'}
          sublabel={
            summary?.fastestGrowingCategory
              ? formatPct(summary.fastestGrowingCategory.percentageChange)
              : undefined
          }
          absoluteChange={summary?.fastestGrowingCategory?.absoluteChange}
          percentageChange={summary?.fastestGrowingCategory?.percentageChange}
          status={varianceStatus(summary?.fastestGrowingCategory?.absoluteChange)}
        />
        <EnterpriseKpiCard
          label="Active Categories"
          tooltip="Count of categories with purchasing activity in the selected period."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.activeCategoryCount ?? 0)}
        />
        <EnterpriseKpiCard
          label="Top-Three Concentration"
          tooltip="Spend from the three largest categories divided by total purchasing spend."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatPct(summary?.topThreeConcentrationPercentage)}
        />
        <EnterpriseKpiCard
          label="Average Invoice Value"
          tooltip="Total eligible purchasing spend divided by unique invoice count."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.averageInvoiceValue, currency)}
          sublabel={`${summary?.invoiceCount || 0} invoices`}
        />
        <EnterpriseKpiCard
          label="Categories Over Budget"
          tooltip="Only shown when budget targets match product/allocation category names."
          loading={isLoading}
          error={showError}
          unavailable={!metadata?.hasBudgetData && !isLoading}
          unavailableLabel="Budget mapping unavailable"
          empty={showEmpty && metadata?.hasBudgetData}
          value={String(summary?.categoriesOverBudget ?? 0)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Purchasing Spend by Category"
              description="Current vs comparison period"
              actions={
                <Select value={spendMode} onValueChange={setSpendMode}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comparison">Spend vs comparison</SelectItem>
                    <SelectItem value="pct">% of total</SelectItem>
                    <SelectItem value="variance">Variance</SelectItem>
                  </SelectContent>
                </Select>
              }
            >
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => (spendMode === 'pct' ? `${v}%` : `$${v}`)} />
                      <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, name, props) => {
                          const row = props?.payload;
                          if (spendMode === 'pct') return [`${Number(value).toFixed(1)}%`, name];
                          return [
                            formatMoney(value, currency),
                            `${name}${row?.percentageVariance != null ? ` (${formatPct(row.percentageVariance)})` : ''}`,
                          ];
                        }}
                      />
                      <Legend />
                      {spendMode === 'comparison' ? (
                        <>
                          <Bar dataKey="current" name="Current" fill="#0f766e" cursor="pointer" onClick={(d) => openCategory(d.category)} />
                          <Bar dataKey="previous" name="Comparison" fill="#94a3b8" cursor="pointer" onClick={(d) => openCategory(d.category)} />
                        </>
                      ) : null}
                      {spendMode === 'pct' ? (
                        <Bar dataKey="pct" name="% of total" fill="#1d4ed8" cursor="pointer" onClick={(d) => openCategory(d.category)} />
                      ) : null}
                      {spendMode === 'variance' ? (
                        <Bar dataKey="variance" name="Variance" fill="#b45309" cursor="pointer" onClick={(d) => openCategory(d.category)} />
                      ) : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Category Spend Trend"
              description={`Granularity: ${metadata?.granularity || 'day'}`}
              actions={
                <Select
                  value={trendCats[0] || 'top5'}
                  onValueChange={(v) => setTrendCats(v === 'top5' ? [] : [v])}
                >
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top5">Top 5 categories</SelectItem>
                    {(filterCategories || []).map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      {trendCategoryKeys.map((key, idx) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard title="Category Distribution" description="Share of purchasing spend" className="xl:col-span-1">
              {isLoading ? (
                <ChartLoadingState height={280} />
              ) : distribution.length === 0 ? (
                <ChartEmptyState message="No distribution data." />
              ) : (
                <div className="h-[280px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution}
                        dataKey="spend"
                        nameKey="category"
                        innerRadius={60}
                        outerRadius={95}
                        onClick={(d) => openCategory(d.category)}
                      >
                        {distribution.map((entry, index) => (
                          <Cell key={entry.category} fill={CHART_COLORS[index % CHART_COLORS.length]} cursor="pointer" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="text-sm font-semibold">{formatMoney(summary?.totalSpend, currency)}</p>
                    </div>
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Pareto Analysis" description="Categories driving ~80% of spend" className="xl:col-span-2">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={pareto}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" hide />
                      <YAxis yAxisId="left" tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        formatter={(value, name) =>
                          name === 'Cumulative %' ? formatPct(value) : formatMoney(value, currency)
                        }
                      />
                      <Bar yAxisId="left" dataKey="spend" name="Spend" fill="#0f766e" onClick={(d) => openCategory(d.category)} cursor="pointer" />
                      <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name="Cumulative %" stroke="#b45309" strokeWidth={2} dot={false} />
                      <ReferenceLine yAxisId="right" y={80} stroke="#be123c" strokeDasharray="4 4" label="80%" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="Vendor Contribution by Category"
            description={metadata?.selectedCategory ? `Category: ${metadata.selectedCategory}` : 'Select a category'}
            actions={
              <Select
                value={selectedCategory || metadata?.selectedCategory || ''}
                onValueChange={(v) => setSelectedCategory(v)}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {(filterCategories || []).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            {isLoading || isFetching ? (
              <ChartLoadingState height={260} />
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendorContribution.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="vendor" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name, props) => {
                        const row = props?.payload;
                        return [
                          formatMoney(value, currency),
                          `${name} · ${formatPct(row?.sharePercentage)} · ${row?.invoiceCount || 0} invoices`,
                        ];
                      }}
                    />
                    <Bar dataKey="spend" name="Spend" fill="#1d4ed8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Category Detail" description="Click a row to drill into vendors, products, and invoices">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['category', 'largestVendor']}
              searchPlaceholder="Search categories…"
              onRowClick={(row) => openCategory(row.category)}
              emptyMessage="No category rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}

      <DrilldownDrawer
        open={Boolean(drillCategory)}
        onOpenChange={(open) => {
          if (!open) setDrillCategory(null);
        }}
        title={drillCategory || 'Category'}
        description="Purchasing spend drill-down"
      >
        {drilldown.isLoading ? (
          <ChartLoadingState />
        ) : drilldown.isError ? (
          <ChartErrorState message={drilldown.error?.message || 'Failed to load drill-down'} onRetry={() => drilldown.refetch()} />
        ) : (
          <CategoryDrilldownBody data={drilldown.data} currency={currency} onOpenInvoice={(id) => navigate(`/Invoices?invoice=${id}`)} />
        )}
      </DrilldownDrawer>
    </div>
  );
}

function CategoryDrilldownBody({ data, currency, onOpenInvoice }) {
  if (!data) return null;
  const s = data.summary || {};

  return (
    <div className="space-y-5 pb-8">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Total spend" value={formatMoney(s.totalSpend, currency)} />
        <MiniStat label="Period change" value={formatMoney(s.absoluteChange, currency)} sub={formatPct(s.percentageChange)} />
        <MiniStat label="Invoices" value={String(s.invoiceCount || 0)} />
        <MiniStat label="Vendors" value={String(s.vendorCount || 0)} />
        <MiniStat label="Avg invoice" value={formatMoney(s.averageInvoiceValue, currency)} />
      </div>

      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="vendors" className="mt-3">
          <SimpleTable
            columns={['Vendor', 'Spend', 'Share', 'Invoices', 'Avg', 'Change']}
            rows={(data.vendors || []).map((v) => [
              v.vendor,
              formatMoney(v.spend, currency),
              formatPct(v.sharePercentage),
              v.invoiceCount,
              formatMoney(v.averageInvoice, currency),
              formatMoney(v.absoluteChange, currency),
            ])}
          />
        </TabsContent>
        <TabsContent value="products" className="mt-3">
          <SimpleTable
            columns={['Product', 'Qty', 'Unit price', 'Avg unit', 'Spend', 'Vendor']}
            rows={(data.products || []).map((p) => [
              p.product,
              p.quantityPurchased,
              formatMoney(p.currentUnitPrice, currency),
              formatMoney(p.averageUnitPrice, currency),
              formatMoney(p.totalSpend, currency),
              p.vendor,
            ])}
          />
        </TabsContent>
        <TabsContent value="invoices" className="mt-3">
          <SimpleTable
            columns={['Invoice', 'Date', 'Vendor', 'Amount', 'Status', 'Location']}
            rows={(data.invoices || []).map((inv) => [
              <button
                key={inv.invoiceId}
                type="button"
                className="text-brand underline-offset-2 hover:underline"
                onClick={() => onOpenInvoice?.(inv.invoiceId)}
              >
                {inv.invoiceNumber || inv.invoiceId}
              </button>,
              inv.date,
              inv.vendor,
              formatMoney(inv.amount, currency),
              inv.status,
              inv.location || '—',
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  );
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-auto max-h-[420px]">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                No rows
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={idx}>
                {row.map((cell, cidx) => (
                  <TableCell key={cidx} className="whitespace-nowrap">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

