import { describe, expect, it, vi, afterEach } from 'vitest';
import { api } from '@/lib/apiClient';

describe('inventory usage demo mode', () => {
  const originalEnv = import.meta.env.VITE_PERFORMANCE_DEMO;

  afterEach(() => {
    import.meta.env.VITE_PERFORMANCE_DEMO = originalEnv;
    vi.resetModules();
  });

  it('builds a populated demo report without database access', async () => {
    const { getInventoryUsageDemoData } = await import(
      '@/modules/performance/demo/inventoryUsageDemoData'
    );
    const report = getInventoryUsageDemoData({});
    expect(report.summary.totalProducts).toBeGreaterThan(0);
    expect(report.summary.calculableProducts).toBeGreaterThan(0);
    expect(report.summary.uncountedOrMissing).toBeGreaterThan(0);
    expect(report.waterfall.length).toBeGreaterThan(0);
    expect(report.usageByCategory.length).toBeGreaterThan(0);
    expect(report.productRanking.length).toBeGreaterThan(0);
    expect(report.locationComparison.length).toBeGreaterThan(0);
    expect(report.heatmap.length).toBeGreaterThan(0);
    expect(report.abc.length).toBe(3);
    expect(report.tableRows.length).toBeGreaterThan(0);
    expect(report.metadata.demoMode).toBe(true);
  });

  it('marks missing counts as Not Calculable with null actual usage', async () => {
    const { getInventoryUsageDemoData } = await import(
      '@/modules/performance/demo/inventoryUsageDemoData'
    );
    const report = getInventoryUsageDemoData({});
    const notCalc = report.tableRows.filter((r) => r.dataQualityStatus === 'not_calculable');
    expect(notCalc.length).toBeGreaterThan(0);
    for (const row of notCalc) {
      expect(row.actualUsage).toBeNull();
      expect(row.usageValue).toBeNull();
    }
  });

  it('does not add waste into actual usage for calculable rows', async () => {
    const { getInventoryUsageDemoData } = await import(
      '@/modules/performance/demo/inventoryUsageDemoData'
    );
    const report = getInventoryUsageDemoData({});
    for (const row of report.tableRows.filter((r) => r.dataQualityStatus === 'calculable')) {
      const expected = round(
        row.openingQuantity +
          row.receivedQuantity +
          row.transfersIn -
          row.transfersOut +
          row.adjustmentQuantity -
          row.closingQuantity,
        4
      );
      expect(row.actualUsage).toBeCloseTo(expected, 3);
      // Waste is tracked separately and must not be subtracted again in the formula
      expect(row.wasteQuantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('builds product drill-down histories', async () => {
    const { getInventoryUsageDemoData, getInventoryUsageDrilldownDemoData } = await import(
      '@/modules/performance/demo/inventoryUsageDemoData'
    );
    const report = getInventoryUsageDemoData({});
    const row = report.tableRows.find((r) => r.dataQualityStatus === 'calculable');
    const drill = getInventoryUsageDrilldownDemoData({ inventoryId: row.inventoryId });
    expect(drill.summary.product).toBe(row.product);
    expect(drill.countHistory.length).toBeGreaterThan(0);
    expect(drill.receiptHistory.length).toBeGreaterThan(0);
    expect(drill.wasteHistory.length).toBeGreaterThan(0);
    expect(drill.transferHistory.length).toBeGreaterThan(0);
    expect(drill.usageTrend.length).toBeGreaterThan(0);
    expect(drill.normalization.posExcluded).toBe(true);
  });

  it('service uses demo data when VITE_PERFORMANCE_DEMO is true', async () => {
    import.meta.env.VITE_PERFORMANCE_DEMO = 'true';
    vi.resetModules();
    const service = await import('@/modules/performance/services/inventoryUsageService');
    expect(service.isInventoryUsageDemoEnabled()).toBe(true);
    const report = await service.fetchInventoryUsageReport({});
    expect(report.metadata.demoMode).toBe(true);
  });

  it('exposes inventory usage RPC wrappers on api.reports', () => {
    expect(typeof api.reports.getInventoryUsageReport).toBe('function');
    expect(typeof api.reports.getInventoryUsageDrilldown).toBe('function');
  });
});

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}
