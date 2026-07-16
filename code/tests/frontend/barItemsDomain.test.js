import { describe, expect, it } from 'vitest';
import { calculateBarItemCosts, filterBarItems, validateBarItem } from '../../src/modules/recipes/lib/barItemsDomain';

describe('Bar Items domain', () => {
  it('calculates cost, pour cost, and profit', () => {
    const result = calculateBarItemCosts({ ingredients: [{ quantity: 2, unit: 'oz', cost_unit: 'oz', unit_cost: 1, yield_percentage: 100 }], primaryYield: { quantity: 1 }, sellingPrice: 10 });
    expect(result.costPerYieldUnit).toBe(2); expect(result.pourCostPercent).toBe(20); expect(result.grossProfit).toBe(8);
  });
  it('does not calculate price metrics at zero price', () => {
    const result = calculateBarItemCosts({ ingredients: [], primaryYield: { quantity: 1 }, sellingPrice: 0 });
    expect(result.pourCostPercent).toBeNull(); expect(result.grossProfit).toBeNull();
  });
  it('filters beverage recipes and validates a primary yield', () => {
    expect(filterBarItems([{ id: '1', category: 'beverage', status: 'active', name: 'Fizz' }], { search: 'fiz' })).toHaveLength(1);
    expect(validateBarItem({ name: 'Fizz', yields: [{ quantity: 1, unit: 'serving', is_primary: true }], ingredients: [], steps: [] })).toEqual([]);
  });
});
