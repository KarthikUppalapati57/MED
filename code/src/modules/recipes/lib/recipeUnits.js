/** Canonical kitchen / purchase units used by recipe costing. */
export const RECIPE_UNIT_OPTIONS = [
  'serving',
  'each',
  'count',
  'case',
  'oz',
  'lb',
  'g',
  'kg',
  'ml',
  'l',
  'cup',
  'tbsp',
  'tsp',
  'bottle',
  'box',
  'can',
  'bag',
  'gallon',
  'quart',
  'pint',
];

const UNIT_ALIASES = {
  ea: 'each',
  unit: 'each',
  units: 'each',
  pcs: 'each',
  pc: 'each',
  piece: 'each',
  pieces: 'each',
  counts: 'count',
  cases: 'case',
  pound: 'lb',
  pounds: 'lb',
  ounce: 'oz',
  ounces: 'oz',
  'fluid ounce': 'oz',
  'fluid ounces': 'oz',
  floz: 'oz',
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cups: 'cup',
  servings: 'serving',
  bottles: 'bottle',
  boxes: 'box',
  cans: 'can',
  bags: 'bag',
  gallons: 'gallon',
  quarts: 'quart',
  pints: 'pint',
};

export const CUSTOM_UNIT_VALUE = '__custom__';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function normalizeRecipeUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return UNIT_ALIASES[normalized] || normalized;
}

export function getProductCostUnit(product) {
  return normalizeRecipeUnit(product?.base_unit || product?.report_by_unit || '');
}

export function formatConversionRule({ fromUnit, toUnit, from_unit, to_unit, factor }) {
  const from = normalizeRecipeUnit(fromUnit || from_unit) || 'unit';
  const to = normalizeRecipeUnit(toUnit || to_unit) || 'unit';
  const amount = Number(factor);
  const factorLabel = Number.isFinite(amount)
    ? (Number.isInteger(amount) ? String(amount) : amount.toFixed(4).replace(/\.?0+$/, ''))
    : '—';
  return `1 ${from} = ${factorLabel} ${to}`;
}

export function formatMoneyPerUnit(amount, unit) {
  const value = Number(amount);
  const label = normalizeRecipeUnit(unit) || 'unit';
  if (!Number.isFinite(value)) return `— / ${label}`;
  return `${money.format(value)} / ${label}`;
}

/** Cost of one recipe unit given purchase price for one purchased unit. */
export function calculateConvertedUnitCost(purchasePrice, factor) {
  const price = Number(purchasePrice);
  const amount = Number(factor);
  if (!Number.isFinite(price) || !Number.isFinite(amount) || amount <= 0) return null;
  return price / amount;
}

/**
 * Payload written to recipe_unit_conversions only.
 * Never includes product purchase fields (name, base_unit, latest_price, SKU, vendor).
 */
export const RECIPE_UNIT_CONVERSION_WRITE_FIELDS = Object.freeze([
  'organization_id',
  'product_id',
  'from_unit',
  'to_unit',
  'factor',
  'is_active',
  'updated_at',
]);

export function buildRecipeUnitConversionWritePayload({
  organizationId,
  scope = 'product',
  productId = null,
  fromUnit,
  toUnit,
  factor,
  isActive = true,
  updatedAt = new Date().toISOString(),
}) {
  return {
    organization_id: organizationId,
    product_id: scope === 'product' ? (productId || null) : null,
    from_unit: normalizeRecipeUnit(fromUnit),
    to_unit: normalizeRecipeUnit(toUnit),
    factor: Number(factor),
    is_active: Boolean(isActive),
    updated_at: updatedAt,
  };
}

export function validateConversionDraft({
  scope = 'product',
  productId = null,
  fromUnit,
  toUnit,
  factor,
}) {
  const errors = [];
  const from = normalizeRecipeUnit(fromUnit);
  const to = normalizeRecipeUnit(toUnit);
  if (scope === 'product' && !productId) errors.push('Select a product for product-specific rules.');
  if (!from) errors.push('Purchased unit is required.');
  if (!to) errors.push('Recipe unit is required.');
  if (from && to && from === to) errors.push('Purchased and recipe units must be different.');
  const numericFactor = Number(factor);
  if (!Number.isFinite(numericFactor) || numericFactor <= 0) {
    errors.push('Factor must be a number greater than zero.');
  }
  return errors;
}

export function isConversionDraftValid(draft) {
  return validateConversionDraft(draft).length === 0;
}

export function findDuplicateConversion({
  existing = [],
  scope = 'product',
  productId = null,
  fromUnit,
  toUnit,
  excludeId = null,
}) {
  const from = normalizeRecipeUnit(fromUnit);
  const to = normalizeRecipeUnit(toUnit);
  const scopedProductId = scope === 'product' ? (productId || null) : null;
  return existing.find((row) => {
    if (excludeId && row.id === excludeId) return false;
    const sameProduct = (row.product_id || null) === scopedProductId;
    const samePair = normalizeRecipeUnit(row.from_unit) === from
      && normalizeRecipeUnit(row.to_unit) === to;
    const reversePair = normalizeRecipeUnit(row.from_unit) === to
      && normalizeRecipeUnit(row.to_unit) === from;
    return sameProduct && (samePair || reversePair);
  }) || null;
}

/** Soft warnings — never block save. */
export function getSuspiciousConversionWarnings({ fromUnit, toUnit, factor }) {
  const warnings = [];
  const from = normalizeRecipeUnit(fromUnit);
  const to = normalizeRecipeUnit(toUnit);
  const amount = Number(factor);
  if (!from || !to || !Number.isFinite(amount) || amount <= 0) return warnings;

  if (amount >= 1000) {
    warnings.push(`Factor ${amount} is very large. Confirm 1 ${from} really equals ${amount} ${to}.`);
  } else if (amount > 0 && amount < 0.001) {
    warnings.push(`Factor ${amount} is very small. Confirm this pack size is intentional.`);
  }

  if (amount === 1) {
    warnings.push('Factor is 1 for different units. That usually means the units are equivalent — double-check naming.');
  }

  const weight = new Set(['lb', 'oz', 'g', 'kg']);
  const volume = new Set(['ml', 'l', 'cup', 'tbsp', 'tsp', 'gallon', 'quart', 'pint']);
  if ((weight.has(from) && volume.has(to)) || (volume.has(from) && weight.has(to))) {
    warnings.push('This converts between weight and volume. Only use when your kitchen has a measured density for this item.');
  }

  return warnings;
}

export function buildUnitSelectOptions(extraUnits = []) {
  const set = new Set(RECIPE_UNIT_OPTIONS);
  for (const unit of extraUnits) {
    const normalized = normalizeRecipeUnit(unit);
    if (normalized) set.add(normalized);
  }
  return [...set];
}

export function buildConversionChecklist({
  scope,
  productId,
  fromUnit,
  toUnit,
  factor,
  hasDuplicate = false,
}) {
  const from = normalizeRecipeUnit(fromUnit);
  const to = normalizeRecipeUnit(toUnit);
  const amount = Number(factor);
  return [
    { id: 'scope', label: 'Scope selected', ok: scope === 'org' || (scope === 'product' && Boolean(productId)) },
    { id: 'units', label: 'Units are compatible', ok: Boolean(from && to && from !== to) },
    { id: 'factor', label: 'Factor is valid', ok: Number.isFinite(amount) && amount > 0 },
    { id: 'duplicate', label: 'No duplicate detected', ok: !hasDuplicate },
  ];
}

/** Prefills a natural pack-size rule: 1 cost_unit = N recipe_unit */
export function buildMissingConversionDefaults(missing) {
  if (!missing) return null;
  return {
    scope: 'product',
    productId: missing.product_id || '',
    fromUnit: missing.to_unit || '',
    toUnit: missing.from_unit || '',
    factor: '',
    focusFactor: true,
    sampleQuantity: Number(missing.quantity) > 0 ? Number(missing.quantity) : 2,
  };
}

