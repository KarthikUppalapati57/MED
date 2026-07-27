import { describe, expect, it } from 'vitest';
import { getEnabledPages, isPageInEnabledModules, normalizeEnabledModules } from '../../src/lib/moduleConfig';

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

  it('normalizes singular recipe module keys from admin metadata', () => {
    expect(normalizeEnabledModules(['recipe'])).toEqual(['recipes']);
    expect(isPageInEnabledModules('Recipes', ['recipe'], 'tenant_super_admin')).toBe(true);
  });

  it('accepts JSON-string and object-shaped module entitlement payloads', () => {
    expect(isPageInEnabledModules('Recipes', '["recipe"]', 'tenant_super_admin')).toBe(true);
    expect(isPageInEnabledModules('Recipes', [{ key: 'recipes' }], 'tenant_super_admin')).toBe(true);
  });

  it('includes Recipes in enabled pages after module key normalization', () => {
    expect(getEnabledPages('["recipe"]').has('Recipes')).toBe(true);
  });

  it('exposes Team Members as a dedicated tenant entitlement', () => {
    expect(normalizeEnabledModules(['user_management'])).toEqual(['team_members']);
    expect(isPageInEnabledModules('UserManagement', ['team_members'], 'tenant_super_admin')).toBe(true);
    expect(getEnabledPages(['team_members']).has('UserManagement')).toBe(true);
  });

  it('includes Team Members when Organization Management is enabled', () => {
    expect(isPageInEnabledModules('UserManagement', ['organization_management'], 'tenant_super_admin')).toBe(true);
    expect(getEnabledPages(['organization_management']).has('UserManagement')).toBe(true);
  });
});