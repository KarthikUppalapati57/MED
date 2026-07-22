import { api } from '@/lib/apiClient';
import { getLocationBenchmarkingDemoData } from '@/modules/performance/demo/locationBenchmarkingDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isLocationBenchmarkingDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

export async function fetchLocationBenchmarkingReport(params) {
  if (isLocationBenchmarkingDemoEnabled()) {
    await delay(280);
    return getLocationBenchmarkingDemoData(params);
  }

  try {
    if (typeof api.reports?.getLocationBenchmarkingReport === 'function') {
      return await api.reports.getLocationBenchmarkingReport(params);
    }
  } catch {
    // Fall back to demo data when RPC is unavailable.
  }

  return getLocationBenchmarkingDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
