import { useQuery } from '@tanstack/react-query';
import {
  fetchPriceMoversReport,
  fetchPriceMoversDrilldown,
  isPriceMoversDemoEnabled,
} from '@/modules/performance/services/priceMoversService';

export function usePriceMovers({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isPriceMoversDemoEnabled();

  const query = useQuery({
    queryKey: [
      'price_movers_report',
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
      fetchPriceMoversReport({
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
    ranking: report?.ranking || [],
    trend: report?.trend || [],
    distribution: report?.distribution || [],
    scatter: report?.scatter || [],
    categoryInflation: report?.categoryInflation || [],
    vendorImpact: report?.vendorImpact || [],
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

export function usePriceMoversDrilldown({
  organizationId,
  filters,
  productId,
  productName,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isPriceMoversDemoEnabled();

  return useQuery({
    queryKey: [
      'price_movers_drilldown',
      demo ? 'demo' : 'rpc',
      organizationId,
      productId,
      productName,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.comparisonDateFrom,
      filters?.comparisonDateTo,
      filters?.locationIds,
      filters?.vendorIds,
      timezone,
    ],
    queryFn: () =>
      fetchPriceMoversDrilldown({
        organizationId,
        productId,
        productName,
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
        (productId || productName) &&
        filters?.dateFrom &&
        filters?.dateTo &&
        (demo || organizationId)
    ),
    staleTime: 30_000,
  });
}

export default usePriceMovers;
