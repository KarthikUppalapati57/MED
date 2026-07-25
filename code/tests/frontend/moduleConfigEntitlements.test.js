import { describe, expect, it } from 'vitest';
import { isPageInEnabledModules } from '../../src/lib/moduleConfig';

describe('module entitlement aliases', () => {
  it('allows Recipes when the organization is entitled to the recipes module key', () => {
    expect(isPageInEnabledModules('Recipes', ['recipes'], 'tenant_super_admin')).toBe(true);
  });

  it('keeps the historical recipe_management key working for Recipes', () => {
    expect(isPageInEnabledModules('Recipes', ['recipe_management'], 'tenant_super_admin')).toBe(true);
  });

  it('does not enable Recipes from unrelated operational modules', () => {
    expect(isPageInEnabledModules('Recipes', ['invoices', 'payments'], 'tenant_super_admin')).toBe(false);
  });
});