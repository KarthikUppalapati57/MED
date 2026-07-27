import { describe, expect, it } from 'vitest';
import {
  buildPriceMoverChartGroups,
  findDuplicateLookingLabels,
  getComparisonSemantics,
  prepareCategoryRows,
  preparePriceMoverRows,
} from '@/modules/performance/services/spendProductsCalculations';

describe('Phase 3 Category Report semantics', () => {
  it('preserves current/comparison values and sorts by current spend', () => {
    const rows = prepareCategoryRows([
      { category: 'Dairy', currentSpend: 100, previousSpend: 80 },
      { category: 'Produce', currentSpend: 500, previousSpend: 450 },
    ]);
    expect(rows.map((row) => row.category)).toEqual(['Produce', 'Dairy']);
    expect(rows[0]).toMatchObject({
      rank: 1,
      currentSpend: 500,
      previousSpend: 450,
      absoluteVariance: 50,
    });
  });

  it('does not turn a missing comparison into zero', () => {
    const [row] = prepareCategoryRows(
      [{ category: 'Produce', currentSpend: 500, previousSpend: 0 }],
      { comparisonValid: false }
    );
    expect(row.previousSpend).toBeNull();
    expect(row.absoluteVariance).toBeNull();
    expect(row.percentageVariance).toBeNull();
    expect(row.dataStatus).toBe('comparison_unavailable');
  });

  it('keeps confirmed zero comparison spend but makes percentage unavailable', () => {
    const [row] = prepareCategoryRows([
      { category: 'Produce', currentSpend: 500, previousSpend: 0 },
    ]);
    expect(row.previousSpend).toBe(0);
    expect(row.absoluteVariance).toBe(500);
    expect(row.percentageVariance).toBeNull();
    expect(row.dataStatus).toBe('new_or_zero_baseline');
  });

  it('warns when current and comparison periods differ in duration', () => {
    expect(getComparisonSemantics({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      comparisonDateFrom: '2026-06-01',
      comparisonDateTo: '2026-06-30',
    })).toMatchObject({
      valid: true,
      currentDays: 31,
      comparisonDays: 30,
      unequalLength: true,
    });
  });

  it('flags duplicate-looking categories without merging rows', () => {
    const input = [
      { category: 'Produce', currentSpend: 100 },
      { category: ' produce ', currentSpend: 200 },
    ];
    expect(findDuplicateLookingLabels(input, 'category')).toEqual([['Produce', 'produce']]);
    expect(prepareCategoryRows(input)).toHaveLength(2);
  });
});

describe('Phase 3 Price Movers semantics', () => {
  it('keeps missing prices unavailable and confirmed zero current price intact', () => {
    const rows = preparePriceMoverRows([
      {
        product: 'Missing',
        currentPrice: null,
        previousPrice: 5,
        comparabilityStatus: 'not_comparable',
      },
      {
        product: 'Zero',
        currentPrice: 0,
        previousPrice: 5,
        comparabilityStatus: 'comparable',
        estimatedImpact: -50,
      },
    ]);
    expect(rows.find((row) => row.product === 'Missing').currentPrice).toBeNull();
    expect(rows.find((row) => row.product === 'Zero')).toMatchObject({
      currentPrice: 0,
      priceChange: -5,
      percentageChange: -100,
    });
  });

  it('makes percentage unavailable for missing or zero comparison price', () => {
    const rows = preparePriceMoverRows([
      {
        product: 'Zero baseline',
        currentPrice: 5,
        previousPrice: 0,
        comparabilityStatus: 'comparable',
        estimatedImpact: 25,
      },
      {
        product: 'Missing baseline',
        currentPrice: 5,
        previousPrice: null,
        comparabilityStatus: 'not_comparable',
      },
    ]);
    expect(rows.find((row) => row.product === 'Zero baseline').percentageChange).toBeNull();
    expect(rows.find((row) => row.product === 'Missing baseline').percentageChange).toBeNull();
  });

  it('distinguishes adverse, favorable, and zero impact', () => {
    const rows = preparePriceMoverRows([
      comparable('Adverse', 12, 10, 40),
      comparable('Favorable', 8, 10, -30),
      comparable('No impact', 10, 10, 0),
    ]);
    expect(rows.find((row) => row.product === 'Adverse').direction).toBe('adverse');
    expect(rows.find((row) => row.product === 'Favorable').direction).toBe('favorable');
    expect(rows.find((row) => row.product === 'No impact').direction).toBe('no_material_impact');
  });

  it('does not fabricate quantity or impact when backend impact is unavailable', () => {
    const [row] = preparePriceMoverRows([
      {
        product: 'Price only',
        currentPrice: 12,
        previousPrice: 10,
        comparabilityStatus: 'comparable',
        estimatedImpact: null,
      },
    ]);
    expect(row.quantity).toBeNull();
    expect(row.estimatedImpact).toBeNull();
    expect(row.confidence).toBe('price_only');
  });

  it('sorts trustworthy impact first and falls back to absolute unit change', () => {
    const rows = preparePriceMoverRows([
      { product: 'Price only small', currentPrice: 12, previousPrice: 10, comparabilityStatus: 'comparable' },
      { product: 'Impact', currentPrice: 11, previousPrice: 10, comparabilityStatus: 'comparable', estimatedImpact: 20 },
      { product: 'Price only large', currentPrice: 20, previousPrice: 10, comparabilityStatus: 'comparable' },
    ]);
    expect(rows.map((row) => row.product)).toEqual(['Impact', 'Price only large', 'Price only small']);
  });

  it('separates adverse/favorable monetary charts from price-only changes', () => {
    const groups = buildPriceMoverChartGroups([
      comparable('Adverse', 12, 10, 40),
      comparable('Favorable', 8, 10, -30),
      {
        product: 'Price only',
        currentPrice: 14,
        previousPrice: 10,
        comparabilityStatus: 'comparable',
        estimatedImpact: null,
      },
    ]);
    expect(groups.adverse.map((row) => row.product)).toEqual(['Adverse']);
    expect(groups.favorable.map((row) => row.product)).toEqual(['Favorable']);
    expect(groups.priceOnly.map((row) => row.product)).toEqual(['Price only']);
  });

  it('flags duplicate-looking product names without merging identities', () => {
    const rows = [
      { productId: 'one', product: 'Tomato' },
      { productId: 'two', product: ' tomato ' },
    ];
    expect(findDuplicateLookingLabels(rows, 'product')).toEqual([['Tomato', 'tomato']]);
    expect(preparePriceMoverRows(rows)).toHaveLength(2);
  });
});

function comparable(product, currentPrice, previousPrice, estimatedImpact) {
  return {
    product,
    currentPrice,
    previousPrice,
    estimatedImpact,
    comparabilityStatus: 'comparable',
  };
}
