import { useQuery } from '@tanstack/react-query';
import {
  fetchOverviewAnalyticsReport,
  isOverviewAnalyticsDemoEnabled,
} from '@/modules/performance/services/overviewAnalyticsService';

export function useOverviewAnalytics({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isOverviewAnalyticsDemoEnabled();

  const query = useQuery({
    queryKey: [
      'overview_analytics_report',
      demo ? 'demo' : 'rpc',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.categoryIds,
      filters?.vendorIds,
      timezone,
    ],
    queryFn: () =>
      fetchOverviewAnalyticsReport({
        organizationId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
        categoryNames: filters?.categoryIds?.length ? filters.categoryIds : null,
        vendorIds: filters?.vendorIds?.length ? filters.vendorIds : null,
        timezone,
      }),
    enabled: Boolean(enabled && filters?.dateFrom && filters?.dateTo && (demo || organizationId)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const report = query.data || null;

  return {
    ...query,
    report,
    summary: report?.summary || null,
    spendTrend: report?.spendTrend || [],
    moduleMix: report?.moduleMix || [],
    locationSpendComparison: report?.locationSpendComparison || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.totalPurchases || 0) === 0,
  };
}

export default useOverviewAnalytics;
