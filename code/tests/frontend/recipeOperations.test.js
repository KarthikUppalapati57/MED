import { describe, expect, it } from 'vitest';
import { buildRecipeOperationsOverview } from '../../src/modules/recipes/lib/recipeOperations';

describe('recipe operations overview', () => {
  it('summarizes Opsi-style recipe operations from existing module data', () => {
    const overview = buildRecipeOperationsOverview({
      products: [
        { id: 'p1', latest_price: 12 },
        { id: 'p2', latest_price: 0 },
      ],
      conversions: [{ id: 'c1' }],
      recipeTypes: [{ id: 'beer', kind: 'beverage' }],
      recipeCategories: [{ id: 'cat-1' }, { id: 'cat-2' }],
      recipes: [
        {
          id: 'prep-1',
          name: 'Base Sauce',
          is_batch: true,
          total_cost: 20,
          yield_quantity: 1,
          ingredients: [{ product_id: 'p1' }],
        },
        {
          id: 'menu-1',
          name: 'Burger',
          category: 'main_course',
          cost_per_serving: 4,
          selling_price: 14,
          yield_quantity: 1,
          ingredients: [{ product_id: 'p1' }],
        },
        {
          id: 'bar-1',
          name: 'Draft Beer',
          category: 'beverage',
          recipe_type_id: 'beer',
          cost_per_serving: 2,
          selling_price: 8,
        },
      ],
    });

    expect(overview.summary).toMatchObject({
      totalRecipes: 3,
      menuItems: 1,
      preparedItems: 1,
      barItems: 1,
      costedRecipes: 3,
      invoicePricedProducts: 1,
      categories: 2,
      nutritionReadyRecipes: 2,
    });
    expect(overview.tools.map((tool) => tool.key)).toEqual([
      'recipe-book',
      'food-costing',
      'invoice-price-sync',
      'inventory',
      'prep-production',
      'task-checklists',
      'nutrition-labels',
      'training',
      'purchasing',
      'analytics',
    ]);
    expect(overview.tools.find((tool) => tool.key === 'food-costing')).toMatchObject({ status: 'live', metric: 3 });
    expect(overview.tools.find((tool) => tool.key === 'task-checklists')).toMatchObject({ status: 'ready', metric: 2 });
  });
});