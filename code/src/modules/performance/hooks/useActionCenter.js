import { useQuery } from '@tanstack/react-query';
import {
  fetchActionCenterReport,
  isActionCenterDemoEnabled,
} from '@/modules/performance/services/actionCenterService';

export function useActionCenter({
  organizationId,
  filters,
  moduleFilter = null,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  enabled = true,
}) {
  const demo = isActionCenterDemoEnabled();

  const query = useQuery({
    queryKey: [
      'action_center_report',
      demo ? 'demo' : 'fallback',
      organizationId,
      filters?.dateFrom,
      filters?.dateTo,
      moduleFilter,
      timezone,
    ],
    queryFn: () =>
      fetchActionCenterReport({
        organizationId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        moduleFilter: moduleFilter?.length ? moduleFilter : null,
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
    actionsByModule: report?.actionsByModule || [],
    severityMix: report?.severityMix || [],
    agingBuckets: report?.agingBuckets || [],
    tableRows: report?.tableRows || [],
    insights: report?.insights || [],
    metadata: report?.metadata || null,
    isEmpty:
      !query.isLoading &&
      !query.isError &&
      Boolean(report) &&
      Number(report?.summary?.totalActions || 0) === 0,
  };
}

export default useActionCenter;
