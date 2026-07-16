import { calculateIngredientCost, calculateRecipeCost } from './recipeCosting';

const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

export function parseIngredientQuantity(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (FRACTIONS[text] != null) return FRACTIONS[text];
  if (/^\d+\/\d+$/.test(text)) {
    const [top, bottom] = text.split('/').map(Number);
    return bottom ? top / bottom : 0;
  }
  if (/^\d+[¼½¾⅓⅔]$/.test(text)) return Number(text[0]) + FRACTIONS[text.slice(1)];
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

export function parseIngredientText(text, catalog = []) {
  const normalizedCatalog = catalog.map((item) => ({
    ...item,
    normalizedName: String(item.name || '').trim().toLowerCase(),
  }));
  return String(text || '').split(/\r?\n|,\s*/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const match = line.match(/^([\d./¼½¾⅓⅔]+)\s*([a-zA-Z]+)?\s+(.+)$/);
    const quantity = parseIngredientQuantity(match?.[1]) || 1;
    const unit = match?.[2] || 'each';
    const rawName = String(match ? match[3] : line).replace(/^[-–—]\s*/, '').trim();
    const normalized = rawName.toLowerCase();
    const exact = normalizedCatalog.find((item) => item.normalizedName === normalized);
    const contains = exact || normalizedCatalog.find((item) => normalized.includes(item.normalizedName) || item.normalizedName.includes(normalized));
    const item = contains || null;
    return {
      import_id: `import-${index}`,
      product_id: item?.kind === 'product' ? item.id : null,
      sub_recipe_id: item?.kind === 'prepared' ? item.id : null,
      product_name: item?.name || rawName,
      quantity,
      unit,
      cost_unit: item?.cost_unit || unit,
      unit_cost: Number(item?.unit_cost || 0),
      yield_percentage: 100,
      notes: item ? '' : 'Review: no catalog match found',
      needs_review: !item,
    };
  });
}

export function recalculateAuthoringIngredient(ingredient, conversions = []) {
  const result = calculateIngredientCost(ingredient, conversions);
  return { ...ingredient, total_cost: result.cost, missing_conversion: result.missingConversion };
}

export function calculateMenuItemAuthoringCosts({ ingredients, primaryYield, globalPrice, conversions = [] }) {
  const result = calculateRecipeCost({
    ingredients,
    yieldQuantity: Number(primaryYield?.quantity || 0),
    yieldPercentage: 100,
    conversions,
  });
  const price = Number(globalPrice || 0);
  return {
    ...result,
    netProfit: price - result.costPerYieldUnit,
    plateCostPercent: price > 0 ? (result.costPerYieldUnit / price) * 100 : null,
  };
}

export function validateMenuItemAuthoring(form) {
  const errors = [];
  if (!String(form.name || '').trim()) errors.push('Name is required.');
  const validYields = (form.yields || []).filter((row) => Number(row.quantity) > 0 && String(row.unit || '').trim());
  if (!validYields.length) errors.push('At least one valid yield is required.');
  const duplicateUnits = new Set();
  const seenUnits = new Set();
  validYields.forEach((row) => {
    const unit = String(row.unit).trim().toLowerCase();
    if (seenUnits.has(unit)) duplicateUnits.add(unit);
    seenUnits.add(unit);
  });
  if (duplicateUnits.size) errors.push('Yield units must be unique.');
  if (form.visibilityMode === 'selected' && !(form.visibleLocationIds || []).length) errors.push('Select at least one visible location.');
  if ((form.steps || []).some((step) => !String(step.instruction || '').trim())) errors.push('Preparation steps cannot be blank.');
  if ((form.ingredients || []).some((ingredient) => !ingredient.product_id && !ingredient.sub_recipe_id)) errors.push('Review and match every imported ingredient before saving.');
  if ((form.ingredients || []).some((ingredient) => Number(ingredient.quantity) <= 0 || !String(ingredient.unit || '').trim())) errors.push('Each ingredient needs a positive quantity and unit.');
  if (Number(form.globalPrice || 0) < 0) errors.push('Global menu price cannot be negative.');
  if ((form.locationPrices || []).some((row) => !row.location_id || Number(row.price) < 0)) errors.push('Location prices must be valid non-negative amounts.');
  return errors;
}
