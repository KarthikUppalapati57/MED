import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
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
import { useDailyCostCash } from '@/modules/performance/hooks/useDailyCostCash';
import { formatMoney, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Date', accessor: 'date' },
  { header: 'Day', accessor: 'dayOfWeek' },
  { header: 'Purchases', accessor: 'purchases' },
  { header: 'Payments', accessor: 'payments' },
  { header: 'Net', accessor: 'net' },
  { header: 'Running Balance', accessor: 'runningBalance' },
  { header: 'Invoice Count', accessor: 'invoiceCount' },
  { header: 'Payment Count', accessor: 'paymentCount' },
];

const CASH_TOOLTIP =
  'Purchasing/payables cash view — invoice accruals (purchases) vs payment disbursements. Not POS revenue or full P&L.';

function NetCell({ value, currency }) {
  if (value == null) return '—';
  const positive = value >= 0;
  return (
    <span className={positive ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
      {positive ? '+' : ''}
      {formatMoney(value, currency)}
    </span>
  );
}

export default function DailyCostCashPage() {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    locationIds: location?.id ? [location.id] : [],
  });

  const {
    summary,
    dailyPurchasesVsPayments,
    cumulativeCashOutflow,
    categoryCostByDay,
    payablesAging,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useDailyCostCash({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterLocations = metadata?.filterOptions?.locations || [];
  const sourceModules = metadata?.sourceModules || ['Invoice', 'Inventory', 'Payments'];

  const categoryKeys = useMemo(() => {
    if (!categoryCostByDay.length) return [];
    return Object.keys(categoryCostByDay[0]).filter((k) => !['date', 'label', 'total'].includes(k));
  }, [categoryCostByDay]);

  const tableColumns = useMemo(
    () => [
      {
        accessor: 'date',
        header: 'Date',
        cell: (row) => (
          <span className="font-medium">
            {row.date}{' '}
            <span className="text-muted-foreground font-normal text-xs">({row.dayOfWeek})</span>
          </span>
        ),
      },
      {
        accessor: 'purchases',
        header: 'Purchases',
        cell: (row) => formatMoney(row.purchases, currency),
      },
      {
        accessor: 'payments',
        header: 'Payments',
        cell: (row) => formatMoney(row.payments, currency),
      },
      {
        accessor: 'net',
        header: 'Net',
        cell: (row) => <NetCell value={row.net} currency={currency} />,
      },
      {
        accessor: 'runningBalance',
        header: 'Running balance',
        cell: (row) => formatMoney(row.runningBalance, currency),
      },
      { accessor: 'invoiceCount', header: 'Invoices' },
      { accessor: 'paymentCount', header: 'Payments' },
    ],
    [currency]
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Daily Cost &amp; Cash</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Daily purchasing accruals vs cash paid out — a payables and disbursement view from invoices and payments.
            <strong className="font-medium text-foreground"> Not full P&amp;L or POS revenue.</strong>
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
              `daily-cost-cash-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        <ChartErrorState message={error?.message || 'Failed to load daily cost & cash.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Period Purchases"
          tooltip={CASH_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.periodPurchases, currency)}
        />
        <EnterpriseKpiCard
          label="Cash Paid Out"
          tooltip="Payment disbursements in the period."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.cashPaidOut, currency)}
        />
        <EnterpriseKpiCard
          label="Outstanding Payables"
          tooltip="Open invoice balances not yet paid."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.outstandingPayables, currency)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Net Cash Position"
          tooltip="Cash paid out minus period purchases (payables timing gap)."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.netCashPosition, currency)}
          status={(summary?.netCashPosition || 0) < 0 ? 'negative' : 'neutral'}
        />
        <EnterpriseKpiCard
          label="Avg Daily Purchases"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.avgDailyPurchases, currency)}
        />
        <EnterpriseKpiCard
          label="Avg Daily Payments"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.avgDailyPayments, currency)}
        />
        <EnterpriseKpiCard
          label="Largest Purchase Day"
          loading={isLoading}
          empty={showEmpty || !summary?.largestPurchaseDay}
          error={showError}
          value={summary?.largestPurchaseDay?.date || '—'}
          sublabel={
            summary?.largestPurchaseDay
              ? formatMoney(summary.largestPurchaseDay.purchases, currency)
              : undefined
          }
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No daily cost & cash data for the selected filters. Enable Performance Demo Mode or adjust the date range."
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Daily Purchases vs Payments"
              description="Invoice accruals (bars) vs cash disbursements (line)"
            >
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyPurchasesVsPayments}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Bar dataKey="purchases" name="Purchases" fill={COLORS[0]} barSize={18} />
                      <Bar dataKey="payments" name="Payments" fill={COLORS[1]} barSize={18} />
                      <Line type="monotone" dataKey="net" name="Net" stroke={COLORS[2]} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Cumulative Cash Outflow" description="Running payment total vs purchase accruals">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativeCashOutflow}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="cumulativePayments"
                        name="Cumulative payments"
                        stroke={COLORS[3]}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativePurchases"
                        name="Cumulative purchases"
                        stroke={COLORS[0]}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Category Cost by Day" description="Daily purchase accruals by category">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={categoryCostByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      {categoryKeys.map((key, idx) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Payables Aging" description="Outstanding invoice balances by age bucket">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payablesAging}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="amount" name="Outstanding" fill={COLORS[4]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Daily Detail" description="Purchases, payments, net, and running balance by day">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['date', 'dayOfWeek']}
              searchPlaceholder="Search dates…"
              emptyMessage="No daily rows for the selected period."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />

          <p className="text-xs text-muted-foreground text-center pb-2">
            This report reflects purchasing and payables cash flow only — not POS sales, labor, or full P&amp;L.
          </p>
        </>
      )}
    </div>
  );
}
