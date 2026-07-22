import { describe, expect, it } from 'vitest';
import {
  buildConversionChecklist,
  buildMissingConversionDefaults,
  calculateConvertedUnitCost,
  findDuplicateConversion,
  formatConversionRule,
  formatMoneyPerUnit,
  getSuspiciousConversionWarnings,
  isConversionDraftValid,
  normalizeRecipeUnit,
  validateConversionDraft,
} from '../../src/modules/recipes/lib/recipeUnits';
import {
  calculateAlternateYieldCosts,
  calculateRecipeCost,
  findConversionFactor,
} from '../../src/modules/recipes/lib/recipeCosting';

describe('recipe units', () => {
  it('normalizes common purchase and kitchen aliases', () => {
    expect(normalizeRecipeUnit('Pound')).toBe('lb');
    expect(normalizeRecipeUnit('Case')).toBe('case');
    expect(normalizeRecipeUnit('ea')).toBe('each');
    expect(normalizeRecipeUnit('Fluid Ounce')).toBe('oz');
  });

  it('formats conversion previews', () => {
    expect(formatConversionRule({ from_unit: 'case', to_unit: 'count', factor: 24 }))
      .toBe('1 case = 24 count');
  });

  it('validates conversion drafts', () => {
    expect(validateConversionDraft({
      scope: 'product',
      productId: null,
      fromUnit: 'case',
      toUnit: 'count',
      factor: 24,
    })[0]).toMatch(/Select a product/);

    expect(validateConversionDraft({
      scope: 'org',
      fromUnit: 'lb',
      toUnit: 'lb',
      factor: 1,
    })[0]).toMatch(/different/);

    expect(isConversionDraftValid({
      scope: 'org',
      fromUnit: 'lb',
      toUnit: 'oz',
      factor: 16,
    })).toBe(true);
  });

  it('detects duplicate and reverse duplicate pairs', () => {
    const existing = [
      { id: '1', product_id: 'p1', from_unit: 'case', to_unit: 'count', factor: 24 },
    ];
    expect(findDuplicateConversion({
      existing,
      scope: 'product',
      productId: 'p1',
      fromUnit: 'Case',
      toUnit: 'Count',
    })?.id).toBe('1');
    expect(findDuplicateConversion({
      existing,
      scope: 'product',
      productId: 'p1',
      fromUnit: 'count',
      toUnit: 'case',
    })?.id).toBe('1');
    expect(findDuplicateConversion({
      existing,
      scope: 'org',
      fromUnit: 'case',
      toUnit: 'count',
    })).toBeNull();
  });

  it('builds live cost preview math', () => {
    expect(calculateConvertedUnitCost(96, 24)).toBe(4);
    expect(formatMoneyPerUnit(4, 'count')).toBe('$4.00 / count');
  });

  it('returns soft warnings for suspicious factors without blocking', () => {
    const warnings = getSuspiciousConversionWarnings({ fromUnit: 'case', toUnit: 'count', factor: 5000 });
    expect(warnings[0]).toMatch(/very large/);
    expect(isConversionDraftValid({
      scope: 'org',
      fromUnit: 'case',
      toUnit: 'count',
      factor: 5000,
    })).toBe(true);
  });

  it('prefills missing-conversion defaults for product pack-size entry', () => {
    expect(buildMissingConversionDefaults({
      product_id: 'p1',
      from_unit: 'count',
      to_unit: 'case',
    })).toEqual({
      scope: 'product',
      productId: 'p1',
      fromUnit: 'case',
      toUnit: 'count',
      factor: '',
      focusFactor: true,
      sampleQuantity: 2,
    });
  });

  it('builds readiness checklist items', () => {
    expect(buildConversionChecklist({
      scope: 'product',
      productId: 'p1',
      fromUnit: 'case',
      toUnit: 'count',
      factor: 24,
      hasDuplicate: false,
    }).every((item) => item.ok)).toBe(true);
  });
});

describe('recipe costing', () => {
  const conversions = [
    { from_unit: 'lb', to_unit: 'oz', factor: 16, is_active: true },
    { product_id: 'p1', from_unit: 'case', to_unit: 'ea', factor: 24, is_active: true },
  ];

  it('supports direct and reverse unit conversions', () => {
    expect(findConversionFactor({ fromUnit: 'lb', toUnit: 'oz', conversions })).toBe(16);
    expect(findConversionFactor({ fromUnit: 'oz', toUnit: 'lb', conversions })).toBe(1 / 16);
  });

  it('treats common each-unit aliases as equivalent', () => {
    expect(findConversionFactor({ fromUnit: 'each', toUnit: 'ea', conversions: [] })).toBe(1);
    expect(findConversionFactor({ fromUnit: 'units', toUnit: 'each', conversions: [] })).toBe(1);
  });

  it('uses product-specific conversion rules', () => {
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'ea', productId: 'p1', conversions })).toBe(24);
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'ea', productId: 'p2', conversions })).toBeNull();
  });

  it('prefers product-specific rules over org-wide rules for the same pair', () => {
    const mixed = [
      { from_unit: 'case', to_unit: 'count', factor: 12, is_active: true },
      { product_id: 'p1', from_unit: 'case', to_unit: 'count', factor: 24, is_active: true },
    ];
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'count', productId: 'p1', conversions: mixed })).toBe(24);
    expect(findConversionFactor({ fromUnit: 'count', toUnit: 'case', productId: 'p1', conversions: mixed })).toBeCloseTo(1 / 24);
    expect(findConversionFactor({ fromUnit: 'case', toUnit: 'count', productId: 'p2', conversions: mixed })).toBe(12);
  });

  it('calculates ingredient, packaging, labor, yield loss, and cost per output unit', () => {
    const result = calculateRecipeCost({
      ingredients: [{ product_id: 'p1', quantity: 1, unit: 'case', cost_unit: 'ea', unit_cost: 2, yield_percentage: 80 }],
      packagingItems: [{ quantity: 10, unit_cost: 0.1 }],
      laborMinutes: 30,
      laborRatePerHour: 20,
      yieldQuantity: 20,
      yieldPercentage: 100,
      conversions,
    });

    expect(result.ingredientCost).toBe(60);
    expect(result.packagingCost).toBe(1);
    expect(result.laborCost).toBe(10);
    expect(result.totalCost).toBe(71);
    expect(result.costPerYieldUnit).toBe(3.55);
    expect(result.missingConversions).toHaveLength(0);
  });

  it('flags missing conversions instead of silently applying an invalid cost', () => {
    const result = calculateRecipeCost({
      ingredients: [{ product_name: 'Flour', quantity: 2, unit: 'cup', cost_unit: 'lb', unit_cost: 1 }],
    });
    expect(result.missingConversions).toHaveLength(1);
    expect(result.ingredientCost).toBe(0);
  });

  it('calculates costs for alternate outputs', () => {
    expect(calculateAlternateYieldCosts(24, [{ quantity: 12, unit: 'portion' }, { quantity: 3, unit: 'pan' }]))
      .toEqual([
        { quantity: 12, unit: 'portion', cost_per_unit: 2 },
        { quantity: 3, unit: 'pan', cost_per_unit: 8 },
      ]);
  });
});
