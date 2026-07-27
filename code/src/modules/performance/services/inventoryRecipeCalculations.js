import { finiteOrNull, normalizedCategoryKey } from '@/modules/performance/services/overviewBudgetCalculations';

function firstFinite(...values) {
  for (const value of values) {
    const parsed = finiteOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function getCountPairStatus(row = {}) {
  const opening = finiteOrNull(row.openingQuantity);
  const closing = finiteOrNull(row.closingQuantity);
  if (opening !== null && closing !== null) return 'complete';
  if (opening !== null) return 'opening_only';
  if (closing !== null) return 'closing_only';
  return 'neither';
}

export function getReorderStatus(row = {}) {
  const onHand = firstFinite(row.currentOnHandQuantity, row.currentQuantity, row.onHandQuantity);
  const reorderPoint = finiteOrNull(row.reorderPoint ?? row.reorder_point);
  if (onHand === null) return { status: 'on_hand_unavailable', onHand, reorderPoint, shortage: null };
  if (reorderPoint === null || reorderPoint <= 0) {
    return {
      status: 'reorder_point_unavailable',
      onHand,
      reorderPoint: null,
      shortage: null,
    };
  }
  if (onHand < reorderPoint) return { status: 'below', onHand, reorderPoint, shortage: reorderPoint - onHand };
  if (onHand === reorderPoint) return { status: 'at', onHand, reorderPoint, shortage: 0 };
  return { status: 'above', onHand, reorderPoint, shortage: 0 };
}

export function prepareInventoryUsageRows(rows = []) {
  return rows.map((row) => {
    const openingQuantity = finiteOrNull(row.openingQuantity);
    const closingQuantity = finiteOrNull(row.closingQuantity);
    const receivedQuantity = finiteOrNull(row.receivedQuantity);
    const transfersIn = finiteOrNull(row.transfersIn);
    const transfersOut = finiteOrNull(row.transfersOut);
    const adjustmentQuantity = finiteOrNull(row.adjustmentQuantity);
    const countPairStatus = getCountPairStatus(row);
    const inputsComplete = [
      openingQuantity,
      closingQuantity,
      receivedQuantity,
      transfersIn,
      transfersOut,
      adjustmentQuantity,
    ].every((value) => value !== null);
    const calculatedUsage = inputsComplete
      ? openingQuantity + receivedQuantity + transfersIn - transfersOut + adjustmentQuantity - closingQuantity
      : null;
    const unitCost = finiteOrNull(row.unitCost);
    const usageValue = calculatedUsage !== null && unitCost !== null
      ? calculatedUsage * unitCost
      : null;
    const reorder = getReorderStatus(row);
    return {
      ...row,
      openingQuantity,
      closingQuantity,
      receivedQuantity,
      transfersIn,
      transfersOut,
      adjustmentQuantity,
      calculatedUsage,
      actualUsage: calculatedUsage,
      unitCost,
      unitCostSource: row.unitCostSource || 'unavailable',
      usageValue,
      countPairStatus,
      currentOnHandQuantity: reorder.onHand,
      reorderPoint: reorder.reorderPoint,
      reorderStatus: reorder.status,
      shortageQuantity: reorder.shortage,
      currentInventoryValue: finiteOrNull(row.currentInventoryValue),
      currentInventoryValueSource: row.currentInventoryValueSource || 'unavailable',
      dataStatus:
        countPairStatus !== 'complete'
          ? countPairStatus
          : !inputsComplete
            ? 'movement_inputs_incomplete'
            : unitCost === null
              ? 'usage_calculable_value_unavailable'
              : 'complete',
    };
  }).sort((a, b) => {
    if (a.usageValue !== null && b.usageValue !== null) return b.usageValue - a.usageValue;
    if (a.usageValue !== null) return -1;
    if (b.usageValue !== null) return 1;
    if (a.calculatedUsage !== null && b.calculatedUsage !== null) return b.calculatedUsage - a.calculatedUsage;
    if (a.calculatedUsage !== null) return -1;
    if (b.calculatedUsage !== null) return 1;
    return String(a.product || '').localeCompare(String(b.product || ''));
  });
}

export function summarizeInventoryCoverage(rows = []) {
  const prepared = prepareInventoryUsageRows(rows);
  const completeCountPairs = prepared.filter((row) => row.countPairStatus === 'complete').length;
  const calculableUsage = prepared.filter((row) => row.calculatedUsage !== null).length;
  const valuedUsage = prepared.filter((row) => row.usageValue !== null).length;
  const valuedOnHand = prepared.filter(
    (row) => row.currentOnHandQuantity !== null && row.unitCost !== null
  ).length;
  return {
    totalProducts: prepared.length,
    completeCountPairs,
    calculableUsage,
    valuedUsage,
    valuedOnHand,
    countCoverage: prepared.length ? (completeCountPairs / prepared.length) * 100 : null,
    usageCoverage: prepared.length ? (calculableUsage / prepared.length) * 100 : null,
    valueCoverage: prepared.length ? (valuedOnHand / prepared.length) * 100 : null,
    partial: prepared.length > 0 && calculableUsage < prepared.length,
  };
}

export function findDuplicateLookingProducts(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const label = String(row.product || '').trim();
    if (!label) continue;
    const key = normalizedCategoryKey(label);
    const labels = groups.get(key) || new Set();
    labels.add(label);
    groups.set(key, labels);
  }
  return [...groups.values()].filter((labels) => labels.size > 1).map((labels) => [...labels].sort());
}

function ingredientCostAvailable(ingredient = {}) {
  return firstFinite(
    ingredient.total_cost,
    ingredient.unit_cost_snapshot,
    ingredient.unit_cost,
    ingredient.cost
  ) !== null;
}

export function mergeRecipeAnalyticsEvidence({
  recipes = [],
  ingredients = [],
  locationPrices = [],
  visibility = [],
  locationId,
} = {}) {
  if (!locationId) return [];

  const ingredientsByRecipe = new Map();
  for (const ingredient of ingredients) {
    if (!ingredient?.recipe_id) continue;
    const rows = ingredientsByRecipe.get(ingredient.recipe_id) || [];
    rows.push(ingredient);
    ingredientsByRecipe.set(ingredient.recipe_id, rows);
  }

  const pricesByRecipe = new Map();
  for (const price of locationPrices) {
    if (price?.recipe_id && price.location_id === locationId) {
      pricesByRecipe.set(price.recipe_id, price);
    }
  }

  const visibleLocationsByRecipe = new Map();
  for (const row of visibility) {
    if (!row?.recipe_id || !row.location_id) continue;
    const ids = visibleLocationsByRecipe.get(row.recipe_id) || new Set();
    ids.add(row.location_id);
    visibleLocationsByRecipe.set(row.recipe_id, ids);
  }

  return recipes
    .filter((recipe) => {
      if (recipe.location_id) return recipe.location_id === locationId;
      const explicitLocations = visibleLocationsByRecipe.get(recipe.id);
      return !explicitLocations || explicitLocations.has(locationId);
    })
    .map((recipe) => {
      const normalizedIngredients = ingredientsByRecipe.get(recipe.id);
      const locationPrice = pricesByRecipe.get(recipe.id);
      return {
        ...recipe,
        ingredients:
          normalizedIngredients?.length
            ? normalizedIngredients
            : Array.isArray(recipe.ingredients)
              ? recipe.ingredients
              : [],
        selling_price:
          locationPrice && finiteOrNull(locationPrice.price) !== null
            ? locationPrice.price
            : recipe.selling_price,
        sellingPriceSource: locationPrice
          ? 'recipe_location_prices.price'
          : finiteOrNull(recipe.selling_price) !== null
            ? 'recipes.selling_price'
            : 'unavailable',
      };
    });
}

export function prepareRecipeRows(recipes = []) {
  return recipes.map((recipe) => {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : null;
    const ingredientCount = ingredients ? ingredients.length : null;
    const pricedIngredientCount = ingredients
      ? ingredients.filter(ingredientCostAvailable).length
      : null;
    const storedCost = firstFinite(
      recipe.cost_per_serving,
      recipe.total_cost,
      recipe.recipe_cost,
      recipe.food_cost
    );
    const costingStatus =
      !ingredients || ingredients.length === 0
        ? 'no_ingredient_costs'
        : storedCost === null
            ? 'partially_costed'
            : pricedIngredientCount < ingredientCount
              ? 'stored_cost_only'
              : 'fully_costed';
    const ingredientCost = storedCost;
    const sellingPrice = firstFinite(
      recipe.selling_price,
      recipe.suggested_price,
      recipe.menu_price,
      recipe.price
    );
    const pricingStatus = sellingPrice === null
      ? 'missing'
      : sellingPrice === 0
        ? 'zero'
        : 'available';
    const targetMargin = firstFinite(recipe.target_margin_percent, recipe.target_margin);
    const calculable = ingredientCost !== null && sellingPrice !== null && sellingPrice > 0;
    const grossProfit = calculable ? sellingPrice - ingredientCost : null;
    const grossMargin = calculable ? (grossProfit / sellingPrice) * 100 : null;
    const marginVariance = grossMargin !== null && targetMargin !== null
      ? grossMargin - targetMargin
      : null;
    const belowTarget = marginVariance !== null && marginVariance < 0;
    return {
      ...recipe,
      recipeName: recipe.name || recipe.recipe_name || recipe.menu_item_name || recipe.title || 'Recipe',
      sellingPrice,
      sellingPriceSource: recipe.sellingPriceSource || (
        sellingPrice === null ? 'unavailable' : 'recipes.selling_price'
      ),
      ingredientCost,
      grossProfit,
      grossMargin,
      targetMargin,
      marginVariance,
      ingredientCount,
      pricedIngredientCount,
      costingStatus,
      pricingStatus,
      calculable,
      belowTarget,
      dataConfidence:
        !calculable
          ? 'incomplete'
          : costingStatus === 'fully_costed'
            ? 'complete'
            : 'stored_recipe_cost',
    };
  }).sort((a, b) => {
    if (a.belowTarget !== b.belowTarget) return a.belowTarget ? -1 : 1;
    if (a.belowTarget && b.belowTarget) return a.marginVariance - b.marginVariance;
    if (a.calculable !== b.calculable) return a.calculable ? -1 : 1;
    return a.recipeName.localeCompare(b.recipeName);
  });
}

export function summarizeRecipeCoverage(recipes = []) {
  const rows = prepareRecipeRows(recipes);
  const calculableRows = rows.filter((row) => row.calculable);
  const fullyCosted = rows.filter((row) => row.costingStatus === 'fully_costed').length;
  const storedCostOnly = rows.filter((row) => row.costingStatus === 'stored_cost_only').length;
  const priced = rows.filter((row) => row.pricingStatus === 'available').length;
  const belowTargetRows = calculableRows.filter((row) => row.belowTarget);
  const margins = calculableRows.map((row) => row.grossMargin).sort((a, b) => a - b);
  const middle = Math.floor(margins.length / 2);
  const medianMargin = margins.length
    ? margins.length % 2
      ? margins[middle]
      : (margins[middle - 1] + margins[middle]) / 2
    : null;
  return {
    rows,
    calculableRows,
    belowTargetRows,
    totalCount: rows.length,
    calculableCount: calculableRows.length,
    fullyCostedCount: fullyCosted,
    storedCostOnlyCount: storedCostOnly,
    pricedCount: priced,
    missingPriceCount: rows.length - priced,
    incompleteCostCount: rows.filter((row) => row.ingredientCost === null).length,
    costingCoverage: rows.length ? (fullyCosted / rows.length) * 100 : null,
    pricingCoverage: rows.length ? (priced / rows.length) * 100 : null,
    marginCoverage: rows.length ? (calculableRows.length / rows.length) * 100 : null,
    medianMargin,
    partial: rows.length > 0 && calculableRows.length < rows.length,
  };
}
