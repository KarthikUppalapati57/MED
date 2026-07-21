import { describe, expect, it } from 'vitest';
import {
  absoluteChange,
  aggregateSpendByCategory,
  averageInvoiceValue,
  buildCategoryComparisonRows,
  buildInsights,
  buildPareto,
  fastestGrowingCategory,
  largestSpendCategory,
  percentageChange,
  previousEquivalentPeriod,
  resolveCategoryName,
  shareOfTotal,
  topThreeConcentration,
  trendGranularity,
  UNCATEGORIZED,
} from '@/modules/performance/services/categoryPerformanceCalculations';

describe('categoryPerformanceCalculations', () => {
  it('resolves blank categories to Uncategorized', () => {
    expect(resolveCategoryName('')).toBe(UNCATEGORIZED);
    expect(resolveCategoryName('  ')).toBe(UNCATEGORIZED);
    expect(resolveCategoryName('Produce')).toBe('Produce');
  });

  it('computes total spend aggregation including credits as negatives', () => {
    const rows = aggregateSpendByCategory([
      { category_name: 'Produce', amount: 1000, invoice_id: 'a', vendor_id: 'v1' },
      { category_name: 'Produce', amount: -50, invoice_id: 'b', vendor_id: 'v1' },
      { category_name: null, amount: 200, invoice_id: 'c', vendor_id: 'v2' },
    ]);
    const produce = rows.find((r) => r.category === 'Produce');
    const uncat = rows.find((r) => r.category === UNCATEGORIZED);
    expect(produce.spend).toBe(950);
    expect(uncat.spend).toBe(200);
  });

  it('handles percentage change when previous is zero', () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
    expect(percentageChange(110, 100)).toBeCloseTo(10);
  });

  it('computes absolute change and share of total', () => {
    expect(absoluteChange(120, 100)).toBe(20);
    expect(shareOfTotal(25, 100)).toBe(25);
    expect(shareOfTotal(10, 0)).toBe(0);
  });

  it('finds largest and fastest-growing categories with min spend threshold', () => {
    const rows = [
      { category: 'Produce', currentSpend: 5000, previousSpend: 4500 },
      { category: 'Dairy', currentSpend: 2000, previousSpend: 1000 },
      { category: 'Tiny', currentSpend: 20, previousSpend: 1 },
    ];
    const largest = largestSpendCategory(rows, 7020);
    expect(largest.category).toBe('Produce');
    expect(largest.percentageOfTotal).toBeCloseTo((5000 / 7020) * 100);

    const fastest = fastestGrowingCategory(rows, { minSpend: 100 });
    expect(fastest.category).toBe('Dairy');
    expect(fastestGrowingCategory(rows, { minSpend: 10000 })).toBeNull();
  });

  it('computes top-three concentration and average invoice value', () => {
    expect(topThreeConcentration([50, 30, 10, 5, 5], 100)).toBe(90);
    expect(averageInvoiceValue(1000, 4)).toBe(250);
    expect(averageInvoiceValue(1000, 0)).toBe(0);
  });

  it('builds pareto cumulative percentages', () => {
    const pareto = buildPareto([
      { category: 'A', currentSpend: 80 },
      { category: 'B', currentSpend: 15 },
      { category: 'C', currentSpend: 5 },
    ]);
    expect(pareto[0].cumulativePercentage).toBe(80);
    expect(pareto[2].cumulativePercentage).toBe(100);
  });

  it('builds comparison rows across periods', () => {
    const rows = buildCategoryComparisonRows(
      [{ category: 'Meat', spend: 100, invoiceCount: 2, vendorCount: 1 }],
      [{ category: 'Meat', spend: 80, invoiceCount: 1, vendorCount: 1 }, { category: 'Dairy', spend: 40 }]
    );
    const meat = rows.find((r) => r.category === 'Meat');
    const dairy = rows.find((r) => r.category === 'Dairy');
    expect(meat.absoluteVariance).toBe(20);
    expect(dairy.currentSpend).toBe(0);
    expect(dairy.previousSpend).toBe(40);
  });

  it('derives previous equivalent period and trend granularity', () => {
    const period = previousEquivalentPeriod('2026-07-01', '2026-07-31');
    expect(period.dayCount).toBe(31);
    expect(period.comparisonDateTo).toBe('2026-06-30');
    expect(period.comparisonDateFrom).toBe('2026-05-31');
    expect(trendGranularity('2026-07-01', '2026-07-15')).toBe('day');
    expect(trendGranularity('2026-01-01', '2026-03-31')).toBe('week');
    expect(trendGranularity('2026-01-01', '2026-06-30')).toBe('month');
  });

  it('builds ranked insights only from valid calculations', () => {
    const insights = buildInsights({
      summary: {
        totalSpend: 1000,
        largestCategory: { category: 'Meat', spend: 380, percentageOfTotal: 38 },
        topThreeConcentrationPercentage: 72,
      },
      tableRows: [
        { category: 'Produce', absoluteVariance: 1420, percentageVariance: 14.2 },
        { category: 'Beverage', absoluteVariance: -4280, percentageVariance: -12 },
      ],
      vendorContribution: [{ vendor: 'Vendor A', sharePercentage: 61, spend: 500, category: 'dairy-category' }],
    });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].impact).toBeGreaterThanOrEqual(insights[insights.length - 1].impact);
    expect(insights.some((i) => i.text.includes('Beverage'))).toBe(true);
  });
});

describe('category performance api client contract', () => {
  it('exposes report and drilldown helpers', async () => {
    const { api } = await import('@/lib/apiClient');
    expect(typeof api.reports.getCategoryPerformanceReport).toBe('function');
    expect(typeof api.reports.getCategoryPerformanceDrilldown).toBe('function');
  });
});
