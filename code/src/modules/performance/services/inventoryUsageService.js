import { api } from '@/lib/apiClient';
import {
  getInventoryUsageDemoData,
  getInventoryUsageDrilldownDemoData,
} from '@/modules/performance/demo/inventoryUsageDemoData';
import { isCategoryPerformanceDemoEnabled } from '@/modules/performance/services/categoryPerformanceService';

export function isInventoryUsageDemoEnabled() {
  return isCategoryPerformanceDemoEnabled();
}

export async function fetchInventoryUsageReport(params) {
  if (isInventoryUsageDemoEnabled()) {
    await delay(280);
    return getInventoryUsageDemoData(params);
  }
  return api.reports.getInventoryUsageReport(params);
}

export async function fetchInventoryUsageDrilldown(params) {
  if (isInventoryUsageDemoEnabled()) {
    await delay(220);
    return getInventoryUsageDrilldownDemoData(params);
  }
  return api.reports.getInventoryUsageDrilldown(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
