import React, { useMemo, useState } from 'react';
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
import { useOverviewAnalytics } from '@/modules/performance/hooks/useOverviewAnalytics';
import { formatMoney, formatPct, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Category', accessor: 'category' },
  { header: 'Vendor', accessor: 'vendor' },
  { header: 'Driver', accessor: 'driver' },
  { header: 'Amount', accessor: 'amount' },
  { header: '% Change', accessor: 'changePct' },
  { header: 'Change Amount', accessor: 'changeAmount' },
  { header: 'Module', accessor: 'module' },
  { header: 'Trend', accessor: 'trendStatus' },
  { header: 'Last Activity', accessor: 'lastActivity' },
];

const OVERVIEW_TOOLTIP =
  'Cross-module executive snapshot: purchasing (Invoice), inventory valuation (Inventory), open balances (Payments), and recipe-linked cost exposure (Recipes). Demo data only.';

export default function OverviewAnalyticsPage() {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    locationIds: location?.id ? [location.id] : [],
  });

  const [moduleChartMode, setModuleChartMode] = useState('pie');

  const {
    summary,
    spendTrend,
    moduleMix,
    locationSpendComparison,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useOverviewAnalytics({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterLocations = metadata?.filterOptions?.locations || [];
  const filterVendors = metadata?.filterOptions?.vendors || [];

  const tableColumns = useMemo(
    () => [
      { accessor: 'category', header: 'Category', cell: (row) => <span className="font-medium">{row.category}</span> },
      { accessor: 'vendor', header: 'Vendor' },
      {
        accessor: 'amount',
        header: 'Spend',
        cell: (row) => formatMoney(row.amount, currency),
      },
      {
        accessor: 'changePct',
        header: '% change',
        cell: (row) => formatPct(row.changePct),
      },
      {
        accessor: 'changeAmount',
        header: 'Change $',
        cell: (row) => formatMoney(row.changeAmount, currency),
      },
      {
        accessor: 'module',
        header: 'Module',
        cell: (row) => <Badge variant="secondary">{row.module}</Badge>,
      },
      {
        accessor: 'trendStatus',
        header: 'Trend',
        cell: (row) => (
          <Badge
            variant={row.trendStatus === 'increasing' ? 'destructive' : row.trendStatus === 'decreasing' ? 'secondary' : 'outline'}
            className="capitalize"
          >
            {row.trendStatus}
          </Badge>
        ),
      },
      { accessor: 'lastActivity', header: 'Last activity' },
    ],
    [currency]
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Overview Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Executive cross-module view of purchasing spend, inventory value, payment exposure, and recipe cost drivers.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `overview-analytics-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        vendorIds={filterState.vendorIds}
        locations={filterLocations}
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

      {showError ? (
        <ChartErrorState message={error?.message || 'Failed to load overview analytics.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Total Purchases"
          tooltip={OVERVIEW_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.totalPurchases, currency)}
          previousValue={summary?.previousTotalPurchases}
          percentageChange={summary?.purchaseChangePct}
        />
        <EnterpriseKpiCard
          label="Inventory Value"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.inventoryValue, currency)}
        />
        <EnterpriseKpiCard
          label="Payments Outstanding"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.paymentsOutstanding, currency)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Recipe Cost Exposure"
          tooltip="Estimated food cost tied to active recipes with mapped ingredients."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.recipeCostExposure, currency)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No overview data for the selected filters. Enable Performance Demo Mode or adjust filters."
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Spend Trend" description="Weekly cross-module spend trajectory">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spendTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Line type="monotone" dataKey="spend" name="Purchases" stroke="#0f766e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="inventoryValue" name="Inventory value" stroke="#b45309" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="paymentsOutstanding" name="Payments outstanding" stroke="#be123c" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Module Mix"
              description="Spend contribution by MED module"
              actions={
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded ${moduleChartMode === 'pie' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                    onClick={() => setModuleChartMode('pie')}
                  >
                    Pie
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded ${moduleChartMode === 'bar' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                    onClick={() => setModuleChartMode('bar')}
                  >
                    Bar
                  </button>
                </div>
              }
            >
              {isLoading ? (
                <ChartLoadingState />
              ) : moduleChartMode === 'pie' ? (
                <div className="h-[300px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={moduleMix} dataKey="spend" nameKey="module" innerRadius={55} outerRadius={90}>
                        {moduleMix.map((entry, index) => (
                          <Cell key={entry.module} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={moduleMix}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="spend" name="Spend">
                        {moduleMix.map((entry, index) => (
                          <Cell key={entry.module} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Location Spend Comparison" description="Purchasing spend by location">
            {isLoading ? (
              <ChartLoadingState />
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={locationSpendComparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v) => formatMoney(v, currency)} />
                    <Legend />
                    <Bar dataKey="spend" name="Purchases" fill="#0f766e" />
                    <Bar dataKey="inventoryValue" name="Inventory value" fill="#1d4ed8" />
                    <Bar dataKey="paymentsOutstanding" name="Payments outstanding" fill="#be123c" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Recent Cost Drivers" description="Top category/vendor spend movers in period">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['category', 'vendor', 'driver', 'module']}
              searchPlaceholder="Search categories, vendors, modules…"
              emptyMessage="No cost drivers for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}
    </div>
  );
}
