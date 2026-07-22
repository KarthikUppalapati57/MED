import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { usePurchaseReportAnalytics } from '@/modules/performance/hooks/usePurchaseReportAnalytics';
import { formatMoney, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const EXPORT_COLUMNS = [
  { header: 'Product', accessor: 'product' },
  { header: 'Category', accessor: 'category' },
  { header: 'Vendor', accessor: 'vendor' },
  { header: 'Unit', accessor: 'unit' },
  { header: 'Units', accessor: 'units' },
  { header: 'Unit Cost', accessor: 'unitCost' },
  { header: 'Amount', accessor: 'amount' },
  { header: 'Invoice Count', accessor: 'invoiceCount' },
  { header: 'Last Purchased', accessor: 'lastPurchased' },
];

const PURCHASE_TOOLTIP =
  'Product-level purchasing from approved invoice line items. Amount = normalized qty × unit cost. Sources: Invoice, Products, Payments modules.';

function qty(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function PurchaseReportPage() {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    locationIds: location?.id ? [location.id] : [],
  });

  const {
    summary,
    spendByCategory,
    spendByVendor,
    weeklyPurchaseTrend,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = usePurchaseReportAnalytics({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterVendors = metadata?.filterOptions?.vendors || [];

  const tableColumns = useMemo(
    () => [
      { accessor: 'product', header: 'Product', cell: (row) => <span className="font-medium">{row.product}</span> },
      { accessor: 'category', header: 'Category' },
      { accessor: 'vendor', header: 'Vendor' },
      { accessor: 'units', header: 'Units', cell: (row) => qty(row.units) },
      {
        accessor: 'unitCost',
        header: 'Avg cost/unit',
        cell: (row) => formatMoney(row.unitCost, currency),
      },
      {
        accessor: 'amount',
        header: 'Amount',
        cell: (row) => formatMoney(row.amount, currency),
      },
      { accessor: 'lastPurchased', header: 'Last purchased' },
    ],
    [currency]
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Purchase Report</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Product-level purchasing analysis — spend by category and vendor, unit economics, and weekly purchase trends.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `purchase-report-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        locations={[]}
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
        <ChartErrorState message={error?.message || 'Failed to load purchase report.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Total Purchased $"
          tooltip={PURCHASE_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.totalPurchased, currency)}
          previousValue={summary?.previousTotalPurchased}
        />
        <EnterpriseKpiCard
          label="Invoice Count"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.invoiceCount ?? 0)}
        />
        <EnterpriseKpiCard
          label="Avg Cost/Unit"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.avgCostPerUnit, currency)}
          sublabel={`${qty(summary?.totalUnits)} total units`}
        />
        <EnterpriseKpiCard
          label="Vendor Count"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.vendorCount ?? 0)}
          sublabel={`${summary?.productCount || 0} products`}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No purchase data for the selected filters."
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Spend by Category" description="Purchasing spend ranked by product category">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendByCategory.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="spend" name="Spend" fill="#0f766e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Spend by Vendor" description="Top vendors by purchasing volume">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendByVendor.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="vendor" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="spend" name="Spend" fill="#1d4ed8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Weekly Purchase Trend" description="Spend and invoice volume by week">
            {isLoading ? (
              <ChartLoadingState />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyPurchaseTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tickFormatter={(v) => `$${v}`} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                    <Tooltip formatter={(v, name) => (name === 'Invoices' ? v : formatMoney(v, currency))} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#0f766e" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="invoiceCount" name="Invoices" stroke="#b45309" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Product Purchases" description="Line-level product purchasing detail">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['product', 'category', 'vendor']}
              searchPlaceholder="Search products, categories, vendors…"
              emptyMessage="No product purchase rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}
    </div>
  );
}
