import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Badge } from '@/components/ui/badge';
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
import { ExportMenu, DataFreshnessLabel } from '@/modules/performance/components/shared/ExportMenu';
import { usePerformanceFilters } from '@/modules/performance/hooks/usePerformanceFilters';
import { useVarianceBreakdown } from '@/modules/performance/hooks/useVarianceBreakdown';
import { formatMoney, formatPct, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Category', accessor: 'category' },
  { header: 'Price Variance', accessor: 'priceVariance' },
  { header: 'Volume Variance', accessor: 'volumeVariance' },
  { header: 'Mix/Other Variance', accessor: 'mixOtherVariance' },
  { header: 'Total Variance', accessor: 'totalVariance' },
  { header: '% of Total', accessor: 'pctOfTotal' },
  { header: 'Primary Module', accessor: 'primaryModule' },
  { header: 'Invoice Count', accessor: 'invoiceCount' },
];

const VARIANCE_TOOLTIP =
  'Explainable variance decomposes purchasing spend changes into price (unit cost from invoices), volume (qty/usage from inventory), and mix/other. Not POS sales variance.';

function varianceStatus(value) {
  if (value == null || value === 0) return 'neutral';
  return value > 0 ? 'negative' : 'positive';
}

function VarianceCell({ value, currency }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const positive = value > 0;
  return (
    <span className={positive ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
      {positive ? '+' : ''}
      {formatMoney(value, currency)}
    </span>
  );
}

export default function VarianceBreakdownPage() {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    locationIds: location?.id ? [location.id] : [],
  });

  const {
    summary,
    varianceDrivers,
    varianceByCategory,
    varianceTrend,
    moduleBreakdown,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useVarianceBreakdown({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterLocations = metadata?.filterOptions?.locations || [];
  const sourceModules = metadata?.sourceModules || ['Invoice', 'Inventory', 'Products', 'Recipes'];

  const tableColumns = useMemo(
    () => [
      {
        accessor: 'category',
        header: 'Category',
        cell: (row) => <span className="font-medium">{row.category}</span>,
      },
      {
        accessor: 'priceVariance',
        header: 'Price var',
        cell: (row) => <VarianceCell value={row.priceVariance} currency={currency} />,
      },
      {
        accessor: 'volumeVariance',
        header: 'Volume var',
        cell: (row) => <VarianceCell value={row.volumeVariance} currency={currency} />,
      },
      {
        accessor: 'mixOtherVariance',
        header: 'Mix/other',
        cell: (row) => <VarianceCell value={row.mixOtherVariance} currency={currency} />,
      },
      {
        accessor: 'totalVariance',
        header: 'Total',
        cell: (row) => <VarianceCell value={row.totalVariance} currency={currency} />,
      },
      {
        accessor: 'pctOfTotal',
        header: '% of total',
        cell: (row) => formatPct(row.pctOfTotal),
      },
      {
        accessor: 'primaryModule',
        header: 'Module',
        cell: (row) => <Badge variant="secondary">{row.primaryModule}</Badge>,
      },
      { accessor: 'invoiceCount', header: 'Invoices' },
    ],
    [currency]
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Variance Breakdown</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Explainable purchasing and usage variance — price, volume, and mix drivers from invoices and inventory.
            Not POS sales variance.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sourceModules.map((mod) => (
              <Badge key={mod} variant="outline" className="text-xs">
                {mod}
              </Badge>
            ))}
          </div>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `variance-breakdown-${filterState.dateFrom}-${filterState.dateTo}.csv`
            )
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
        vendorIds={[]}
        locations={filterLocations}
        categories={filterCategories}
        vendors={[]}
        autoComparison={filterState.autoComparison}
        onDateFromChange={filterState.setDateFrom}
        onDateToChange={filterState.setDateTo}
        onComparisonDateFromChange={filterState.setComparisonDateFrom}
        onComparisonDateToChange={filterState.setComparisonDateTo}
        onLocationChange={filterState.setLocationIds}
        onCategoryChange={filterState.setCategoryIds}
        onVendorChange={() => {}}
        onAutoComparisonChange={filterState.setAutoComparison}
        onClear={filterState.clearFilters}
        onDateRangeCommit={filterState.updateDateRange}
      />

      {showError ? (
        <ChartErrorState message={error?.message || 'Failed to load variance breakdown.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Total Variance"
          tooltip={VARIANCE_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.totalVariance, currency)}
          status={varianceStatus(summary?.totalVariance)}
        />
        <EnterpriseKpiCard
          label="Price Variance"
          tooltip="Unit cost changes from invoice line items vs comparison period."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.priceVariance, currency)}
          status={varianceStatus(summary?.priceVariance)}
        />
        <EnterpriseKpiCard
          label="Volume Variance"
          tooltip="Quantity and inventory usage changes vs comparison period."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.volumeVariance, currency)}
          status={varianceStatus(summary?.volumeVariance)}
        />
        <EnterpriseKpiCard
          label="Mix / Other Variance"
          tooltip="Category mix shifts, recipe changes, and uncategorized adjustments."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.mixOtherVariance, currency)}
          status={varianceStatus(summary?.mixOtherVariance)}
        />
        <EnterpriseKpiCard
          label="Baseline Spend"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.baselineSpend, currency)}
        />
        <EnterpriseKpiCard
          label="Actual Spend"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.actualSpend, currency)}
        />
        <EnterpriseKpiCard
          label="Largest Driver"
          loading={isLoading}
          empty={showEmpty || !summary?.largestDriver}
          error={showError}
          value={summary?.largestDriver?.category || '—'}
          sublabel={
            summary?.largestDriver
              ? formatMoney(summary.largestDriver.totalVariance, currency)
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Unfavorable Categories"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.unfavorableCategories ?? 0)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Favorable Categories"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.favorableCategories ?? 0)}
          status="positive"
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No variance drivers for the selected filters. Enable Performance Demo Mode or widen the date range."
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Variance Drivers"
              description="Stacked price, volume, and mix/other by category"
            >
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={varianceDrivers}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Bar dataKey="priceVariance" name="Price" stackId="a" fill={COLORS[0]} />
                      <Bar dataKey="volumeVariance" name="Volume" stackId="a" fill={COLORS[1]} />
                      <Bar dataKey="mixOtherVariance" name="Mix/Other" stackId="a" fill={COLORS[2]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Variance by Category" description="Total variance (positive = unfavorable spend)">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={varianceByCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="totalVariance" name="Total variance">
                        {varianceByCategory.map((entry) => (
                          <Cell
                            key={entry.category}
                            fill={(entry.totalVariance || 0) >= 0 ? '#b45309' : '#0f766e'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Variance Trend" description="Weekly decomposition over the period">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={varianceTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Line type="monotone" dataKey="totalVariance" name="Total" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="priceVariance" name="Price" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="volumeVariance" name="Volume" stroke={COLORS[1]} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="mixOtherVariance" name="Mix/Other" stroke={COLORS[2]} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Variance by Source Module" description="Absolute variance attributed to primary module">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={moduleBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="variance" name="Variance" fill="#7c3aed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Variance Driver Detail" description="Category-level price, volume, and mix decomposition">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['category', 'primaryModule']}
              searchPlaceholder="Search categories, modules…"
              emptyMessage="No variance driver rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}
    </div>
  );
}
