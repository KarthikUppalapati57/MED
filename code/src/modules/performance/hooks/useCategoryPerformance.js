import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { buildInsights } from '@/modules/performance/services/categoryPerformanceCalculations';

/**
 * Fetches consolidated Category Performance report for current filters.
 */
export function useCategoryPerformance({
  organizationId,
  filters,
  selectedCategory = null,
  trendCategories = null,
  enabled = true,
}) {
  const query = useQuery({
    queryKey: [
      'category_performance_report',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.categoryIds,
      filters?.vendorIds,
      selectedCategory,
      trendCategories,
    ],
    queryFn: () =>
      api.reports.getCategoryPerformanceReport({
        organizationId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
        categoryNames: filters?.categoryIds?.length ? filters.categoryIds : null,
        vendorIds: filters?.vendorIds?.length ? filters.vendorIds : null,
        selectedCategory,
        trendCategories,
      }),
    enabled: Boolean(enabled && organizationId && filters?.dateFrom && filters?.dateTo),
    staleTime: 30_000,
  });

  const report = query.data || null;
  const insights =
    report?.insights?.length > 0
      ? report.insights
      : buildInsights({
          summary: report?.summary,
          tableRows: report?.tableRows,
          vendorContribution: report?.vendorContribution,
        });

  return {
    ...query,
    report,
    summary: report?.summary || null,
    categoryBreakdown: report?.categoryBreakdown || [],
    trend: report?.trend || [],
    distribution: report?.distribution || [],
    pareto: report?.pareto || [],
    vendorContribution: report?.vendorContribution || [],
    tableRows: report?.tableRows || [],
    insights,
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.totalSpend || 0) === 0 &&
      Number(report?.summary?.previousSpend || 0) === 0,
  };
}

export function useCategoryPerformanceDrilldown({
  organizationId,
  filters,
  category,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      'category_performance_drilldown',
      organizationId,
      category,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.vendorIds,
    ],
    queryFn: () =>
      api.reports.getCategoryPerformanceDrilldown({
        organizationId,
        category,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
        vendorIds: filters?.vendorIds?.length ? filters.vendorIds : null,
      }),
    enabled: Boolean(enabled && organizationId && category && filters?.dateFrom && filters?.dateTo),
    staleTime: 30_000,
  });
}

export default useCategoryPerformance;
