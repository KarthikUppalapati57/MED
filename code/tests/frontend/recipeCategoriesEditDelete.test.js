import { describe, expect, it } from 'vitest';
import { confirmationMessages, getConfirmationMessage } from '@/lib/confirmationMessages';

describe('recipe categories edit/delete client contract', () => {
  it('exposes update/delete helpers on api.recipes', async () => {
    const { api } = await import('@/lib/apiClient');
    expect(typeof api.recipes.updateRecipeCategory).toBe('function');
    expect(typeof api.recipes.deleteRecipeCategory).toBe('function');
    expect(typeof api.recipes.createRecipeCategory).toBe('function');
    expect(typeof api.recipes.listRecipeCategories).toBe('function');
  });

  it('provides shared save/delete recipe category confirmation messages', () => {
    expect(typeof confirmationMessages.saveRecipeCategory).toBe('function');
    expect(typeof confirmationMessages.deleteRecipeCategory).toBe('function');

    const saveMsg = getConfirmationMessage('saveRecipeCategory', 'Appetizer');
    expect(saveMsg.title).toMatch(/Save changes to "Appetizer"/);
    expect(saveMsg.confirmText).toBe('Save Changes');

    const deleteMsg = getConfirmationMessage('deleteRecipeCategory', 'Snacks');
    expect(deleteMsg.title).toMatch(/Delete category "Snacks"/);
    expect(deleteMsg.confirmText).toBe('Delete Category');
    expect(deleteMsg.variant).toBe('destructive');
  });
});
