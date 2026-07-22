import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { useActionCenter } from '@/modules/performance/hooks/useActionCenter';
import { exportRowsToCsv } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#7c3aed', '#047857'];

const SEVERITY_COLORS = {
  high: '#be123c',
  medium: '#b45309',
  low: '#0f766e',
};

const EXPORT_COLUMNS = [
  { header: 'Module', accessor: 'module' },
  { header: 'Severity', accessor: 'severity' },
  { header: 'Status', accessor: 'status' },
  { header: 'Owner', accessor: 'owner' },
  { header: 'Due Date', accessor: 'dueDate' },
  { header: 'Created Date', accessor: 'createdDate' },
  { header: 'Description', accessor: 'description' },
  { header: 'Age (days)', accessor: 'ageDays' },
];

function SeverityBadge({ severity }) {
  const variant =
    severity === 'high' ? 'destructive' : severity === 'medium' ? 'default' : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }) {
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    overdue: 'Overdue',
    resolved: 'Resolved',
  };
  const variant =
    status === 'overdue'
      ? 'destructive'
      : status === 'resolved'
        ? 'secondary'
        : status === 'in_progress'
          ? 'default'
          : 'outline';
  return (
    <Badge variant={variant} className="capitalize">
      {labels[status] || status}
    </Badge>
  );
}

export default function ActionCenterPage() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const filterState = usePerformanceFilters({});

  const {
    summary,
    actionsByModule,
    severityMix,
    agingBuckets,
    tableRows,
    insights,
    metadata,
    isLoading,
    isError,
    error,
    isEmpty,
    refetch,
  } = useActionCenter({
    organizationId: organization?.id,
    filters: filterState.filters,
  });

  const sourceModules = metadata?.sourceModules || [
    'Invoice',
    'Inventory',
    'Products',
    'Payments',
    'Recipes',
    'Audit',
  ];

  const tableColumns = useMemo(
    () => [
      {
        accessor: 'module',
        header: 'Module',
        cell: (row) => <Badge variant="outline">{row.module}</Badge>,
      },
      {
        accessor: 'severity',
        header: 'Severity',
        cell: (row) => <SeverityBadge severity={row.severity} />,
      },
      {
        accessor: 'status',
        header: 'Status',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        accessor: 'owner',
        header: 'Owner',
        cell: (row) => (
          <span className={row.owner === 'Unassigned' ? 'text-muted-foreground italic' : ''}>
            {row.owner}
          </span>
        ),
      },
      { accessor: 'dueDate', header: 'Due date' },
      {
        accessor: 'description',
        header: 'Description',
        cell: (row) => <span className="max-w-md truncate block">{row.description}</span>,
      },
      { accessor: 'createdDate', header: 'Created' },
      { accessor: 'ageDays', header: 'Age (days)' },
    ],
    []
  );

  const showEmpty = isEmpty && !isLoading;
  const showError = isError && !isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Action Center</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Consolidated operational actions requiring attention across purchasing, inventory, products, payments,
            recipes, and audit logs.
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
              `action-center-${filterState.dateFrom}-${filterState.dateTo}.csv`
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
        locations={[]}
        categories={[]}
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
        <ChartErrorState message={error?.message || 'Failed to load action center.'} onRetry={() => refetch()} />
      ) : null}

      <KpiRibbon>
        <EnterpriseKpiCard
          label="Open Actions"
          tooltip="Actions with status Open or In Progress."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.openActions ?? 0)}
        />
        <EnterpriseKpiCard
          label="High Severity"
          tooltip="Unresolved high-severity items requiring immediate attention."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.highSeverity ?? 0)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Overdue"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.overdue ?? 0)}
          status="negative"
        />
        <EnterpriseKpiCard
          label="Resolved This Period"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.resolvedThisPeriod ?? 0)}
          status="positive"
        />
        <EnterpriseKpiCard
          label="Total Actions"
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.totalActions ?? 0)}
        />
        <EnterpriseKpiCard
          label="Avg Age (days)"
          tooltip="Average age of unresolved actions."
          loading={isLoading}
          empty={showEmpty}
          error={showError}
          value={String(summary?.avgAgeDays ?? 0)}
        />
      </KpiRibbon>

      {showEmpty ? (
        <ChartEmptyState
          message="No action items for the selected period. Enable Performance Demo Mode to preview sample data."
          onClearFilters={filterState.clearFilters}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard title="Actions by Module" description="Open actions by source module">
              {isLoading ? (
                <ChartLoadingState height={260} />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={actionsByModule}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="open" name="Open" fill={COLORS[0]} />
                      <Bar dataKey="high" name="High severity" fill={COLORS[3]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Severity Mix" description="Unresolved actions by severity">
              {isLoading ? (
                <ChartLoadingState height={260} />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityMix.filter((s) => s.count > 0)}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        label={({ label, count }) => `${label}: ${count}`}
                      >
                        {severityMix.map((entry) => (
                          <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || COLORS[4]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Aging Buckets" description="Unresolved action age distribution">
              {isLoading ? (
                <ChartLoadingState height={260} />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agingBuckets}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Actions">
                        {agingBuckets.map((entry) => (
                          <Cell
                            key={entry.bucket}
                            fill={entry.bucket === 'Overdue' ? '#be123c' : '#1d4ed8'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Action Items" description="Sorted by severity and status">
            <AnalyticsDataGrid
              rows={tableRows}
              columns={tableColumns}
              searchKeys={['module', 'owner', 'description', 'severity', 'status']}
              searchPlaceholder="Search module, owner, description…"
              emptyMessage="No action items for the selected period."
            />
          </ChartCard>

          <InsightPanel insights={insights} loading={isLoading} />

          <p className="text-xs text-muted-foreground text-center pb-2">
            Actions link to source modules — open Invoice, Inventory, Products, Payments, Recipes, or Audit Logs to resolve.
            <button
              type="button"
              className="ml-1 text-brand underline-offset-2 hover:underline"
              onClick={() => navigate('/Invoices')}
            >
              Go to Invoices
            </button>
          </p>
        </>
      )}
    </div>
  );
}
