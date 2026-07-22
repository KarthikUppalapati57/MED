import { useQuery } from '@tanstack/react-query';
import {
  fetchDailyCostCashReport,
  isDailyCostCashDemoEnabled,
} from '@/modules/performance/services/dailyCostCashService';

export function useDailyCostCash({
  organizationId,
  filters,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isDailyCostCashDemoEnabled();

  const query = useQuery({
    queryKey: [
      'daily_cost_cash_report',
      demo ? 'demo' : 'fallback',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.locationIds,
      filters?.categoryIds,
      timezone,
    ],
    queryFn: () =>
      fetchDailyCostCashReport({
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
    dailyPurchasesVsPayments: report?.dailyPurchasesVsPayments || [],
    cumulativeCashOutflow: report?.cumulativeCashOutflow || [],
    categoryCostByDay: report?.categoryCostByDay || [],
    payablesAging: report?.payablesAging || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.daysInPeriod || 0) === 0,
  };
}

export default useDailyCostCash;
