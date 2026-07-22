import { getActionCenterDemoData } from '@/modules/performance/demo/actionCenterDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isActionCenterDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

/**
 * Service layer for Action Center analytics.
 * Demo-only safe fallback — no RPC required until backend is wired.
 */
export async function fetchActionCenterReport(params) {
  if (isActionCenterDemoEnabled()) {
    await delay(250);
  }
  return getActionCenterDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
