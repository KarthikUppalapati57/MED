import { getDailyCostCashDemoData } from '@/modules/performance/demo/dailyCostCashDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isDailyCostCashDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

/**
 * Service layer for Daily Cost & Cash analytics.
 * Demo-only safe fallback — no RPC required until backend is wired.
 */
export async function fetchDailyCostCashReport(params) {
  if (isDailyCostCashDemoEnabled()) {
    await delay(250);
  }
  return getDailyCostCashDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
