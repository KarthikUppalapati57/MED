import { useQuery } from '@tanstack/react-query';
import {
  fetchVarianceBreakdownReport,
  isVarianceBreakdownDemoEnabled,
} from '@/modules/performance/services/varianceBreakdownService';

export function useVarianceBreakdown({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isVarianceBreakdownDemoEnabled();

  const query = useQuery({
    queryKey: [
      'variance_breakdown_report',
      demo ? 'demo' : 'fallback',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.locationIds,
      filters?.categoryIds,
      timezone,
    ],
    queryFn: () =>
      fetchVarianceBreakdownReport({
        organizationId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        categoryNames: filters?.categoryIds?.length ? filters.categoryIds : null,
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
    waterfall: report?.waterfall || [],
    varianceDrivers: report?.varianceDrivers || [],
    varianceByCategory: report?.varianceByCategory || [],
    varianceTrend: report?.varianceTrend || [],
    moduleBreakdown: report?.moduleBreakdown || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.driverCount || 0) === 0,
  };
}

export default useVarianceBreakdown;
