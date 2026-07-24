import React, { useMemo, useState } from 'react';
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
import { useInventoryUsage, useInventoryUsageDrilldown } from '@/modules/performance/hooks/useInventoryUsage';
import { formatMoney, exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const EXPORT_COLUMNS = [
  { header: 'Product', accessor: 'product' },
  { header: 'Category', accessor: 'category' },
  { header: 'Location', accessor: 'location' },
  { header: 'Opening Quantity', accessor: 'openingQuantity' },
  { header: 'Received Quantity', accessor: 'receivedQuantity' },
  { header: 'Transfers In', accessor: 'transfersIn' },
  { header: 'Transfers Out', accessor: 'transfersOut' },
  { header: 'Waste Quantity', accessor: 'wasteQuantity' },
  { header: 'Adjustment Quantity', accessor: 'adjustmentQuantity' },
  { header: 'Closing Quantity', accessor: 'closingQuantity' },
  { header: 'Actual Usage', accessor: 'actualUsage' },
  { header: 'Unit Cost', accessor: 'unitCost' },
  { header: 'Usage Value', accessor: 'usageValue' },
  { header: 'Waste Value', accessor: 'wasteValue' },
  { header: 'Count Date', accessor: 'countDate' },
  { header: 'Last Movement Date', accessor: 'lastMovementDate' },
  { header: 'Data Quality Status', accessor: 'dataQualityStatus' },
  { header: 'ABC Class', accessor: 'abcClass' },
];

const USAGE_TOOLTIP =
  'Actual Usage = Opening + Receipts + Transfers In − Transfers Out + Adjustments(signed) − Closing. Waste is separate. Requires opening and closing completed counts; otherwise Not Calculable. No POS/theoretical usage.';

function qty(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function UsageReportPage({ periodStart, periodEnd } = {}) {
  const navigate = useNavigate();
  const { organization, location } = useAuth();
  const filterState = usePerformanceFilters({
    dateFrom: periodStart,
    dateTo: periodEnd,
    locationIds: location?.id ? [location.id] : [],
  });

  const [drillRow, setDrillRow] = useState(null);

  const {
    summary,
    waterfall,
    usageByCategory,
    valueTrend,
    wasteTrend,
    productRanking,
    locationComparison,
    heatmap,
    abc,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useInventoryUsage({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const drilldown = useInventoryUsageDrilldown({
    organizationId: organization?.id,
    filters: filterState.filters,
    inventoryId: drillRow?.inventoryId || null,
    productId: drillRow?.productId || null,
    enabled: Boolean(drillRow),
  });

  const currency = metadata?.currency || 'USD';
  const filterCategories = metadata?.filterOptions?.categories || [];
  const filterLocations = metadata?.filterOptions?.locations || [];

  const heatMax = Math.max(1, ...heatmap.map((h) => Math.abs(Number(h.usageValue) || 0)));

  const tableColumns = useMemo(
    () => [
      { accessor: 'product', header: 'Product', cell: (row) => <span className="font-medium">{row.product}</span> },
      { accessor: 'category', header: 'Category' },
      { accessor: 'location', header: 'Location' },
      { accessor: 'openingQuantity', header: 'Opening', cell: (row) => qty(row.openingQuantity) },
      { accessor: 'receivedQuantity', header: 'Received', cell: (row) => qty(row.receivedQuantity) },
      { accessor: 'transfersIn', header: 'Xfer In', cell: (row) => qty(row.transfersIn) },
      { accessor: 'transfersOut', header: 'Xfer Out', cell: (row) => qty(row.transfersOut) },
      { accessor: 'wasteQuantity', header: 'Waste', cell: (row) => qty(row.wasteQuantity) },
      { accessor: 'adjustmentQuantity', header: 'Adj', cell: (row) => qty(row.adjustmentQuantity) },
      { accessor: 'closingQuantity', header: 'Closing', cell: (row) => qty(row.closingQuantity) },
      {
        accessor: 'actualUsage',
        header: 'Actual usage',
        cell: (row) =>
          row.actualUsage == null || row.dataQualityStatus !== 'calculable' ? (
            <span className="text-muted-foreground">Not Calculable</span>
          ) : (
            qty(row.actualUsage)
          ),
      },
      {
        accessor: 'unitCost',
        header: 'Unit cost',
        cell: (row) => formatMoney(row.unitCost, currency),
      },
      {
        accessor: 'usageValue',
        header: 'Usage value',
        cell: (row) => (row.usageValue == null ? '—' : formatMoney(row.usageValue, currency)),
      },
      {
        accessor: 'wasteValue',
        header: 'Waste value',
        cell: (row) => formatMoney(row.wasteValue, currency),
      },
      { accessor: 'countDate', header: 'Count date' },
      { accessor: 'lastMovementDate', header: 'Last movement' },
      {
        accessor: 'dataQualityStatus',
        header: 'Data quality',
        cell: (row) => (
          <Badge variant={row.dataQualityStatus === 'calculable' ? 'secondary' : 'outline'}>
            {row.dataQualityStatus === 'calculable' ? 'Calculable' : 'Not Calculable'}
          </Badge>
        ),
      },
      {
        accessor: 'abcClass',
        header: 'ABC',
        cell: (row) => <span className="text-xs font-medium">{row.abcClass || '—'}</span>,
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
          <h2 className="text-xl font-semibold tracking-tight">Inventory Usage Report</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Actual inventory received, used, wasted, transferred, and adjusted — from counts and movements only. No POS or theoretical usage.
          </p>
          <DataFreshnessLabel value={metadata?.dataFreshness} className="text-xs text-muted-foreground mt-1" />
        </div>
        <ExportMenu
          disabled={!tableRows.length}
          onExportCsv={() =>
            exportRowsToCsv(
              tableRows,
              EXPORT_COLUMNS,
              `inventory-usage-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        <ChartErrorState message={error?.message || 'Failed to load inventory usage.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Opening Inventory Value"
          tooltip={USAGE_TOOLTIP}
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.openingInventoryValue, currency)}
        />
        <EnterpriseKpiCard
          label="Closing Inventory Value"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.closingInventoryValue, currency)}
        />
        <EnterpriseKpiCard
          label="Inventory Received"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.inventoryReceived, currency)}
        />
        <EnterpriseKpiCard
          label="Actual Inventory Usage"
          tooltip={USAGE_TOOLTIP}
          loading={isLoading}
          empty={showEmpty || summary?.actualInventoryUsage == null}
          error={showError}
          value={
            summary?.calculableProducts === 0
              ? 'Not Calculable'
              : formatMoney(summary?.actualInventoryUsage, currency)
          }
        />
        <EnterpriseKpiCard
          label="Waste Value"
          tooltip="From wastage logs (preferred) or wastage movements. Not added into Actual Usage."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.wasteValue, currency)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Transfers In"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.transfersIn, currency)}
        />
        <EnterpriseKpiCard
          label="Transfers Out"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.transfersOut, currency)}
        />
        <EnterpriseKpiCard
          label="Inventory Adjustments"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.inventoryAdjustments, currency)}
        />
        <EnterpriseKpiCard
          label="Highest-Usage Category"
          loading={isLoading}
          empty={showEmpty || !summary?.highestUsageCategory}
          error={showError}
          value={summary?.highestUsageCategory?.category || '—'}
          sublabel={
            summary?.highestUsageCategory
              ? formatMoney(summary.highestUsageCategory.usageValue, currency)
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Highest-Waste Product"
          loading={isLoading}
          empty={showEmpty || !summary?.highestWasteProduct}
          error={showError}
          value={summary?.highestWasteProduct?.product || '—'}
          sublabel={
            summary?.highestWasteProduct
              ? formatMoney(summary.highestWasteProduct.wasteValue, currency)
              : undefined
          }
        />
        <EnterpriseKpiCard
          label="Inventory Value Change"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={formatMoney(summary?.inventoryValueChange, currency)}
          status={(summary?.inventoryValueChange || 0) < 0 ? 'negative' : 'neutral'}
        />
        <EnterpriseKpiCard
          label="Uncounted / Missing"
          tooltip="Items missing opening or closing completed counts."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.uncountedOrMissing ?? 0)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState message="No inventory rows for the selected filters. Add stock, counts, and movements — or enable Performance Demo Mode." />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Inventory Flow Waterfall" description="Opening → receipts/transfers/adjustments → closing → usage">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterfall}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="value" name="Value">
                        {waterfall.map((entry, i) => (
                          <Cell
                            key={entry.step}
                            fill={entry.value < 0 ? '#be123c' : COLORS[i % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Usage by Category" description="Calculable actual usage value">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageByCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="usageValue" name="Usage value" fill="#0f766e" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Inventory Value Trend" description="Weekly received / movement proxy / waste">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={valueTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Line type="monotone" dataKey="receivedValue" name="Received" stroke="#0f766e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="usageProxyValue" name="Outflows" stroke="#b45309" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="wasteValue" name="Waste" stroke="#be123c" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Waste Trend" description="Daily waste value from wastage logs">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wasteTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar dataKey="wasteValue" name="Waste value" fill="#be123c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Product Usage Ranking" description="Top calculable usage by value">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productRanking.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="product" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar
                        dataKey="usageValue"
                        name="Usage value"
                        fill="#1d4ed8"
                        cursor="pointer"
                        onClick={(d) => setDrillRow(d)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Location Comparison" description="Usage and waste by location">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Legend />
                      <Bar dataKey="usageValue" name="Usage" fill="#0f766e" />
                      <Bar dataKey="wasteValue" name="Waste" fill="#be123c" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Inventory Movement Heatmap" description="Usage value by category × location">
              {isLoading ? (
                <ChartLoadingState />
              ) : heatmap.length === 0 ? (
                <ChartEmptyState message="No heatmap cells for this period." />
              ) : (
                <div className="space-y-2 py-2 max-h-[320px] overflow-auto">
                  {heatmap.map((cell) => {
                    const intensity = Math.min(1, Math.abs(Number(cell.usageValue) || 0) / heatMax);
                    return (
                      <div key={`${cell.category}-${cell.location}`} className="flex items-center gap-3">
                        <div className="w-28 text-xs truncate">{cell.category}</div>
                        <div className="w-20 text-xs text-muted-foreground truncate">{cell.location}</div>
                        <div className="flex-1 h-7 rounded-md overflow-hidden bg-muted/40">
                          <div
                            className="h-full flex items-center px-2 text-xs font-medium text-white"
                            style={{
                              width: `${Math.max(8, intensity * 100)}%`,
                              backgroundColor: `rgba(15, 118, 110, ${0.3 + intensity * 0.7})`,
                            }}
                          >
                            {formatMoney(cell.usageValue, currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>

            <ChartCard title="ABC Inventory Classification" description="By calculable usage value (80/15/5)">
              {isLoading ? (
                <ChartLoadingState />
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={abc}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="class" />
                      <YAxis yAxisId="left" tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="usageValue" name="Usage value" fill="#0f766e" />
                      <Bar yAxisId="right" dataKey="productCount" name="Products" fill="#b45309" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Inventory Usage Detail" description="Click a row for product drill-down">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['product', 'category', 'location']}
              searchPlaceholder="Search products, categories, locations…"
              onRowClick={(row) => setDrillRow(row)}
              emptyMessage="No inventory usage rows for the selected filters."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />
        </>
      )}

      <DrilldownDrawer
        open={Boolean(drillRow)}
        onOpenChange={(open) => {
          if (!open) setDrillRow(null);
        }}
        title={drillRow?.product || 'Product'}
        description="Inventory usage drill-down"
      >
        {drilldown.isLoading ? (
          <ChartLoadingState />
        ) : drilldown.isError ? (
          <ChartErrorState
            message={drilldown.error?.message || 'Failed to load drill-down'}
            onRetry={() => drilldown.refetch()}
          />
        ) : (
          <UsageDrilldownBody
            data={drilldown.data}
            currency={currency}
            onOpenInventory={() => navigate('/Inventory')}
          />
        )}
      </DrilldownDrawer>
    </div>
  );
}

function UsageDrilldownBody({ data, currency, onOpenInventory }) {
  if (!data) return null;
  const s = data.summary || {};
  const n = data.normalization || {};

  return (
    <div className="space-y-5 pb-8">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Current qty" value={qty(s.currentQuantity)} />
        <MiniStat label="Unit cost" value={formatMoney(s.unitCost, currency)} />
        <MiniStat label="Category" value={s.category || '—'} />
        <MiniStat label="Location" value={s.location || '—'} />
        <MiniStat label="Unit" value={s.unit || '—'} />
        <MiniStat label="Last counted" value={s.lastCountedDate || '—'} />
      </div>

      <div className="rounded-lg border border-border/50 p-3 text-sm space-y-1">
        <p className="font-medium">Normalization / formula</p>
        <p className="text-xs text-muted-foreground">{n.formula}</p>
        <p className="text-xs text-muted-foreground">{n.wasteRule}</p>
        <button type="button" className="text-xs text-brand underline mt-1" onClick={onOpenInventory}>
          Open Inventory module
        </button>
      </div>

      <Tabs defaultValue="counts">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="counts">Counts</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="waste">Waste</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="trend">Usage trend</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>

        <TabsContent value="counts" className="mt-3">
          <SimpleTable
            columns={['Date', 'Qty', 'Session', 'Status']}
            rows={(data.countHistory || []).map((c) => [c.date, qty(c.countedQuantity), c.sessionId, c.status])}
          />
        </TabsContent>
        <TabsContent value="receipts" className="mt-3">
          <SimpleTable
            columns={['Date', 'Qty', 'Type', 'Source']}
            rows={(data.receiptHistory || []).map((r) => [
              r.date,
              qty(r.quantity),
              r.movementType,
              r.sourceId || '—',
            ])}
          />
        </TabsContent>
        <TabsContent value="waste" className="mt-3">
          <SimpleTable
            columns={['Date', 'Qty', 'Value', 'Reason']}
            rows={(data.wasteHistory || []).map((w) => [
              w.date,
              qty(w.quantity),
              formatMoney(w.value, currency),
              w.reason || '—',
            ])}
          />
        </TabsContent>
        <TabsContent value="transfers" className="mt-3">
          <SimpleTable
            columns={['Date', 'Qty', 'Class', 'Source']}
            rows={(data.transferHistory || []).map((t) => [
              t.date,
              qty(t.quantity),
              t.class,
              t.sourceId || '—',
            ])}
          />
        </TabsContent>
        <TabsContent value="adjustments" className="mt-3">
          <SimpleTable
            columns={['Date', 'Qty', 'Type']}
            rows={(data.adjustmentHistory || []).map((a) => [a.date, qty(a.quantity), a.movementType])}
          />
        </TabsContent>
        <TabsContent value="trend" className="mt-3">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.usageTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="received" stroke="#0f766e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="transfersOut" stroke="#b45309" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="wasteQty" stroke="#be123c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
        <TabsContent value="locations" className="mt-3">
          <SimpleTable
            columns={['Location', 'Qty', 'Unit cost', 'Value']}
            rows={(data.locationComparison || []).map((l) => [
              l.location,
              qty(l.currentQuantity),
              formatMoney(l.unitCost, currency),
              formatMoney(l.value, currency),
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1 truncate">{value}</p>
    </div>
  );
}

function SimpleTable({ columns, rows }) {
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground py-4">No records in this period.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j} className="whitespace-nowrap text-sm">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

