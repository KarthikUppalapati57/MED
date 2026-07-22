import { normalizeRecipeUnit } from './recipeUnits';

export function findConversionFactor({ fromUnit, toUnit, productId = null, conversions = [] }) {
  const from = normalizeRecipeUnit(fromUnit);
  const to = normalizeRecipeUnit(toUnit);
  if (!from || !to || from === to) return 1;

  const candidates = conversions.filter((conversion) => {
    const appliesToProduct = !conversion.product_id || conversion.product_id === productId;
    return appliesToProduct && conversion.is_active !== false;
  });

  const matchPair = (list, source, target) => list.find(
    (conversion) => normalizeRecipeUnit(conversion.from_unit) === source
      && normalizeRecipeUnit(conversion.to_unit) === target
  );

  // Prefer product-specific rules over org-wide when both exist.
  const productScoped = productId
    ? candidates.filter((conversion) => conversion.product_id === productId)
    : [];
  const orgScoped = candidates.filter((conversion) => !conversion.product_id);

  const direct = matchPair(productScoped, from, to) || matchPair(orgScoped, from, to);
  if (direct) return Number(direct.factor);

  const reverse = matchPair(productScoped, to, from) || matchPair(orgScoped, to, from);
  if (reverse && Number(reverse.factor) !== 0) return 1 / Number(reverse.factor);

  return null;
}

export function calculateIngredientCost(ingredient, conversions = []) {
  const quantity = Number(ingredient.quantity || 0);
  const unitCost = Number(ingredient.unit_cost || 0);
  const yieldPercentage = Number(ingredient.yield_percentage ?? 100);
  const factor = findConversionFactor({
    fromUnit: ingredient.unit,
    toUnit: ingredient.cost_unit || ingredient.unit,
    productId: ingredient.product_id,
    conversions,
  });

  if (factor === null) {
    return { cost: 0, factor: null, missingConversion: true };
  }

  const usableFraction = yieldPercentage > 0 ? yieldPercentage / 100 : 0;
  const adjustedQuantity = usableFraction > 0 ? (quantity * factor) / usableFraction : 0;
  return {
    cost: adjustedQuantity * unitCost,
    factor,
    missingConversion: false,
  };
}

export function calculateRecipeCost({
  ingredients = [],
  packagingItems = [],
  laborMinutes = 0,
  laborRatePerHour = 0,
  yieldQuantity = 1,
  yieldPercentage = 100,
  conversions = [],
}) {
  const ingredientResults = ingredients.map((ingredient) => calculateIngredientCost(ingredient, conversions));
  const ingredientCost = ingredientResults.reduce((sum, result) => sum + result.cost, 0);
  const packagingCost = packagingItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
    0
  );
  const laborCost = (Number(laborMinutes || 0) / 60) * Number(laborRatePerHour || 0);
  const totalCost = ingredientCost + packagingCost + laborCost;
  const effectiveYield = Number(yieldQuantity || 0) * (Number(yieldPercentage || 0) / 100);

  return {
    ingredientCost,
    packagingCost,
    laborCost,
    totalCost,
    costPerYieldUnit: effectiveYield > 0 ? totalCost / effectiveYield : totalCost,
    effectiveYield,
    missingConversions: ingredients
      .filter((_, index) => ingredientResults[index].missingConversion)
      .map((ingredient) => ({
        product_id: ingredient.product_id || null,
        product_name: ingredient.product_name || 'Ingredient',
        from_unit: ingredient.unit || null,
        to_unit: ingredient.cost_unit || null,
        quantity: Number(ingredient.quantity || 0) || null,
      })),
  };
}

export function calculateAlternateYieldCosts(totalCost, yields = []) {
  return yields.map((yieldDefinition) => {
    const quantity = Number(yieldDefinition.quantity || 0);
    return {
      ...yieldDefinition,
      cost_per_unit: quantity > 0 ? Number(totalCost || 0) / quantity : Number(totalCost || 0),
    };
  });
}
