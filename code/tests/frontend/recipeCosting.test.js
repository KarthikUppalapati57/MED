import { describe, expect, it } from 'vitest';
import {
  calculateAlternateYieldCosts,
  calculateRecipeCost,
  findConversionFactor,
} from '../../src/modules/recipes/lib/recipeCosting';

describe('recipe costing', () => {
  const conversions = [
    { from_unit: 'lb', to_unit: 'oz', factor: 16, is_active: true },
    { product_id: 'p1', from_unit: 'case', to_unit: 'ea', factor: 24, is_active: true },
  ];

  it('supports direct and reverse unit conversions', () => {
    expect(findConversionFactor({ fromUnit: 'lb', toUnit: 'oz', conversions })).toBe(16);
    expect(findConversionFactor({ fromUnit: 'oz', toUnit: 'lb', conversions })).toBe(1 / 16);
  });

  it('treats common each-unit aliases as equivalent', () => {
    expect(findConversionFactor({ fromUnit: 'each', toUnit: 'ea', conversions: [] })).toBe(1);
    expect(findConversionFactor({ fromUnit: 'units', toUnit: 'each', conversions: [] })).toBe(1);
  });

  it('uses product-specific conversion rules', () => {
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'ea', productId: 'p1', conversions })).toBe(24);
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'ea', productId: 'p2', conversions })).toBeNull();
  });

  it('calculates ingredient, packaging, labor, yield loss, and cost per output unit', () => {
    const result = calculateRecipeCost({
      ingredients: [{ product_id: 'p1', quantity: 1, unit: 'case', cost_unit: 'ea', unit_cost: 2, yield_percentage: 80 }],
      packagingItems: [{ quantity: 10, unit_cost: 0.1 }],
      laborMinutes: 30,
      laborRatePerHour: 20,
      yieldQuantity: 20,
      yieldPercentage: 100,
      conversions,
    });

    expect(result.ingredientCost).toBe(60);
    expect(result.packagingCost).toBe(1);
    expect(result.laborCost).toBe(10);
    expect(result.totalCost).toBe(71);
    expect(result.costPerYieldUnit).toBe(3.55);
    expect(result.missingConversions).toHaveLength(0);
  });

  it('flags missing conversions instead of silently applying an invalid cost', () => {
    const result = calculateRecipeCost({
      ingredients: [{ product_name: 'Flour', quantity: 2, unit: 'cup', cost_unit: 'lb', unit_cost: 1 }],
    });
    expect(result.missingConversions).toHaveLength(1);
    expect(result.ingredientCost).toBe(0);
  });

  it('calculates costs for alternate outputs', () => {
    expect(calculateAlternateYieldCosts(24, [{ quantity: 12, unit: 'portion' }, { quantity: 3, unit: 'pan' }]))
      .toEqual([
        { quantity: 12, unit: 'portion', cost_per_unit: 2 },
        { quantity: 3, unit: 'pan', cost_per_unit: 8 },
      ]);
  });
});
