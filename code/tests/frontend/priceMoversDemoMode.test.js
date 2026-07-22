import { describe, expect, it, vi, afterEach } from 'vitest';
import { api } from '@/lib/apiClient';

describe('price movers demo mode', () => {
  const originalEnv = import.meta.env.VITE_PERFORMANCE_DEMO;

  afterEach(() => {
    import.meta.env.VITE_PERFORMANCE_DEMO = originalEnv;
    vi.resetModules();
  });

  it('builds a populated demo report without database access', async () => {
    const { getPriceMoversDemoData } = await import(
      '@/modules/performance/demo/priceMoversDemoData'
    );

    const report = getPriceMoversDemoData({});
    expect(report.summary.totalProducts).toBeGreaterThan(0);
    expect(report.summary.productsWithIncreases).toBeGreaterThan(0);
    expect(report.summary.nonComparableProducts).toBeGreaterThan(0);
    expect(report.ranking.length).toBeGreaterThan(0);
    expect(report.trend.length).toBeGreaterThan(0);
    expect(report.distribution.length).toBeGreaterThan(0);
    expect(report.scatter.length).toBeGreaterThan(0);
    expect(report.categoryInflation.length).toBeGreaterThan(0);
    expect(report.vendorImpact.length).toBeGreaterThan(0);
    expect(report.tableRows.length).toBeGreaterThan(0);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.metadata.demoMode).toBe(true);
  });

  it('marks unmapped / dual-unit products as not comparable with null % change', async () => {
    const { getPriceMoversDemoData } = await import(
      '@/modules/performance/demo/priceMoversDemoData'
    );
    const report = getPriceMoversDemoData({});
    const notComparable = report.tableRows.filter(
      (r) => r.comparabilityStatus === 'not_comparable'
    );
    expect(notComparable.length).toBeGreaterThan(0);
    for (const row of notComparable) {
      expect(row.percentageChange).toBeNull();
      expect(row.priceChange).toBeNull();
      expect(row.estimatedImpact).toBeNull();
    }
  });

  it('builds product drill-down with price history and invoices', async () => {
    const { getPriceMoversDemoData, getPriceMoversDrilldownDemoData } = await import(
      '@/modules/performance/demo/priceMoversDemoData'
    );
    const report = getPriceMoversDemoData({});
    const comparable = report.tableRows.find(
      (r) => r.comparabilityStatus === 'comparable' && r.productId
    );
    expect(comparable).toBeTruthy();

    const drill = getPriceMoversDrilldownDemoData({
      productId: comparable.productId,
      productName: comparable.product,
    });
    expect(drill.summary.product).toBe(comparable.product);
    expect(drill.priceHistory.length).toBeGreaterThan(0);
    expect(drill.vendorComparison.length).toBeGreaterThan(0);
    expect(drill.purchaseHistory.length).toBeGreaterThan(0);
    expect(drill.normalization).toBeTruthy();
  });

  it('service uses demo data when VITE_PERFORMANCE_DEMO is true', async () => {
    import.meta.env.VITE_PERFORMANCE_DEMO = 'true';
    vi.resetModules();
    const service = await import('@/modules/performance/services/priceMoversService');
    expect(service.isPriceMoversDemoEnabled()).toBe(true);
    const report = await service.fetchPriceMoversReport({});
    expect(report.metadata.demoMode).toBe(true);
    expect(report.summary.totalProducts).toBeGreaterThan(0);
  });

  it('service flag is off when VITE_PERFORMANCE_DEMO is not true', async () => {
    import.meta.env.VITE_PERFORMANCE_DEMO = 'false';
    vi.resetModules();
    const service = await import('@/modules/performance/services/priceMoversService');
    expect(service.isPriceMoversDemoEnabled()).toBe(false);
  });

  it('exposes price movers RPC wrappers on api.reports', () => {
    expect(typeof api.reports.getPriceMoversReport).toBe('function');
    expect(typeof api.reports.getPriceMoversDrilldown).toBe('function');
  });
});

describe('price movers safe comparison contract', () => {
  it('never fabricates percentages for non-comparable rows in demo table', async () => {
    const { getPriceMoversDemoData } = await import(
      '@/modules/performance/demo/priceMoversDemoData'
    );
    const { tableRows } = getPriceMoversDemoData({});
    for (const row of tableRows) {
      if (row.comparabilityStatus !== 'comparable') {
        expect(row.percentageChange).toBeNull();
      } else {
        expect(typeof row.percentageChange).toBe('number');
        expect(typeof row.currentPrice).toBe('number');
        expect(typeof row.previousPrice).toBe('number');
      }
    }
  });
});
