import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCatalog = vi.fn();
const productList = vi.fn();

vi.mock('../../src/lib/apiClient', () => ({
  api: {
    products: {
      getCatalog: (...args) => getCatalog(...args),
    },
    entities: {
      Product: {
        list: (...args) => productList(...args),
      },
    },
  },
}));

describe('loadConversionCatalogProducts', () => {
  beforeEach(() => {
    getCatalog.mockReset();
    productList.mockReset();
    vi.resetModules();
  });

  it('passes active organization, brand, and location to getCatalog', async () => {
    getCatalog.mockResolvedValue([
      { id: 'p1', name: 'Chicken Breast', base_unit: 'Case', latest_price: 72, vendor_name: 'Sysco' },
    ]);

    const { loadConversionCatalogProducts } = await import('../../src/modules/recipes/lib/conversionProducts');
    const rows = await loadConversionCatalogProducts('org-1', {
      brandId: 'brand-1',
      locationId: 'loc-1',
    });

    expect(getCatalog).toHaveBeenCalledWith({
      organizationId: 'org-1',
      brandId: 'brand-1',
      locationId: 'loc-1',
      sortBy: 'name',
      page: 0,
      pageSize: 100,
    });
    expect(productList).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Chicken Breast');
  });

  it('falls back to Product.list when catalog RPC is missing', async () => {
    getCatalog.mockRejectedValue({
      code: 'PGRST202',
      message: 'Could not find the function public.get_product_catalog in the schema cache',
    });
    productList.mockResolvedValue([
      { id: 'p1', name: 'CELERY', base_unit: 'case', report_by_unit: 'Case', latest_price: 12 },
    ]);

    const { loadConversionCatalogProducts } = await import('../../src/modules/recipes/lib/conversionProducts');
    const rows = await loadConversionCatalogProducts('org-1', { brandId: 'b1', locationId: 'l1' });

    expect(productList).toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('CELERY');
  });

  it('formats product options with unit, cost, and optional sku/vendor', async () => {
    const {
      formatConversionProductOption,
      resolveConversionProductName,
    } = await import('../../src/modules/recipes/lib/conversionProducts');

    expect(formatConversionProductOption({
      name: 'Chicken Breast',
      base_unit: 'Case',
      latest_price: 72,
      product_id: 'CHK-01',
      vendor_name: 'Sysco',
    })).toBe('Chicken Breast — case — $72.00 — SKU CHK-01 — Sysco');

    expect(formatConversionProductOption({
      name: 'Heavy Cream',
      report_by_unit: 'Gallon',
      latest_price: 18.5,
    })).toBe('Heavy Cream — gallon — $18.50');

    const map = new Map([['p1', { id: 'p1', name: 'Chicken Breast' }]]);
    expect(resolveConversionProductName(map, 'p1')).toBe('Chicken Breast');
    expect(resolveConversionProductName(map, 'missing')).toBe('Unknown product');
    expect(resolveConversionProductName(map, null)).toBe('—');
  });
});
