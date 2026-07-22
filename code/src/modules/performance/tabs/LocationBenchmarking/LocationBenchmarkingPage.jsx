import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { useLocationBenchmarking } from '@/modules/performance/hooks/useLocationBenchmarking';
import { formatMoney, formatPct, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Location', accessor: 'location' },
  { header: 'Tier', accessor: 'tier' },
  { header: 'Spend', accessor: 'spend' },
  { header: 'Inventory Value', accessor: 'inventoryValue' },
  { header: 'Cost/Location', accessor: 'costPerLocation' },
  { header: 'Variance %', accessor: 'variancePct' },
  { header: 'Payment Completion %', accessor: 'paymentCompletionPct' },
  { header: 'Recipe Coverage %', accessor: 'recipeCoveragePct' },
  { header: 'Efficiency Score', accessor: 'efficiencyScore' },
];

const BENCHMARK_TOOLTIP =
  'Compares locations on purchasing cost efficiency, inventory valuation, payment completion, and recipe coverage. Demo data only.';

export default function LocationBenchmarkingPage() {
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    locationIds: location?.id ? [location.id] : [],
  });

  const {
    summary,
    locationCostComparison,
    categoryCostByLocation,
    efficiencyRanking,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useLocationBenchmarking({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterLocations = metadata?.filterOptions?.locations || [];

  const heatCategories = useMemo(() => {
    const cats = new Set(categoryCostByLocation.map((c) => c.category));
    return [...cats].slice(0, 6);
  }, [categoryCostByLocation]);

  const heatMax = Math.max(
    1,
    ...categoryCostByLocation.map((c) => Math.abs(Number(c.spend) || 0))
  );

  const groupedHeatmapData = useMemo(() => {
    const byLocation = new Map();
    for (const cell of categoryCostByLocation) {
      if (!byLocation.has(cell.location)) {
        byLocation.set(cell.location, { location: cell.location });
      }
      byLocation.get(cell.location)[cell.category] = cell.spend;
    }
    return [...byLocation.values()];
  }, [categoryCostByLocation]);

  const tableColumns = useMemo(
    () => [
      { accessor: 'location', header: 'Location', cell: (row) => <span className="font-medium">{row.location}</span> },
      {
        accessor: 'spend',
        header: 'Spend',
        cell: (row) => formatMoney(row.spend, currency),
      },
      {
        accessor: 'inventoryValue',
        header: 'Inventory value',
        cell: (row) => formatMoney(row.inventoryValue, currency),
      },
      {
        accessor: 'costPerLocation',
        header: 'Cost/location',
        cell: (row) => formatMoney(row.costPerLocation, currency),
      },
      {
        accessor: 'paymentCompletionPct',
        header: 'Payment completion',
        cell: (row) => (
          <Badge variant={row.paymentCompletionPct >= 90 ? 'secondary' : 'outline'}>
            {formatPct(row.paymentCompletionPct)}
          </Badge>
        ),
      },
      {
        accessor: 'recipeCoveragePct',
        header: 'Recipe coverage',
        cell: (row) => formatPct(row.recipeCoveragePct),
      },
      {
        accessor: 'variancePct',
        header: 'Variance',
        cell: (row) => (
          <span className={row.variancePct > 10 ? 'text-destructive font-medium' : ''}>
            {formatPct(row.variancePct)}
          </span>
        ),
      },
      {
        accessor: 'efficiencyScore',
        header: 'Efficiency',
        cell: (row) => row.efficiencyScore?.toFixed(1) ?? '—',
      },
    ],
    [currency]
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Location Benchmarking</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Compare location cost efficiency, category spend patterns, payment completion, and recipe coverage across your portfolio.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `location-benchmarking-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        <ChartErrorState message={error?.message || 'Failed to load location benchmarking.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Locations Compared"
          tooltip={BENCHMARK_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.locationsCompared ?? 0)}
        />
        <EnterpriseKpiCard
          label="Best Cost/Location"
          loading={isLoading}
          empty={showEmpty || !summary?.bestCostPerLocation}
          error={showError}
          value={summary?.bestCostPerLocation?.location || '—'}
          sublabel={
            summary?.bestCostPerLocation
              ? formatMoney(summary.bestCostPerLocation.costPerLocation, currency)
              : undefined
          }
          status="positive"
        />
        <EnterpriseKpiCard
          label="Worst Cost/Location"
          loading={isLoading}
          empty={showEmpty || !summary?.worstCostPerLocation}
          error={showError}
          value={summary?.worstCostPerLocation?.location || '—'}
          sublabel={
            summary?.worstCostPerLocation
              ? formatMoney(summary.worstCostPerLocation.costPerLocation, currency)
              : undefined
          }
          status="negative"
        />
        <EnterpriseKpiCard
          label="Avg Variance %"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatPct(summary?.avgVariancePct)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No location benchmarking data for the selected filters."
          onClearFilters={filterState.clearFilters}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Location Cost Comparison" description="Spend and cost per location vs org baseline">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationCostComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        formatter={(v, name) =>
                          name === 'Variance %' ? formatPct(v) : formatMoney(v, currency)
                        }
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="spend" name="Spend" fill="#0f766e" />
                      <Bar yAxisId="left" dataKey="costPerLocation" name="Cost/location" fill="#1d4ed8" />
                      <Bar yAxisId="right" dataKey="variancePct" name="Variance %" fill="#b45309" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Efficiency Ranking" description="Composite score: cost, payments, recipe coverage">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={efficiencyRanking} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="location" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="efficiencyScore" name="Efficiency score" fill="#0f766e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Cost per Category by Location" description="Grouped spend heatmap by category × location">
            {isLoading ? (
              <ChartLoadingState />
            ) : categoryCostByLocation.length === 0 ? (
              <ChartEmptyState message="No category/location cells for this period." />
            ) : (
              <div className="space-y-4">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={groupedHeatmapData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="location" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      {heatCategories.map((cat, idx) => (
                        <Bar key={cat} dataKey={cat} name={cat} fill={COLORS[idx % COLORS.length]} stackId="cat" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 max-h-[240px] overflow-auto py-1">
                  {categoryCostByLocation.slice(0, 18).map((cell) => {
                    const intensity = Math.min(1, Math.abs(Number(cell.spend) || 0) / heatMax);
                    return (
                      <div key={`${cell.category}-${cell.location}`} className="flex items-center gap-3">
                        <div className="w-24 text-xs truncate">{cell.category}</div>
                        <div className="w-20 text-xs text-muted-foreground truncate">{cell.location}</div>
                        <div className="flex-1 h-7 rounded-md overflow-hidden bg-muted/40">
                          <div
                            className="h-full flex items-center px-2 text-xs font-medium text-white"
                            style={{
                              width: `${Math.max(8, intensity * 100)}%`,
                              backgroundColor: `rgba(29, 78, 216, ${0.3 + intensity * 0.7})`,
                            }}
                          >
                            {formatMoney(cell.spend, currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Location Detail" description="Spend, inventory, payments, and recipe coverage by location">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['location', 'tier']}
              searchPlaceholder="Search locations…"
              emptyMessage="No location rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}
    </div>
  );
}
