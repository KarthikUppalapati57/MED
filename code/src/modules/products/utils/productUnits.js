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

export function calculateConvertedUnitPrice(price, quantity) {
  const numericPrice = Number(price || 0);
  const numericQuantity = Number(quantity || 0);
  if (!Number.isFinite(numericPrice) || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return 0;
  }
  return numericPrice / numericQuantity;
}
