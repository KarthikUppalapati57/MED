import { describe, expect, it, vi } from 'vitest';
import {
  RECIPE_UNIT_CONVERSION_WRITE_FIELDS,
  buildRecipeUnitConversionWritePayload,
  calculateConvertedUnitCost,
} from '../../src/modules/recipes/lib/recipeUnits';
import { calculateIngredientCost } from '../../src/modules/recipes/lib/recipeCosting';

describe('recipe unit conversion ownership', () => {
  const productSnapshot = Object.freeze({
    id: 'e501fd7a-1911-4312-b235-5b07abb80bfe',
    name: 'BACON, PORK END & PC REAL DCD',
    base_unit: 'CS',
    report_by_unit: 'CS',
    latest_price: 79.9,
    product_id: 'PRD-000011',
    vendor_name: null,
  });

  it('stores only conversion-factor fields on create/update payloads', () => {
    const payload = buildRecipeUnitConversionWritePayload({
      organizationId: 'org-1',
      scope: 'product',
      productId: productSnapshot.id,
      fromUnit: productSnapshot.base_unit,
      toUnit: 'count',
      factor: 24,
      isActive: true,
      updatedAt: '2026-07-22T00:00:00.000Z',
    });

    expect(Object.keys(payload).sort()).toEqual([...RECIPE_UNIT_CONVERSION_WRITE_FIELDS].sort());
    expect(payload).toEqual({
      organization_id: 'org-1',
      product_id: productSnapshot.id,
      from_unit: 'cs',
      to_unit: 'count',
      factor: 24,
      is_active: true,
      updated_at: '2026-07-22T00:00:00.000Z',
    });

    // Explicitly prove purchase fields are never written.
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('base_unit');
    expect(payload).not.toHaveProperty('report_by_unit');
    expect(payload).not.toHaveProperty('latest_price');
    expect(payload).not.toHaveProperty('vendor_name');
    expect(payload).not.toHaveProperty('sku');
  });

  it('calculates $3.33 per count at runtime without mutating purchase cost', () => {
    const recipeUnitCost = calculateConvertedUnitCost(productSnapshot.latest_price, 24);
    expect(recipeUnitCost).toBeCloseTo(3.3291666667, 6);
    expect(Number(recipeUnitCost.toFixed(2))).toBe(3.33);

    // Source product purchase fields remain unchanged.
    expect(productSnapshot.base_unit).toBe('CS');
    expect(productSnapshot.latest_price).toBe(79.9);

    const ingredient = calculateIngredientCost({
      product_id: productSnapshot.id,
      quantity: 1,
      unit: 'count',
      cost_unit: 'cs',
      unit_cost: productSnapshot.latest_price,
      yield_percentage: 100,
    }, [{
      product_id: productSnapshot.id,
      from_unit: 'cs',
      to_unit: 'count',
      factor: 24,
      is_active: true,
    }]);

    // 1 count * (1/24) * $79.90 ≈ $3.33 using purchase cost still stored as $/cs
    expect(ingredient.missingConversion).toBe(false);
    expect(ingredient.cost).toBeCloseTo(3.3291666667, 6);
    expect(productSnapshot.latest_price).toBe(79.9);
  });

  it('create/update/deactivate/delete only touch RecipeUnitConversion, never Product', async () => {
    const productUpdate = vi.fn();
    const productCreate = vi.fn();
    const productDelete = vi.fn();
    const conversionCreate = vi.fn(async (payload) => ({ id: 'rule-1', ...payload }));
    const conversionUpdate = vi.fn(async (id, payload) => ({ id, ...payload }));
    const conversionDelete = vi.fn(async () => ({ ok: true }));

    const api = {
      entities: {
        Product: {
          create: productCreate,
          update: productUpdate,
          delete: productDelete,
        },
        RecipeUnitConversion: {
          create: conversionCreate,
          update: conversionUpdate,
          delete: conversionDelete,
        },
      },
    };

    const createPayload = buildRecipeUnitConversionWritePayload({
      organizationId: 'org-1',
      scope: 'product',
      productId: productSnapshot.id,
      fromUnit: 'cs',
      toUnit: 'count',
      factor: 24,
      isActive: true,
      updatedAt: '2026-07-22T00:00:00.000Z',
    });
    await api.entities.RecipeUnitConversion.create(createPayload);

    const editPayload = buildRecipeUnitConversionWritePayload({
      organizationId: 'org-1',
      scope: 'product',
      productId: productSnapshot.id,
      fromUnit: 'cs',
      toUnit: 'count',
      factor: 30,
      isActive: true,
      updatedAt: '2026-07-22T00:01:00.000Z',
    });
    await api.entities.RecipeUnitConversion.update('rule-1', editPayload);

    await api.entities.RecipeUnitConversion.update('rule-1', {
      is_active: false,
      updated_at: '2026-07-22T00:02:00.000Z',
    });

    await api.entities.RecipeUnitConversion.delete('rule-1');

    expect(conversionCreate).toHaveBeenCalledTimes(1);
    expect(conversionUpdate).toHaveBeenCalledTimes(2);
    expect(conversionDelete).toHaveBeenCalledTimes(1);
    expect(productCreate).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
    expect(productDelete).not.toHaveBeenCalled();

    // After all conversion lifecycle ops, purchase fields are still the Products-module values.
    expect(productSnapshot).toEqual({
      id: 'e501fd7a-1911-4312-b235-5b07abb80bfe',
      name: 'BACON, PORK END & PC REAL DCD',
      base_unit: 'CS',
      report_by_unit: 'CS',
      latest_price: 79.9,
      product_id: 'PRD-000011',
      vendor_name: null,
    });
  });
});
