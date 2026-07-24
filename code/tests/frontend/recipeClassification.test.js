import { describe, expect, it } from 'vitest';
import {
  classifyRecipe,
  filterActiveRecipes,
  getBeverageTypeIds,
  getRecipeClassificationLabel,
  isActiveRecipeRecord,
  isBarRecipe,
  isMenuRecipe,
  isPreparedRecipe,
} from '../../src/modules/recipes/lib/recipeClassification';

describe('recipe classification', () => {
  const recipeTypes = [
    { id: 'cocktail', name: 'Cocktail', kind: 'beverage' },
    { id: 'sauce', name: 'Sauce', kind: 'component' },
  ];

  it('derives beverage recipe type ids', () => {
    expect(getBeverageTypeIds(recipeTypes)).toEqual(['cocktail']);
  });

  it('classifies prepared items before sellable items', () => {
    const recipe = { id: 'prep', is_batch: true, category: 'beverage', recipe_type_id: 'cocktail' };
    expect(isPreparedRecipe(recipe)).toBe(true);
    expect(classifyRecipe(recipe, { recipeTypes }).key).toBe('prepared-item');
  });

  it('classifies beverage recipes as bar items', () => {
    expect(isBarRecipe({ category: 'beverage' })).toBe(true);
    expect(classifyRecipe({ recipe_type_id: 'cocktail' }, { recipeTypes }).key).toBe('bar-item');
  });

  it('classifies ordinary non-batch recipes as menu items', () => {
    const recipe = { category: 'main_course', is_batch: false };
    expect(isMenuRecipe(recipe, getBeverageTypeIds(recipeTypes))).toBe(true);
    expect(getRecipeClassificationLabel(recipe, { recipeTypes })).toBe('Menu Item');
  });

  it('uses General Recipe as the fallback', () => {
    expect(classifyRecipe({ category: 'general' }, { recipeTypes }).key).toBe('general-recipe');
    expect(classifyRecipe(null, { recipeTypes }).key).toBe('general-recipe');
  });

  it('excludes soft-deleted recipes from active classification helpers', () => {
    const deletedPrepared = { id: 'deleted-prep', is_batch: true, deleted_at: '2026-07-24T00:00:00Z' };
    const deletedMenu = { id: 'deleted-menu', category: 'main_course', deleted_at: '2026-07-24T00:00:00Z' };

    expect(isActiveRecipeRecord(deletedPrepared)).toBe(false);
    expect(isPreparedRecipe(deletedPrepared)).toBe(false);
    expect(isMenuRecipe(deletedMenu)).toBe(false);
    expect(filterActiveRecipes([deletedPrepared, { id: 'active', category: 'main_course' }])).toEqual([
      { id: 'active', category: 'main_course' },
    ]);
  });
});
