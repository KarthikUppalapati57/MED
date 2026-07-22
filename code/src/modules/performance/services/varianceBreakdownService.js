import { getVarianceBreakdownDemoData } from '@/modules/performance/demo/varianceBreakdownDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isVarianceBreakdownDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

/**
 * Service layer for Variance Breakdown analytics.
 * Demo-only safe fallback — no RPC required until backend is wired.
 */
export async function fetchVarianceBreakdownReport(params) {
  if (isVarianceBreakdownDemoEnabled()) {
    await delay(250);
  }
  return getVarianceBreakdownDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
