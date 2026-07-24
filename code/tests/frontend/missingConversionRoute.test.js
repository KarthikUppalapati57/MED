import { describe, expect, it } from 'vitest';
import {
  buildMissingConversionSetupPath,
  readMissingConversionSetupParams,
} from '../../src/modules/recipes/lib/missingConversionRoute';

describe('missing conversion route helpers', () => {
  it('builds a Setup route with product, unit, quantity, and return context', () => {
    const path = buildMissingConversionSetupPath(
      {
        product_id: 'flour',
        product_name: 'Bread Flour',
        from_unit: 'cup',
        to_unit: 'lb',
        quantity: 2,
      },
      {
        pathname: '/Recipes/menu-items/new',
        search: '?company=org-1&store=loc-1',
      },
    );

    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toBe('/Recipes/setup');
    expect(url.searchParams.get('company')).toBe('org-1');
    expect(url.searchParams.get('store')).toBe('loc-1');
    expect(url.searchParams.get('conversionProductId')).toBe('flour');
    expect(url.searchParams.get('conversionProductName')).toBe('Bread Flour');
    expect(url.searchParams.get('fromUnit')).toBe('lb');
    expect(url.searchParams.get('toUnit')).toBe('cup');
    expect(url.searchParams.get('quantity')).toBe('2');
    expect(url.searchParams.get('returnTo')).toBe('/Recipes/menu-items/new?company=org-1&store=loc-1');
  });

  it('reads Setup prefill params into dialog defaults', () => {
    const { defaults, returnTo } = readMissingConversionSetupParams(
      '?conversionProductId=flour&fromUnit=lb&toUnit=cup&quantity=2&returnTo=%2FRecipes%2Fmenu-items%2Fnew',
    );

    expect(defaults).toMatchObject({
      scope: 'product',
      productId: 'flour',
      fromUnit: 'lb',
      toUnit: 'cup',
      factor: '',
      focusFactor: true,
      sampleQuantity: 2,
    });
    expect(returnTo).toBe('/Recipes/menu-items/new');
  });

  it('falls back to organization scope when no product is present', () => {
    const { defaults } = readMissingConversionSetupParams('?fromUnit=lb&toUnit=oz');
    expect(defaults.scope).toBe('org');
    expect(defaults.productId).toBe('');
  });
});
