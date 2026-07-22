import { api } from '@/lib/apiClient';
import {
  getPriceMoversDemoData,
  getPriceMoversDrilldownDemoData,
} from '@/modules/performance/demo/priceMoversDemoData';

/**
 * Reuses VITE_PERFORMANCE_DEMO for Performance analytics demo mode.
 */
export function isPriceMoversDemoEnabled() {
  return import.meta.env.VITE_PERFORMANCE_DEMO === 'true';
}

export async function fetchPriceMoversReport(params) {
  if (isPriceMoversDemoEnabled()) {
    await delay(280);
    return getPriceMoversDemoData(params);
  }
  return api.reports.getPriceMoversReport(params);
}

export async function fetchPriceMoversDrilldown(params) {
  if (isPriceMoversDemoEnabled()) {
    await delay(220);
    return getPriceMoversDrilldownDemoData(params);
  }
  return api.reports.getPriceMoversDrilldown(params);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
