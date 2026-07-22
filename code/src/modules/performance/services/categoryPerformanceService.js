import { api } from '@/lib/apiClient';
import {
  getCategoryReportDemoData,
  getCategoryDrilldownDemoData,
} from '@/modules/performance/demo/categoryReportDemoData';

/**
 * Development-only demo flag. Must be the string "true".
 * Never enabled in production builds unless explicitly set at build time.
 */
export function isCategoryPerformanceDemoEnabled() {
  return import.meta.env.VITE_PERFORMANCE_DEMO === 'true';
}

/**
 * Service layer for Category Performance analytics.
 * UI should call this — not choose between demo and RPC.
 */
export async function fetchCategoryPerformanceReport(params) {
  if (isCategoryPerformanceDemoEnabled()) {
    // Simulate a short network delay so loading states are observable in demo.
    await delay(280);
    return getCategoryReportDemoData(params);
  }

  return api.reports.getCategoryPerformanceReport(params);
}

export async function fetchCategoryPerformanceDrilldown(params) {
  if (isCategoryPerformanceDemoEnabled()) {
    await delay(220);
    return getCategoryDrilldownDemoData(params);
  }

  return api.reports.getCategoryPerformanceDrilldown(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
