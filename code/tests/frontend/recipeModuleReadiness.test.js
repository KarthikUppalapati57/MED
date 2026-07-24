import { describe, expect, it } from 'vitest';
import { buildRecipeModuleReadiness } from '../../src/modules/recipes/lib/recipeModuleReadiness';

describe('Recipe module readiness', () => {
  it('tracks phase-one costing setup without requiring POS or sales data', () => {
    const readiness = buildRecipeModuleReadiness({
      products: [{ id: 'p1' }],
      conversions: [{ id: 'c1' }],
      recipeTypes: [{ id: 'beer', kind: 'beverage' }],
      recipes: [
        { id: 'batch', name: 'Sauce', is_batch: true, total_cost: 12 },
        { id: 'burger', name: 'Burger', category: 'main_course', is_batch: false, cost_per_serving: 3, selling_price: 12 },
        { id: 'draft', name: 'Draft Beer', category: 'beverage', recipe_type_id: 'beer', cost_per_serving: 2, selling_price: 8 },
      ],
    });

    expect(readiness.steps.find((step) => step.key === 'products').complete).toBe(true);
    expect(readiness.steps.find((step) => step.key === 'conversions').complete).toBe(true);
    expect(readiness.steps.find((step) => step.key === 'prepared-items').complete).toBe(true);
    expect(readiness.steps.find((step) => step.key === 'menu-items')).toMatchObject({ complete: true, count: 1, total: 1 });
    expect(readiness.steps.find((step) => step.key === 'prices')).toMatchObject({ complete: true, count: 1, total: 1 });
    expect(readiness.steps.find((step) => step.key === 'bar-items')).toMatchObject({ complete: true, optional: true, count: 1 });
    expect(readiness.requiredTotal).toBe(5);
  });

  it('does not mark menu items costed just because a prepared item has cost', () => {
    const readiness = buildRecipeModuleReadiness({
      products: [{ id: 'p1' }],
      conversions: [{ id: 'c1' }],
      recipes: [
        { id: 'batch', name: 'Sauce', is_batch: true, total_cost: 12 },
        { id: 'burger', name: 'Burger', category: 'main_course', is_batch: false, selling_price: 12 },
      ],
    });

    expect(readiness.costedItems.map((item) => item.id)).toEqual(['batch']);
    expect(readiness.costedMenuItems).toEqual([]);
    expect(readiness.steps.find((step) => step.key === 'menu-items')).toMatchObject({ complete: false, count: 0, total: 1 });
  });
});
