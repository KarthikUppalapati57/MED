import { describe, expect, it } from 'vitest';
import { buildMenuItems, deriveMenuItemMetrics, filterMenuItems, isSellableMenuItem, sortMenuItems } from '../../src/modules/recipes/lib/menuItemsDomain';

describe('Menu Items domain', () => {
  it('separates sellable recipes from prepared components', () => {
    expect(isSellableMenuItem({ category: 'main_course', is_batch: false })).toBe(true);
    expect(isSellableMenuItem({ category: 'prepared_item', is_batch: true })).toBe(false);
  });

  it('derives price, profit, plate cost, and target status', () => {
    const item = deriveMenuItemMetrics({ cost_per_serving: 3, selling_price: 12, margin_alert_enabled: true }, 20);
    expect(item.netProfit).toBe(9);
    expect(item.plateCostPercent).toBe(25);
    expect(item.isAboveTarget).toBe(true);
    expect(item.alertStatus).toBe('active');
  });

  it('uses the recipe target margin as a configurable plate-cost target', () => {
    const item = deriveMenuItemMetrics({ cost_per_serving: 3, selling_price: 10, target_margin_percent: 75, margin_alert_enabled: true });
    expect(item.targetPlateCostPercent).toBe(25);
    expect(item.isAboveTarget).toBe(true);
    expect(item.alertSeverity).toBe('attention');
  });

  it('handles missing menu prices without invalid percentages', () => {
    const item = deriveMenuItemMetrics({ cost_per_serving: 2, selling_price: 0 });
    expect(item.plateCostPercent).toBeNull();
    expect(item.netProfit).toBe(-2);
  });

  it('filters by status, category, alerts, and search', () => {
    const items = buildMenuItems([
      { id: '1', name: 'Classic Burger', category: 'main_course', status: 'active', selling_price: 10, margin_alert_enabled: true },
      { id: '2', name: 'Garden Salad', category: 'side', status: 'inactive', selling_price: 8, margin_alert_enabled: false },
    ]);
    expect(filterMenuItems(items, { search: 'burger', categories: ['main_course'], alertStatuses: ['active'], activeOnly: true })).toHaveLength(1);
    expect(filterMenuItems(items, { categories: ['main_course', 'side'], alertStatuses: ['active', 'none'], activeOnly: false })).toHaveLength(2);
    expect(filterMenuItems(items, { activeOnly: true })).toHaveLength(1);
    expect(filterMenuItems(items, { activeOnly: false })).toHaveLength(2);
  });

  it('recognizes an explicit paused monitoring state', () => {
    expect(deriveMenuItemMetrics({ margin_alert_status: 'paused', margin_alert_enabled: false }).alertStatus).toBe('paused');
  });

  it('reports inventory tracking only when an ingredient is mapped', () => {
    const mapped = deriveMenuItemMetrics({ ingredients: [{ product_id: 'product-1' }, { name: 'Unmapped note' }] });
    const unmapped = deriveMenuItemMetrics({ ingredients: [] });
    expect(mapped.inventoryTracking).toBe(true);
    expect(mapped.mappedIngredientCount).toBe(1);
    expect(unmapped.inventoryTracking).toBe(false);
  });

  it('filters menu items by location visibility mode', () => {
    const items = [
      { id: '1', name: 'Burger', status: 'active', visibilityMode: 'all' },
      { id: '2', name: 'Salad', status: 'active', visibilityMode: 'selected' },
      { id: '3', name: 'Special', status: 'active', visibilityMode: 'hidden' },
    ];
    expect(filterMenuItems(items, { visibility: 'any' })).toHaveLength(3);
    expect(filterMenuItems(items, { visibility: 'selected' })).toEqual([items[1]]);
  });

  it('sorts numeric and text fields without mutating input', () => {
    const items = [{ name: 'Ziti', menuPrice: 8 }, { name: 'Burger', menuPrice: 12 }, { name: 'Salad', menuPrice: 10 }];
    expect(sortMenuItems(items, 'name', 'asc').map((item) => item.name)).toEqual(['Burger', 'Salad', 'Ziti']);
    expect(sortMenuItems(items, 'menuPrice', 'desc').map((item) => item.menuPrice)).toEqual([12, 10, 8]);
    expect(items[0].name).toBe('Ziti');
  });

  it('keeps missing percentages at the end in either direction', () => {
    const items = [{ id: 'missing', plateCostPercent: null }, { id: 'low', plateCostPercent: 10 }, { id: 'high', plateCostPercent: 30 }];
    expect(sortMenuItems(items, 'plateCostPercent', 'asc').map((item) => item.id)).toEqual(['low', 'high', 'missing']);
    expect(sortMenuItems(items, 'plateCostPercent', 'desc').map((item) => item.id)).toEqual(['high', 'low', 'missing']);
  });
});
