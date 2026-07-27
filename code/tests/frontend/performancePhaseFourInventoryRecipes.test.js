import { describe, expect, it } from 'vitest';
import {
  getCountPairStatus,
  getReorderStatus,
  mergeRecipeAnalyticsEvidence,
  prepareInventoryUsageRows,
  prepareRecipeRows,
  summarizeInventoryCoverage,
  summarizeRecipeCoverage,
} from '../../src/modules/performance/services/inventoryRecipeCalculations';

describe('Phase 4 Inventory Usage semantics', () => {
  it.each([
    [{ openingQuantity: 2, closingQuantity: 1 }, 'complete'],
    [{ openingQuantity: 2, closingQuantity: null }, 'opening_only'],
    [{ openingQuantity: null, closingQuantity: 1 }, 'closing_only'],
    [{ openingQuantity: null, closingQuantity: null }, 'neither'],
  ])('distinguishes count-pair completeness', (row, expected) => {
    expect(getCountPairStatus(row)).toBe(expected);
  });

  it('requires all count and movement inputs before calculating usage', () => {
    const [row] = prepareInventoryUsageRows([{
      openingQuantity: 10, closingQuantity: 5, receivedQuantity: null,
      transfersIn: 0, transfersOut: 0, adjustmentQuantity: 0, unitCost: 2,
    }]);
    expect(row.calculatedUsage).toBeNull();
    expect(row.usageValue).toBeNull();
  });

  it('requires usage and unit cost before calculating usage value', () => {
    const [row] = prepareInventoryUsageRows([{
      openingQuantity: 10, closingQuantity: 5, receivedQuantity: 0,
      transfersIn: 0, transfersOut: 0, adjustmentQuantity: 0, unitCost: null,
    }]);
    expect(row.calculatedUsage).toBe(5);
    expect(row.usageValue).toBeNull();
  });

  it('preserves confirmed zero usage and zero value', () => {
    const [row] = prepareInventoryUsageRows([{
      openingQuantity: 5, closingQuantity: 5, receivedQuantity: 0,
      transfersIn: 0, transfersOut: 0, adjustmentQuantity: 0, unitCost: 4,
    }]);
    expect(row.calculatedUsage).toBe(0);
    expect(row.usageValue).toBe(0);
  });

  it.each([
    [{ currentQuantity: 2, reorderPoint: 4 }, 'below'],
    [{ currentQuantity: 4, reorderPoint: 4 }, 'at'],
    [{ currentQuantity: 5, reorderPoint: 4 }, 'above'],
    [{ currentQuantity: null, reorderPoint: 4 }, 'on_hand_unavailable'],
    [{ currentQuantity: 5, reorderPoint: null }, 'reorder_point_unavailable'],
    [{ currentQuantity: 5, reorderPoint: 0 }, 'reorder_point_unavailable'],
  ])('classifies reorder state without calling missing data healthy', (row, expected) => {
    expect(getReorderStatus(row).status).toBe(expected);
  });

  it('preserves current inventory evidence and cost provenance', () => {
    const [row] = prepareInventoryUsageRows([{
      openingQuantity: 10,
      closingQuantity: 5,
      receivedQuantity: 0,
      transfersIn: 0,
      transfersOut: 0,
      adjustmentQuantity: 0,
      currentOnHandQuantity: 7,
      reorderPoint: 8,
      unitCost: 4,
      unitCostSource: 'inventory.unit_cost',
      currentInventoryValue: 28,
      currentInventoryValueSource: 'inventory.current_value',
    }]);

    expect(row).toMatchObject({
      currentOnHandQuantity: 7,
      reorderPoint: 8,
      reorderStatus: 'below',
      unitCost: 4,
      unitCostSource: 'inventory.unit_cost',
      currentInventoryValue: 28,
      currentInventoryValueSource: 'inventory.current_value',
    });
  });

  it('reports partial coverage without treating missing counts as zero', () => {
    const coverage = summarizeInventoryCoverage([
      { openingQuantity: 1, closingQuantity: 0, receivedQuantity: 0, transfersIn: 0, transfersOut: 0, adjustmentQuantity: 0, unitCost: 2 },
      { openingQuantity: null, closingQuantity: null, receivedQuantity: 0, transfersIn: 0, transfersOut: 0, adjustmentQuantity: 0, unitCost: 2 },
    ]);
    expect(coverage.completeCountPairs).toBe(1);
    expect(coverage.countCoverage).toBe(50);
    expect(coverage.partial).toBe(true);
  });
});

describe('Phase 4 Recipe analytics semantics', () => {
  const completeIngredients = [{ total_cost: 2 }, { unit_cost_snapshot: 1 }];

  it('keeps missing selling price unavailable', () => {
    const [row] = prepareRecipeRows([{ ingredients: completeIngredients, cost_per_serving: 3 }]);
    expect(row.sellingPrice).toBeNull();
    expect(row.grossMargin).toBeNull();
  });

  it('uses the Recipe module stored cost while identifying incomplete snapshots', () => {
    const [row] = prepareRecipeRows([{ ingredients: [{ total_cost: 2 }, {}], cost_per_serving: 3, selling_price: 10 }]);
    expect(row.costingStatus).toBe('stored_cost_only');
    expect(row.ingredientCost).toBe(3);
    expect(row.grossProfit).toBe(7);
    expect(row.dataConfidence).toBe('stored_recipe_cost');
  });

  it('does not calculate a percentage for zero selling price', () => {
    const [row] = prepareRecipeRows([{ ingredients: completeIngredients, cost_per_serving: 3, selling_price: 0 }]);
    expect(row.pricingStatus).toBe('zero');
    expect(row.grossMargin).toBeNull();
  });

  it('calculates profit, margin, and target variance only for calculable recipes', () => {
    const [row] = prepareRecipeRows([{
      ingredients: completeIngredients, cost_per_serving: 4, selling_price: 10, target_margin_percent: 65,
    }]);
    expect(row.grossProfit).toBe(6);
    expect(row.grossMargin).toBe(60);
    expect(row.marginVariance).toBe(-5);
    expect(row.belowTarget).toBe(true);
  });

  it('uses the full calculable set for risk and coverage denominators', () => {
    const result = summarizeRecipeCoverage([
      { name: 'Risk', ingredients: completeIngredients, cost_per_serving: 6, selling_price: 10, target_margin_percent: 50 },
      { name: 'Good', ingredients: completeIngredients, cost_per_serving: 2, selling_price: 10, target_margin_percent: 50 },
      { name: 'Missing', ingredients: [{}], selling_price: 10 },
    ]);
    expect(result.totalCount).toBe(3);
    expect(result.calculableCount).toBe(2);
    expect(result.belowTargetRows).toHaveLength(1);
    expect(result.marginCoverage).toBeCloseTo(66.667, 2);
    expect(result.rows).toHaveLength(3);
    expect(result.partial).toBe(true);
  });

  it('uses normalized ingredients and the active location price', () => {
    const [row] = mergeRecipeAnalyticsEvidence({
      recipes: [{
        id: 'recipe-a',
        organization_id: 'org-a',
        selling_price: 12,
        ingredients: [{ total_cost: 999 }],
      }],
      ingredients: [
        { recipe_id: 'recipe-a', total_cost: 2 },
        { recipe_id: 'recipe-a', unit_cost_snapshot: 1 },
      ],
      locationPrices: [
        { recipe_id: 'recipe-a', location_id: 'location-a', price: 10 },
      ],
      visibility: [
        { recipe_id: 'recipe-a', location_id: 'location-a' },
      ],
      locationId: 'location-a',
    });

    expect(row.ingredients).toHaveLength(2);
    expect(row.selling_price).toBe(10);
    expect(row.sellingPriceSource).toBe('recipe_location_prices.price');
  });

  it('excludes recipes explicitly visible only at another location', () => {
    const rows = mergeRecipeAnalyticsEvidence({
      recipes: [{ id: 'recipe-a', organization_id: 'org-a' }],
      visibility: [{ recipe_id: 'recipe-a', location_id: 'location-b' }],
      locationId: 'location-a',
    });

    expect(rows).toEqual([]);
  });
});
