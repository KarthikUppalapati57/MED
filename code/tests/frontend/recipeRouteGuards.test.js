import { describe, expect, it } from 'vitest';
import { resolveRecipeEditRoute } from '../../src/modules/recipes/lib/recipeRouteGuards';

describe('recipe route guards', () => {
  const recipes = [
    { id: 'menu-1', category: 'main_course' },
    { id: 'prep-1', is_batch: true },
  ];

  it('identifies create routes without requiring a recipe', () => {
    expect(resolveRecipeEditRoute({ routeValue: 'new', recipes })).toEqual({ state: 'new', recipe: null });
  });

  it('waits while an edit target may still be loading', () => {
    expect(resolveRecipeEditRoute({
      routeValue: 'menu-1',
      isEdit: true,
      recipes: [],
      isLoading: true,
    })).toEqual({ state: 'loading', recipe: null });
  });

  it('returns the matching edit recipe when present', () => {
    expect(resolveRecipeEditRoute({
      routeValue: 'menu-1',
      isEdit: true,
      recipes,
      predicate: (recipe) => recipe.category === 'main_course',
    })).toEqual({ state: 'edit', recipe: recipes[0] });
  });

  it('returns not-found after loading when no matching recipe exists', () => {
    expect(resolveRecipeEditRoute({
      routeValue: 'menu-1',
      isEdit: true,
      recipes,
      isLoading: false,
      predicate: (recipe) => recipe.is_batch,
    })).toEqual({ state: 'not-found', recipe: null });
  });
});
