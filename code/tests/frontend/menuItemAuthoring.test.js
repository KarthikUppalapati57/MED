import { describe, expect, it } from 'vitest';
import { calculateMenuItemAuthoringCosts, parseIngredientText, validateMenuItemAuthoring } from '../../src/modules/recipes/lib/menuItemAuthoring';

describe('Menu Item authoring', () => {
  it('parses pasted ingredients and matches catalog items', () => {
    const rows = parseIngredientText('2 cup Flour\n1 ea Unknown garnish', [{ id: 'p1', kind: 'product', name: 'Flour', unit_cost: 1, cost_unit: 'cup' }]);
    expect(rows[0]).toMatchObject({ product_id: 'p1', quantity: 2, unit: 'cup', needs_review: false });
    expect(rows[1]).toMatchObject({ product_name: 'Unknown garnish', needs_review: true });
  });

  it('parses comma-separated ingredient lists into separate review rows', () => {
    const rows = parseIngredientText('2 cup flour, 1 lb chicken wings, BBQ sauce, egg');
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.product_name)).toEqual(['flour', 'chicken wings', 'BBQ sauce', 'egg']);
  });

  it('calculates live price economics from the primary yield', () => {
    const costs = calculateMenuItemAuthoringCosts({ ingredients: [{ quantity: 4, unit: 'ea', cost_unit: 'ea', unit_cost: 2, yield_percentage: 100 }], primaryYield: { quantity: 2 }, globalPrice: 10 });
    expect(costs.ingredientCost).toBe(8);
    expect(costs.costPerYieldUnit).toBe(4);
    expect(costs.netProfit).toBe(6);
    expect(costs.plateCostPercent).toBe(40);
  });

  it('requires tenant-safe authoring essentials before save', () => {
    expect(validateMenuItemAuthoring({ name: '', yields: [], ingredients: [], steps: [], globalPrice: 0 })).toContain('Name is required.');
    expect(validateMenuItemAuthoring({ name: 'Burger', yields: [{ quantity: 1, unit: 'serving' }], ingredients: [{ product_name: 'Unknown', quantity: 1, unit: 'ea' }], steps: [], globalPrice: 10 })).toContain('Review and match every imported ingredient before saving.');
  });
});
