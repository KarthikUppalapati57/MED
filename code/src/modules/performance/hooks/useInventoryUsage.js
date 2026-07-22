import { useQuery } from '@tanstack/react-query';
import {
  fetchInventoryUsageReport,
  fetchInventoryUsageDrilldown,
  isInventoryUsageDemoEnabled,
} from '@/modules/performance/services/inventoryUsageService';

export function useInventoryUsage({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isInventoryUsageDemoEnabled();

  const query = useQuery({
    queryKey: [
      'inventory_usage_report',
      demo ? 'demo' : 'rpc',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.locationIds,
      filters?.categoryIds,
      timezone,
    ],
    queryFn: () =>
      fetchInventoryUsageReport({
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
    usageByCategory: report?.usageByCategory || [],
    valueTrend: report?.valueTrend || [],
    wasteTrend: report?.wasteTrend || [],
    productRanking: report?.productRanking || [],
    locationComparison: report?.locationComparison || [],
    heatmap: report?.heatmap || [],
    abc: report?.abc || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.totalProducts || 0) === 0,
  };
}

export function useInventoryUsageDrilldown({
  organizationId,
  filters,
  inventoryId,
  productId,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isInventoryUsageDemoEnabled();

  return useQuery({
    queryKey: [
      'inventory_usage_drilldown',
      demo ? 'demo' : 'rpc',
      organizationId,
      inventoryId,
      productId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.locationIds,
      timezone,
    ],
    queryFn: () =>
      fetchInventoryUsageDrilldown({
        organizationId,
        inventoryId,
        productId,
        locationIds: filters?.locationIds?.length ? filters.locationIds : null,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        timezone,
      }),
    enabled: Boolean(
      enabled &&
        (inventoryId || productId) &&
        filters?.dateFrom &&
        filters?.dateTo &&
        (demo || organizationId)
    ),
    staleTime: 30_000,
  });
}

export default useInventoryUsage;
