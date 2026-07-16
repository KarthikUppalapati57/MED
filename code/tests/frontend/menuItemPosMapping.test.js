import { describe, expect, it } from 'vitest';
import { enrichMenuItemWithPos, menuItemNameScore } from '../../src/modules/recipes/lib/menuItemPosMapping';

describe('Menu Item POS mapping', () => {
  it('scores normalized exact names and token overlap', () => {
    expect(menuItemNameScore('Classic Burger!', 'classic burger')).toBe(1);
    expect(menuItemNameScore('Grilled Chicken Sandwich', 'Chicken Sandwich')).toBeCloseTo(2 / 3);
  });

  it('uses manual price before mapped POS price', () => {
    const mapping = [{ id: 'm1', recipe_id: 'r1', pos_item_id: 'p1' }];
    const pos = [{ id: 'p1', item_name: 'Burger', price: 14 }];
    expect(enrichMenuItemWithPos({ id: 'r1', name: 'Burger', cost: 4, selling_price: 12 }, pos, mapping).priceSource).toBe('manual');
    const fallback = enrichMenuItemWithPos({ id: 'r1', name: 'Burger', cost: 4, selling_price: 0 }, pos, mapping);
    expect(fallback.menuPrice).toBe(14);
    expect(fallback.priceSource).toBe('pos');
    expect(fallback.netProfit).toBe(10);
  });

  it('suggests a strong unmapped name match', () => {
    const item = enrichMenuItemWithPos({ id: 'r1', name: 'Chicken Sandwich', cost: 3, selling_price: 0 }, [{ id: 'p1', item_name: 'Chicken Sandwich', price: 11 }], []);
    expect(item.mappingStatus).toBe('suggested');
    expect(item.suggestedPosItem.id).toBe('p1');
  });
});
