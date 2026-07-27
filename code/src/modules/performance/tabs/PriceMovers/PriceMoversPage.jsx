import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
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
import { usePriceMovers, usePriceMoversDrilldown } from '@/modules/performance/hooks/usePriceMovers';
import {
  formatMoney,
  formatPct,
  exportRowsToCsv,
} from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Product', accessor: 'product' },
  { header: 'Vendor', accessor: 'vendor' },
  { header: 'Category', accessor: 'category' },
  { header: 'Unit', accessor: 'unit' },
  { header: 'Current Price', accessor: 'currentPrice' },
  { header: 'Previous Price', accessor: 'previousPrice' },
  { header: 'Price Change', accessor: 'priceChange' },
  { header: '% Change', accessor: 'percentageChange' },
  { header: 'Normalized Quantity', accessor: 'normalizedPurchasedQuantity' },
  { header: 'Normalized Unit', accessor: 'normalizedQuantityUnit' },
  { header: 'Unit Price Difference', accessor: 'unitPriceDifference' },
  { header: 'Impact Evidence', accessor: rawImpactBasis },
  { header: 'Mapping Confidence', accessor: 'mappingConfidence' },
  { header: 'Current Spend', accessor: 'currentSpend' },
  { header: 'Estimated Impact', accessor: 'estimatedImpact' },
  { header: 'Invoice Count', accessor: 'invoiceCount' },
  { header: 'Last Purchase', accessor: 'lastPurchase' },
  { header: 'Mapping Status', accessor: 'mappingStatus' },
  { header: 'Comparability', accessor: 'comparabilityStatus' },
  { header: 'Outlier', accessor: 'outlierStatus' },
];

const PRICE_TOOLTIP =
  'Normalized weighted-average unit cost = line total / (qty x conversion multiplier). Comparisons require the same mapped product and normalized UOM. Not Comparable returns null percent change.';

function qtyLabel(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n)
    : 'n/a';
}

function rawImpactBasis(row) {
  if (row?.unitPriceDifference == null || row?.normalizedPurchasedQuantity == null) return '';
  const unit = row.normalizedQuantityUnit || row.unit || '';
  return `${row.unitPriceDifference} x ${row.normalizedPurchasedQuantity} ${unit} = ${row.estimatedImpact ?? ''}`.trim();
}

function impactBasisLabel(row, currency) {
  if (row?.unitPriceDifference == null || row?.normalizedPurchasedQuantity == null) {
    return row?.confidence === 'unit_mapping_unverified' ? 'Unverified mapping' : 'Basis unavailable';
  }
  const unit = row.normalizedQuantityUnit || row.unit || '';
  const result = row.estimatedImpact == null ? '-' : formatMoney(row.estimatedImpact, currency);
  return `${formatMoney(row.unitPriceDifference, currency)} x ${qtyLabel(row.normalizedPurchasedQuantity)} ${unit} = ${result}`;
}

export default function PriceMoversPage({ periodStart, periodEnd } = {}) {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    dateFrom: periodStart,
    dateTo: periodEnd,
    locationIds: location?.id ? [location.id] : [],
  });

  const [drillProduct, setDrillProduct] = useState(null);

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
    summary,
    ranking,
    trend,
    distribution,
    scatter,
    categoryInflation,
    vendorImpact,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = usePriceMovers({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const drilldown = usePriceMoversDrilldown({
    organizationId: organization?.id,
    filters: filterState.filters,
    productId: drillProduct?.productId || null,
    productName: drillProduct?.product || null,
    enabled: Boolean(drillProduct),
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterVendors = metadata?.filterOptions?.vendors || [];

  const trendSeries = useMemo(() => {
    const byBucket = new Map();
    for (const point of trend || []) {
      if (!byBucket.has(point.bucket)) {
        byBucket.set(point.bucket, { bucket: point.bucket, bucketStart: point.bucketStart });
      }
      byBucket.get(point.bucket)[point.product] = Number(point.unitCost) || 0;
    }
    return [...byBucket.values()].sort((a, b) => String(a.bucketStart).localeCompare(String(b.bucketStart)));
  }, [trend]);

  const trendKeys = useMemo(() => {
    const keys = new Set();
    for (const point of trend || []) keys.add(point.product);
    return [...keys];
  }, [trend]);

  const heatMax = Math.max(
    1,
    ...categoryInflation.map((c) => Math.abs(Number(c.averagePercentageChange) || 0))
  );

  const tableColumns = useMemo(
    () => [
      { accessor: 'product', header: 'Product', cell: (row) => <span className="font-medium">{row.product}</span> },
      { accessor: 'vendor', header: 'Vendor' },
      { accessor: 'category', header: 'Category' },
      {
        accessor: 'currentPrice',
        header: 'Current price',
        cell: (row) => (row.currentPrice == null ? '—' : formatMoney(row.currentPrice, currency)),
      },
      {
        accessor: 'previousPrice',
        header: 'Previous price',
        cell: (row) => (row.previousPrice == null ? '—' : formatMoney(row.previousPrice, currency)),
      },
      {
        accessor: 'priceChange',
        header: 'Price change',
        cell: (row) => (row.priceChange == null ? 'Not Comparable' : formatMoney(row.priceChange, currency)),
      },
      {
        accessor: 'percentageChange',
        header: '% change',
        cell: (row) => (row.percentageChange == null ? '—' : formatPct(row.percentageChange)),
      },
      {
        accessor: 'currentSpend',
        header: 'Current spend',
        cell: (row) => formatMoney(row.currentSpend, currency),
      },
      {
        accessor: 'impactBasis',
        header: 'Impact basis',
        cell: (row) => (
          <div className="min-w-[220px] text-xs leading-5">
            <div className="font-medium">{impactBasisLabel(row, currency)}</div>
            <div className="text-muted-foreground">
              {row.impactEvidenceComplete ? 'Verified evidence' : row.confidence || 'Evidence incomplete'}
            </div>
          </div>
        ),
      },
      {
        accessor: 'estimatedImpact',
        header: 'Est. impact',
        cell: (row) => (row.estimatedImpact == null ? '-' : formatMoney(row.estimatedImpact, currency)),
      },
      { accessor: 'invoiceCount', header: 'Invoices' },
      { accessor: 'lastPurchase', header: 'Last purchase' },
      {
        accessor: 'mappingStatus',
        header: 'Mapping',
        cell: (row) => <Badge variant="secondary">{row.mappingStatus}</Badge>,
      },
      {
        accessor: 'comparabilityStatus',
        header: 'Comparability',
        cell: (row) => (
          <Badge variant={row.comparabilityStatus === 'comparable' ? 'secondary' : 'outline'}>
            {row.comparabilityStatus === 'comparable' ? 'Comparable' : 'Not Comparable'}
          </Badge>
        ),
      },
      {
        accessor: 'outlierStatus',
        header: 'Outlier',
        cell: (row) =>
          row.outlierStatus === 'outlier' ? (
            <Badge variant="destructive">Outlier</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">{row.outlierStatus || '—'}</span>
          ),
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
          <h2 className="text-xl font-semibold tracking-tight">Price Movers</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Which products and vendors are driving purchasing price changes, and what is the estimated financial impact.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `price-movers-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        locations={locations}
        locationLocked
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
        <ChartErrorState message={error?.message || 'Failed to load price movers.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Products with Price Increases"
          tooltip={PRICE_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.productsWithIncreases ?? 0)}
        />
        <EnterpriseKpiCard
          label="Products with Price Decreases"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.productsWithDecreases ?? 0)}
        />
        <EnterpriseKpiCard
          label="Average Price Change"
          loading={isLoading}
          empty={showEmpty || summary?.averagePriceChange == null}
          error={showError}
          value={formatPct(summary?.averagePriceChange)}
        />
        <EnterpriseKpiCard
          label="Estimated Unfavorable Impact"
          tooltip="Sum of positive estimated impacts. Each row exposes unit price difference x normalized purchased quantity = estimated impact."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.estimatedUnfavorableImpact, currency)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Estimated Favorable Impact"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.estimatedFavorableImpact, currency)}
          status="positive"
        />
        <EnterpriseKpiCard
          label="Largest Price Increase"
          loading={isLoading}
          empty={showEmpty || !summary?.largestPriceIncrease}
          error={showError}
          value={summary?.largestPriceIncrease?.product || '—'}
          sublabel={
            summary?.largestPriceIncrease
              ? `${formatPct(summary.largestPriceIncrease.percentageChange)} · ${formatMoney(summary.largestPriceIncrease.estimatedImpact, currency)} impact`
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Largest Price Decrease"
          loading={isLoading}
          empty={showEmpty || !summary?.largestPriceDecrease}
          error={showError}
          value={summary?.largestPriceDecrease?.product || '—'}
          sublabel={
            summary?.largestPriceDecrease
              ? formatPct(summary.largestPriceDecrease.percentageChange)
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Most Volatile Product"
          loading={isLoading}
          empty={showEmpty || !summary?.mostVolatileProduct}
          error={showError}
          value={summary?.mostVolatileProduct?.product || '—'}
          sublabel={
            summary?.mostVolatileProduct
              ? formatPct(summary.mostVolatileProduct.percentageChange)
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Vendors Driving Increases"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.vendorsDrivingIncreases ?? 0)}
        />
        <EnterpriseKpiCard
          label="Non-Comparable Products"
          tooltip="Unmapped products or incompatible UOM/pack comparisons. Shown as Not Comparable with null % change."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.nonComparableProducts ?? 0)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No purchasing price-mover data was found for the selected filters."
          onClearFilters={filterState.clearFilters}
          onViewInvoices={() => navigate('/Invoices')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Price Movers Ranking" description="Top estimated impact products with normalized quantity basis">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ranking.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="product" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v, _n, props) => [
                          formatMoney(v, currency),
                          `${props?.payload?.percentageChange != null ? formatPct(props.payload.percentageChange) : 'n/a'}`,
                        ]}
                      />
                      <Bar
                        dataKey="estimatedImpact"
                        name="Est. impact"
                        fill="#b45309"
                        cursor="pointer"
                        onClick={(d) => setDrillProduct(d)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Product Price Trend" description="Normalized unit cost over time">
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
                      {trendKeys.map((key, idx) => (
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
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard title="Price Change Distribution" description="Histogram of % change">
              {isLoading ? (
                <ChartLoadingState height={260} />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Products" fill="#1d4ed8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Price Impact Scatter" description="Percent change vs estimated impact; row detail shows normalized quantity basis" className="xl:col-span-2">
              {isLoading ? (
                <ChartLoadingState height={260} />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="percentageChange" name="% change" unit="%" />
                      <YAxis type="number" dataKey="estimatedImpact" name="Impact" tickFormatter={(v) => `$${v}`} />
                      <ZAxis type="number" dataKey="currentSpend" range={[40, 200]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(v, name) => (name === 'Impact' ? formatMoney(v, currency) : v)}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.product || ''}
                      />
                      <Scatter
                        data={scatter}
                        fill="#0f766e"
                        cursor="pointer"
                        onClick={(d) => setDrillProduct(d)}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Category Inflation Heatmap" description="Average % price change by category">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="space-y-2 py-2">
                  {categoryInflation.map((row) => {
                    const intensity = Math.min(1, Math.abs(Number(row.averagePercentageChange) || 0) / heatMax);
                    const up = (row.averagePercentageChange || 0) >= 0;
                    return (
                      <div key={row.category} className="flex items-center gap-3">
                        <div className="w-36 text-sm truncate">{row.category}</div>
                        <div className="flex-1 h-8 rounded-md overflow-hidden bg-muted/40">
                          <div
                            className="h-full flex items-center px-2 text-xs font-medium text-white"
                            style={{
                              width: `${Math.max(8, intensity * 100)}%`,
                              backgroundColor: up ? `rgba(180, 83, 9, ${0.35 + intensity * 0.65})` : `rgba(15, 118, 110, ${0.35 + intensity * 0.65})`,
                            }}
                          >
                            {formatPct(row.averagePercentageChange)}
                          </div>
                        </div>
                        <div className="w-24 text-xs text-right text-muted-foreground">
                          {formatMoney(row.unfavorableImpact, currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Vendor Impact Ranking" description="Unfavorable price impact by vendor">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vendorImpact.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="vendor" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="unfavorableImpact" name="Unfavorable impact" fill="#be123c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Price Movers Detail" description="Click a row to open product drill-down">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['product', 'vendor', 'category']}
              searchPlaceholder="Search products, vendors, categories…"
              onRowClick={(row) => setDrillProduct(row)}
              emptyMessage="No price mover rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}

      <DrilldownDrawer
        open={Boolean(drillProduct)}
        onOpenChange={(open) => {
          if (!open) setDrillProduct(null);
        }}
        title={drillProduct?.product || 'Product'}
        description="Purchasing price drill-down"
      >
        {drilldown.isLoading ? (
          <ChartLoadingState />
        ) : drilldown.isError ? (
          <ChartErrorState
            message={drilldown.error?.message || 'Failed to load drill-down'}
            onRetry={() => drilldown.refetch()}
          />
        ) : (
          <PriceMoversDrilldownBody
            data={drilldown.data}
            currency={currency}
            onOpenInvoice={(id) => navigate(`/Invoices?invoice=${id}`)}
          />
        )}
      </DrilldownDrawer>
    </div>
  );
}

function PriceMoversDrilldownBody({ data, currency, onOpenInvoice }) {
  if (!data) return null;
  const s = data.summary || {};
  const n = data.normalization || {};

  return (
    <div className="space-y-5 pb-8">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Current price" value={s.currentPrice == null ? '—' : formatMoney(s.currentPrice, currency)} />
        <MiniStat label="Previous price" value={s.previousPrice == null ? '—' : formatMoney(s.previousPrice, currency)} />
        <MiniStat
          label="Price change"
          value={s.priceChange == null ? 'Not Comparable' : formatMoney(s.priceChange, currency)}
          sub={s.percentageChange == null ? undefined : formatPct(s.percentageChange)}
        />
        <MiniStat label="Current spend" value={formatMoney(s.currentSpend, currency)} />
        <MiniStat
          label="Impact basis"
          value={impactBasisLabel(s, currency)}
          sub={s.impactEvidenceComplete ? 'Verified evidence' : s.mappingConfidence || undefined}
        />
        <MiniStat label="Invoices" value={String(s.invoiceCount || 0)} />
        <MiniStat label="Vendors" value={String(s.vendorCount || 0)} />
      </div>

      <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1">
        <p className="font-medium">Normalization details</p>
        <p className="text-muted-foreground text-xs">{n.formula}</p>
        <p className="text-xs">Unit: {n.reportUnit || '—'} · Pack: {n.packSize || '—'} · Multiplier: {n.conversionMultiplier ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{n.comparabilityRule}</p>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Price history</TabsTrigger>
          <TabsTrigger value="vendors">Vendor comparison</TabsTrigger>
          <TabsTrigger value="purchases">Purchase history</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="mt-3">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.priceHistory || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => formatMoney(v, currency)} />
                <Line type="monotone" dataKey="unitCost" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
        <TabsContent value="vendors" className="mt-3">
          <SimpleTable
            columns={['Vendor', 'Unit price', 'Spend', 'Invoices', 'Unit']}
            rows={(data.vendorComparison || []).map((v) => [
              v.vendor,
              v.currentPrice == null ? '—' : formatMoney(v.currentPrice, currency),
              formatMoney(v.spend, currency),
              v.invoiceCount,
              v.unit || '—',
            ])}
          />
        </TabsContent>
        <TabsContent value="purchases" className="mt-3">
          <SimpleTable
            columns={['Invoice', 'Date', 'Vendor', 'Qty', 'Unit cost', 'Amount', 'Status']}
            rows={(data.purchaseHistory || []).map((inv) => [
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
              inv.quantity,
              inv.normalizedUnitCost == null ? '—' : formatMoney(inv.normalizedUnitCost, currency),
              formatMoney(inv.amount, currency),
              inv.status,
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

