import { describe, expect, it } from 'vitest';

/**
 * Lightweight contract checks for Recipe Categories Phase 1 client wiring.
 * DB RPC behavior is covered by migration application + manual QA.
 */

describe('recipe categories phase 1 client contract', () => {
  it('exposes list/create/count helpers on api.recipes', async () => {
    const { api } = await import('@/lib/apiClient');
    expect(typeof api.recipes.listRecipeCategories).toBe('function');
    expect(typeof api.recipes.createRecipeCategory).toBe('function');
    expect(typeof api.recipes.getRecipeCategoryCounts).toBe('function');
    expect(typeof api.recipes.updateRecipeCategory).toBe('function');
    expect(typeof api.recipes.deleteRecipeCategory).toBe('function');
  });
});
