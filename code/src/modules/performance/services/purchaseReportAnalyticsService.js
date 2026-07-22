import { api } from '@/lib/apiClient';
import { getPurchaseReportDemoData } from '@/modules/performance/demo/purchaseReportDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isPurchaseReportAnalyticsDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

export async function fetchPurchaseReportAnalytics(params) {
  if (isPurchaseReportAnalyticsDemoEnabled()) {
    await delay(280);
    return getPurchaseReportDemoData(params);
  }

  try {
    if (typeof api.reports?.getPurchaseReportAnalytics === 'function') {
      return await api.reports.getPurchaseReportAnalytics(params);
    }
  } catch {
    // Fall back to demo data when RPC is unavailable.
  }

  return getPurchaseReportDemoData(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
