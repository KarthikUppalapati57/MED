import { api } from '@/lib/apiClient';
import { getOverviewAnalyticsDemoData } from '@/modules/performance/demo/overviewAnalyticsDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isOverviewAnalyticsDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

export async function fetchOverviewAnalyticsReport(params) {
  if (isOverviewAnalyticsDemoEnabled()) {
    await delay(280);
    return getOverviewAnalyticsDemoData(params);
  }

  try {
    if (typeof api.reports?.getOverviewAnalyticsReport === 'function') {
      return await api.reports.getOverviewAnalyticsReport(params);
    }
  } catch {
    // Fall back to demo data when RPC is unavailable.
  }

  return getOverviewAnalyticsDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
