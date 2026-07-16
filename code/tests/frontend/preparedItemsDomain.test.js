import { describe, expect, it } from 'vitest';
import { filterPreparedItems, validatePreparedItem, wouldCreatePreparedItemCycle } from '../../src/modules/recipes/lib/preparedItemsDomain';

describe('Prepared Items domain', () => {
  const items = [
    { id: 'sauce', name: 'Base Sauce', is_batch: true, status: 'active', recipe_type_id: 'sauces', ingredients: [] },
    { id: 'dressing', name: 'House Dressing', category: 'prepared_item', status: 'inactive', recipe_type_id: 'dressings', ingredients: [{ sub_recipe_id: 'sauce' }] },
    { id: 'burger', name: 'Burger', is_batch: false, status: 'active' },
  ];

  it('filters only Prepared Items by search, type and status', () => {
    expect(filterPreparedItems(items)).toHaveLength(2);
    expect(filterPreparedItems(items, { search: 'sauce', status: 'active', type: 'sauces' }).map((row) => row.id)).toEqual(['sauce']);
  });

  it('detects direct and transitive dependency cycles', () => {
    expect(wouldCreatePreparedItemCycle('sauce', 'sauce', items)).toBe(true);
    expect(wouldCreatePreparedItemCycle('sauce', 'dressing', items)).toBe(true);
    expect(wouldCreatePreparedItemCycle('dressing', 'sauce', items)).toBe(false);
  });

  it('requires one primary yield and blocks missing conversions', () => {
    const errors = validatePreparedItem({ id: 'new', name: 'Dip', yields: [{ quantity: 1, unit: 'cup', is_primary: true }], visibilityMode: 'all', steps: [], ingredients: [{ product_id: 'p1', quantity: 1, unit: 'cup', missing_conversion: true }] }, items);
    expect(errors.join(' ')).toContain('unit conversion');
    expect(validatePreparedItem({ name: '', yields: [], ingredients: [] }, items)).toContain('Name is required.');
  });
});
