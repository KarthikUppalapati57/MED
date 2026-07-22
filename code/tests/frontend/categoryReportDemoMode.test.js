import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('category performance demo mode', () => {
  const originalEnv = import.meta.env.VITE_PERFORMANCE_DEMO;

  afterEach(() => {
    import.meta.env.VITE_PERFORMANCE_DEMO = originalEnv;
    vi.resetModules();
  });

  it('builds a populated demo report without database access', async () => {
    const { getCategoryReportDemoData, categoryReportDemoMeta } = await import(
      '@/modules/performance/demo/categoryReportDemoData'
    );

    expect(categoryReportDemoMeta.invoiceCount).toBeGreaterThanOrEqual(300);
    expect(categoryReportDemoMeta.vendorCount).toBe(20);
    expect(categoryReportDemoMeta.categories).toHaveLength(12);

    const report = getCategoryReportDemoData({});
    expect(report.summary.totalSpend).toBeGreaterThan(0);
    expect(report.tableRows.length).toBeGreaterThanOrEqual(8);
    expect(report.pareto.length).toBeGreaterThan(0);
    expect(report.distribution.length).toBeGreaterThan(0);
    expect(report.trend.length).toBeGreaterThan(0);
    expect(report.vendorContribution.length).toBeGreaterThan(0);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.metadata.demoMode).toBe(true);
    expect(report.metadata.hasBudgetData).toBe(true);
  });

  it('builds category drill-down with vendors, products, and invoices', async () => {
    const { getCategoryDrilldownDemoData } = await import(
      '@/modules/performance/demo/categoryReportDemoData'
    );
    const drill = getCategoryDrilldownDemoData({ category: 'Meat' });
    expect(drill.category).toBe('Meat');
    expect(drill.summary.totalSpend).toBeGreaterThan(0);
    expect(drill.vendors.length).toBeGreaterThan(0);
    expect(drill.products.length).toBeGreaterThan(0);
    expect(drill.invoices.length).toBeGreaterThan(10);
  });

  it('service uses demo data when VITE_PERFORMANCE_DEMO is true', async () => {
    import.meta.env.VITE_PERFORMANCE_DEMO = 'true';
    vi.resetModules();
    const service = await import('@/modules/performance/services/categoryPerformanceService');
    expect(service.isCategoryPerformanceDemoEnabled()).toBe(true);
    const report = await service.fetchCategoryPerformanceReport({});
    expect(report.metadata.demoMode).toBe(true);
    expect(report.summary.totalSpend).toBeGreaterThan(0);
  });

  it('service flag is off when VITE_PERFORMANCE_DEMO is not true', async () => {
    import.meta.env.VITE_PERFORMANCE_DEMO = 'false';
    vi.resetModules();
    const service = await import('@/modules/performance/services/categoryPerformanceService');
    expect(service.isCategoryPerformanceDemoEnabled()).toBe(false);
  });
});
