export const PRODUCT_UNIT_OPTIONS = [
  'Bag',
  'Batch',
  'Bottle',
  'Box',
  'Bunch',
  'Bushel',
  'Can',
  'Case',
  'Container',
  'Count',
  'Crate',
  'Cup',
  'Dozen',
  'Each',
  'Flat',
  'Fluid Ounce',
  'Gallon',
  'Gram',
  'Kilogram',
  'Liter',
  'Milliliter',
  'Ounce',
  'Pound',
  'Quart',
  'Tablespoon',
  'Teaspoon',
];

const UNIT_DEFINITIONS = {
  each: { label: 'Each', family: 'count', factor: 1 },
  ea: { label: 'Each', family: 'count', factor: 1 },
  count: { label: 'Count', family: 'count', factor: 1 },
  bottle: { label: 'Bottle', family: 'count', factor: 1 },
  bottles: { label: 'Bottle', family: 'count', factor: 1 },
  can: { label: 'Can', family: 'count', factor: 1 },
  cans: { label: 'Can', family: 'count', factor: 1 },
  case: { label: 'Case', family: 'package', factor: 1 },
  cs: { label: 'Case', family: 'package', factor: 1 },
  box: { label: 'Box', family: 'package', factor: 1 },
  bag: { label: 'Bag', family: 'package', factor: 1 },
  pack: { label: 'Pack', family: 'package', factor: 1 },
  lb: { label: 'Pound', family: 'weight', factor: 453.59237 },
  lbs: { label: 'Pound', family: 'weight', factor: 453.59237 },
  pound: { label: 'Pound', family: 'weight', factor: 453.59237 },
  pounds: { label: 'Pound', family: 'weight', factor: 453.59237 },
  oz: { label: 'Ounce', family: 'weight', factor: 28.349523125 },
  ounce: { label: 'Ounce', family: 'weight', factor: 28.349523125 },
  ounces: { label: 'Ounce', family: 'weight', factor: 28.349523125 },
  kg: { label: 'Kilogram', family: 'weight', factor: 1000 },
  kilogram: { label: 'Kilogram', family: 'weight', factor: 1000 },
  kilograms: { label: 'Kilogram', family: 'weight', factor: 1000 },
  g: { label: 'Gram', family: 'weight', factor: 1 },
  gram: { label: 'Gram', family: 'weight', factor: 1 },
  grams: { label: 'Gram', family: 'weight', factor: 1 },
  gal: { label: 'Gallon', family: 'volume', factor: 3785.411784 },
  gallon: { label: 'Gallon', family: 'volume', factor: 3785.411784 },
  gallons: { label: 'Gallon', family: 'volume', factor: 3785.411784 },
  qt: { label: 'Quart', family: 'volume', factor: 946.352946 },
  quart: { label: 'Quart', family: 'volume', factor: 946.352946 },
  quarts: { label: 'Quart', family: 'volume', factor: 946.352946 },
  l: { label: 'Liter', family: 'volume', factor: 1000 },
  liter: { label: 'Liter', family: 'volume', factor: 1000 },
  litre: { label: 'Liter', family: 'volume', factor: 1000 },
  liters: { label: 'Liter', family: 'volume', factor: 1000 },
  litres: { label: 'Liter', family: 'volume', factor: 1000 },
  ml: { label: 'Milliliter', family: 'volume', factor: 1 },
  milliliter: { label: 'Milliliter', family: 'volume', factor: 1 },
  millilitre: { label: 'Milliliter', family: 'volume', factor: 1 },
  milliliters: { label: 'Milliliter', family: 'volume', factor: 1 },
  millilitres: { label: 'Milliliter', family: 'volume', factor: 1 },
  floz: { label: 'Fluid Ounce', family: 'volume', factor: 29.5735295625 },
  'fl oz': { label: 'Fluid Ounce', family: 'volume', factor: 29.5735295625 },
  'fluid ounce': { label: 'Fluid Ounce', family: 'volume', factor: 29.5735295625 },
  'fluid ounces': { label: 'Fluid Ounce', family: 'volume', factor: 29.5735295625 },
};

function normalizeUnitKey(unit) {
  return String(unit || '')
    .trim()
    .toLowerCase()
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeProductUnit(unit) {
  return UNIT_DEFINITIONS[normalizeUnitKey(unit)]?.label || String(unit || '').trim() || 'Each';
}

export function getProductUnitDefinition(unit) {
  return UNIT_DEFINITIONS[normalizeUnitKey(unit)] || {
    label: normalizeProductUnit(unit),
    family: 'custom',
    factor: 1,
  };
}

export function parsePackageContents(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  const candidates = [];
  const parenthetical = text.match(/\(([^)]+)\)/);
  if (parenthetical?.[1]) candidates.push(parenthetical[1]);
  candidates.push(text);

  for (const candidate of candidates) {
    const slashPack = candidate.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([a-zA-Z ]+)/);
    if (slashPack) {
      const quantity = Number(slashPack[1]) * Number(slashPack[2]);
      const unit = normalizeProductUnit(slashPack[3]);
      if (quantity > 0) return { quantity, unit };
    }

    const simple = candidate.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z ]+)/);
    if (simple) {
      const quantity = Number(simple[1]);
      const unit = normalizeProductUnit(simple[2]);
      if (quantity > 0) return { quantity, unit };
    }
  }

  return null;
}

export function calculateConvertedInventoryUnit({ sourcePrice, sourceQuantity, sourceUnit, targetQuantity, targetUnit }) {
  const price = Number(sourcePrice || 0);
  const sourceQty = Number(sourceQuantity || 0);
  const targetQty = Number(targetQuantity || 0);
  if (!Number.isFinite(price) || !Number.isFinite(sourceQty) || !Number.isFinite(targetQty) || sourceQty <= 0 || targetQty <= 0) {
    return { price: 0, canConvert: false, reason: 'Enter a valid source price, source quantity, and target quantity.' };
  }

  const source = getProductUnitDefinition(sourceUnit);
  const target = getProductUnitDefinition(targetUnit);
  const sameUnit = source.label.toLowerCase() === target.label.toLowerCase();
  if (sameUnit || (source.family === 'package' && target.family === 'package')) {
    return { price: price * (targetQty / sourceQty), canConvert: true, mode: 'package' };
  }

  if (source.family === target.family && ['weight', 'volume', 'count'].includes(source.family)) {
    const sourceBase = sourceQty * source.factor;
    const targetBase = targetQty * target.factor;
    return { price: price * (targetBase / sourceBase), canConvert: true, mode: source.family };
  }

  return {
    price: 0,
    canConvert: false,
    reason: `Cannot convert ${source.label} to ${target.label} without a package size or density.`,
  };
}

export function calculateConvertedUnitPrice(price, quantity) {
  const numericPrice = Number(price || 0);
  const numericQuantity = Number(quantity || 0);
  if (!Number.isFinite(numericPrice) || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return 0;
  }
  return numericPrice / numericQuantity;
}
