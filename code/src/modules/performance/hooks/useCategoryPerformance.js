import { useQuery } from '@tanstack/react-query';
import {
  fetchCategoryPerformanceReport,
  fetchCategoryPerformanceDrilldown,
  isCategoryPerformanceDemoEnabled,
} from '@/modules/performance/services/categoryPerformanceService';
import { buildInsights } from '@/modules/performance/services/categoryPerformanceCalculations';

/**
 * Fetches consolidated Category Performance report for current filters.
 * Source (demo vs RPC) is decided in the service layer.
 */
export function useCategoryPerformance({
  organizationId,
  filters,
  selectedCategory = null,
  trendCategories = null,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isCategoryPerformanceDemoEnabled();

  const query = useQuery({
    queryKey: [
      'category_performance_report',
      demo ? 'demo' : 'rpc',
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
      timezone,
    ],
    queryFn: () =>
      fetchCategoryPerformanceReport({
        organizationId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
        categoryNames: filters?.categoryIds?.length ? filters.categoryIds : null,
        vendorIds: filters?.vendorIds?.length ? filters.vendorIds : null,
        timezone,
        selectedCategory,
        trendCategories,
      }),
    // Demo mode can render without a real organization id.
    enabled: Boolean(
      enabled &&
        filters?.dateFrom &&
        filters?.dateTo &&
        (demo || organizationId)
    ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
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
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isCategoryPerformanceDemoEnabled();

  return useQuery({
    queryKey: [
      'category_performance_drilldown',
      demo ? 'demo' : 'rpc',
      organizationId,
      category,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.vendorIds,
      timezone,
    ],
    queryFn: () =>
      fetchCategoryPerformanceDrilldown({
        organizationId,
        category,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        comparisonDateFrom: filters.comparisonDateFrom,
        comparisonDateTo: filters.comparisonDateTo,
        vendorIds: filters?.vendorIds?.length ? filters.vendorIds : null,
        timezone,
      }),
    enabled: Boolean(
      enabled &&
        category &&
        filters?.dateFrom &&
        filters?.dateTo &&
        (demo || organizationId)
    ),
    staleTime: 30_000,
  });
}

export default useCategoryPerformance;
