import { describe, expect, it, vi } from 'vitest';
import { WIDGET_STATES } from '@/modules/performance/components/shared/WidgetState';
import {
  applyPerformanceDrilldown,
  buildExactBudgetComparison,
  calculateInventoryCoverage,
  calculatePaymentStatusAmounts,
  calculateProductCategoryCoverage,
  calculateRecipeMarginCoverage,
  findDuplicateLookingCategories,
  getBudgetRowActionState,
} from '@/modules/performance/services/overviewBudgetCalculations';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';
import {
  loadPerformanceProductCatalog,
  PRODUCT_CATALOG_PAGE_SIZE,
} from '@/modules/performance/services/performanceProductCatalog';

describe('Phase 2 Overview calculations', () => {
  it('never substitutes actual spend for a missing budget', () => {
    const result = buildExactBudgetComparison({
      spendRows: [{ category: 'Produce', currentSpend: 1200 }],
      budgetTargets: [],
    });
    expect(result.rows[0]).toMatchObject({
      category: 'Produce',
      actual: 1200,
      budget: null,
      variance: null,
      percentageVariance: null,
      status: 'no_budget',
    });
    expect(result.chartRows).toEqual([]);
  });

  it('distinguishes a confirmed zero budget from no budget', () => {
    const result = buildExactBudgetComparison({
      spendRows: [
        { category: 'Produce', currentSpend: 100 },
        { category: 'Dairy', currentSpend: 0 },
      ],
      budgetTargets: [
        { id: 'budget-zero', category: 'Produce', target_amount: 0 },
      ],
    });
    expect(result.rows.find((row) => row.category === 'Produce')).toMatchObject({
      budget: 0,
      variance: 100,
      percentageVariance: null,
      status: 'over',
    });
    expect(result.rows.find((row) => row.category === 'Dairy')).toMatchObject({
      budget: null,
      status: 'no_budget',
    });
  });

  it('calculates actual and variance only for an exact unique mapping', () => {
    const result = buildExactBudgetComparison({
      spendRows: [{ category: 'Produce', currentSpend: 1250 }],
      budgetTargets: [{ id: 'one', category: 'Produce', target_amount: 1000 }],
    });
    expect(result.rows[0]).toMatchObject({
      actual: 1250,
      budget: 1000,
      variance: 250,
      percentageVariance: 25,
      status: 'over',
    });
    expect(result.overBudgetCount).toBe(1);
  });

  it('marks duplicate targets unavailable rather than summing them', () => {
    const result = buildExactBudgetComparison({
      spendRows: [{ category: 'Produce', currentSpend: 1250 }],
      budgetTargets: [
        { id: 'one', category: 'Produce', target_amount: 1000 },
        { id: 'two', category: 'Produce', target_amount: 900 },
      ],
    });
    expect(result.rows[0]).toMatchObject({
      duplicateTargets: true,
      budget: null,
      variance: null,
      status: 'mapping_unavailable',
    });
    expect(result.state).toBe(WIDGET_STATES.UNAVAILABLE);
  });

  it('does not turn unavailable formatting into zero values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatPct(null)).toBe('—');
  });

  it('separates payment and invoice statuses and exposes no combined total', () => {
    const result = calculatePaymentStatusAmounts(
      [
        { status: 'scheduled', amount: 100 },
        { status: 'failed', amount: 50 },
        { status: 'refunded', amount: 20 },
      ],
      [
        { payment_status: 'unpaid', total_amount: 100 },
        { payment_status: 'partial', total_amount: 75 },
      ]
    );
    expect(result.paymentAmounts).toMatchObject({ scheduled: 100, failed: 50, refunded: 20 });
    expect(result.invoiceAmounts).toMatchObject({ unpaid: 100, partial: 75 });
    expect(result.combinedExposure).toBeNull();
    expect(result.reconciliationAvailable).toBe(false);
  });

  it('counts risk across the full calculable recipe set', () => {
    const recipes = Array.from({ length: 12 }, (_, index) => ({
      id: index,
      cost_per_serving: index < 10 ? 8 : null,
      selling_price: index < 10 ? 10 : null,
      target_margin_percent: 30,
    }));
    const result = calculateRecipeMarginCoverage(recipes);
    expect(result.totalCount).toBe(12);
    expect(result.calculableCount).toBe(10);
    expect(result.riskCount).toBe(10);
    expect(result.riskRows).toHaveLength(10);
    expect(result.state).toBe(WIDGET_STATES.PARTIAL);
  });

  it('distinguishes no recipes from unavailable and partial coverage', () => {
    expect(calculateRecipeMarginCoverage([]).state).toBe(WIDGET_STATES.EMPTY);
    expect(calculateRecipeMarginCoverage([{ selling_price: 10, cost_per_serving: null }]).state)
      .toBe(WIDGET_STATES.UNAVAILABLE);
    expect(calculateRecipeMarginCoverage([
      { selling_price: 10, cost_per_serving: 4 },
      { selling_price: null, cost_per_serving: 4 },
    ]).state).toBe(WIDGET_STATES.PARTIAL);
  });

  it('reports product category numerator, denominator, and partial coverage', () => {
    const result = calculateProductCategoryCoverage([
      { category: 'Produce' },
      { category: '  ' },
      { accounting_category: 'Food' },
    ]);
    expect(result).toMatchObject({
      totalCount: 3,
      categorizedCount: 2,
      state: WIDGET_STATES.PARTIAL,
    });
    expect(result.percentage).toBeCloseTo(66.666);
  });

  it('keeps inventory value availability separate from reorder coverage', () => {
    const result = calculateInventoryCoverage([
      { current_value: 100, current_quantity: 2, reorder_point: 4 },
      { current_value: null, current_quantity: 8, reorder_point: null },
    ]);
    expect(result.inventoryValue).toBe(100);
    expect(result.valuedCount).toBe(1);
    expect(result.lowStockCount).toBe(1);
    expect(result.valueState).toBe(WIDGET_STATES.PARTIAL);
    expect(result.reorderState).toBe(WIDGET_STATES.PARTIAL);
  });
});

describe('Phase 2 product hierarchy coverage', () => {
  it('loads every page from the inherited location-visible product catalog', async () => {
    const organizationProduct = {
      id: 'product-org',
      organization_id: 'org-1',
      brand_id: null,
      location_id: null,
    };
    const brandProduct = {
      id: 'product-brand',
      organization_id: 'org-1',
      brand_id: 'brand-1',
      location_id: null,
    };
    const locationProduct = {
      id: 'product-location',
      organization_id: 'org-1',
      brand_id: 'brand-1',
      location_id: 'location-1',
    };
    const firstPage = Array.from(
      { length: PRODUCT_CATALOG_PAGE_SIZE },
      (_, index) => ({ id: `filler-${index}` })
    );
    firstPage.splice(0, 3, organizationProduct, brandProduct, locationProduct);

    const getCatalog = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([locationProduct]);

    const products = await loadPerformanceProductCatalog({
      productsApi: { getCatalog },
      organizationId: 'org-1',
      brandId: 'brand-1',
      locationId: 'location-1',
    });

    expect(getCatalog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      organizationId: 'org-1',
      brandId: 'brand-1',
      locationId: 'location-1',
      page: 0,
      pageSize: PRODUCT_CATALOG_PAGE_SIZE,
    }));
    expect(getCatalog).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 1 }));
    expect(products).toEqual(expect.arrayContaining([
      organizationProduct,
      brandProduct,
      locationProduct,
    ]));
    expect(products.filter((product) => product.id === locationProduct.id)).toHaveLength(1);
  });

  it('refuses incomplete hierarchy context instead of widening product scope', async () => {
    await expect(loadPerformanceProductCatalog({
      productsApi: { getCatalog: vi.fn() },
      organizationId: 'org-1',
      brandId: null,
      locationId: 'location-1',
    })).rejects.toThrow('requires organization, brand, and location context');
  });

  it('does not publish a silently truncated coverage denominator', async () => {
    const getCatalog = vi.fn().mockResolvedValue(
      Array.from({ length: PRODUCT_CATALOG_PAGE_SIZE }, (_, index) => ({ id: `product-${index}` }))
    );

    await expect(loadPerformanceProductCatalog({
      productsApi: { getCatalog },
      organizationId: 'org-1',
      brandId: 'brand-1',
      locationId: 'location-1',
      maxPages: 1,
    })).rejects.toThrow('server-side aggregate is required');
  });
});

describe('Phase 2 Budgets behavior', () => {
  it('warns about duplicate-looking category labels without merging them', () => {
    expect(findDuplicateLookingCategories(['Produce', ' produce ', 'Dairy']))
      .toEqual([['Produce', 'produce']]);
  });

  it('preserves active filters when drilling into actual spend', () => {
    const setCategoryIds = vi.fn();
    const onOpenTab = vi.fn();
    applyPerformanceDrilldown({
      filters: { setCategoryIds },
      onOpenTab,
      tab: 'spend_products',
      category: 'Produce',
    });
    expect(setCategoryIds).toHaveBeenCalledWith(['Produce']);
    expect(onOpenTab).toHaveBeenCalledWith('spend_products');
  });

  it('exposes row-specific save and clear pending states and blocks duplicate targets', () => {
    expect(getBudgetRowActionState({
      rowCategory: 'Produce',
      savePending: true,
      saveCategory: 'Produce',
    })).toMatchObject({ disabled: true, saving: true, clearing: false });
    expect(getBudgetRowActionState({
      rowCategory: 'Dairy',
      clearPending: true,
      clearCategory: 'Dairy',
    })).toMatchObject({ disabled: true, saving: false, clearing: true });
    expect(getBudgetRowActionState({
      rowCategory: 'Meat',
      duplicateTargets: true,
    }).disabled).toBe(true);
  });
});
