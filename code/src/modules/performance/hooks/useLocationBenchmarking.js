import { useQuery } from '@tanstack/react-query';
import {
  fetchLocationBenchmarkingReport,
  isLocationBenchmarkingDemoEnabled,
} from '@/modules/performance/services/locationBenchmarkingService';

export function useLocationBenchmarking({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isLocationBenchmarkingDemoEnabled();

  const query = useQuery({
    queryKey: [
      'location_benchmarking_report',
      demo ? 'demo' : 'rpc',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.categoryIds,
      timezone,
    ],
    queryFn: () =>
      fetchLocationBenchmarkingReport({
        organizationId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
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
    locationCostComparison: report?.locationCostComparison || [],
    categoryCostByLocation: report?.categoryCostByLocation || [],
    efficiencyRanking: report?.efficiencyRanking || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.locationsCompared || 0) === 0,
  };
}

export default useLocationBenchmarking;
