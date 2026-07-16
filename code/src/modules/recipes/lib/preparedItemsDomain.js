import { calculateRecipeCost } from './recipeCosting';

export const isPreparedItem = (recipe) => Boolean(recipe?.is_batch || recipe?.category === 'prepared_item');

export function filterPreparedItems(items, { search = '', type = 'all', status = 'all' } = {}) {
  const needle = search.trim().toLowerCase();
  return (items || []).filter(isPreparedItem).filter((item) => {
    const matchesSearch = !needle || String(item.name || '').toLowerCase().includes(needle);
    const matchesType = type === 'all' || item.recipe_type_id === type;
    const matchesStatus = status === 'all' || item.status === status;
    return matchesSearch && matchesType && matchesStatus;
  });
}

export function wouldCreatePreparedItemCycle(recipeId, childId, items) {
  if (!recipeId || !childId) return false;
  if (recipeId === childId) return true;
  const byId = new Map((items || []).map((item) => [item.id, item]));
  const stack = [childId];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === recipeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const recipe = byId.get(current);
    for (const ingredient of recipe?.ingredients || []) {
      if (ingredient.sub_recipe_id) stack.push(ingredient.sub_recipe_id);
    }
  }
  return false;
}

export function calculatePreparedItemCosts({ ingredients, primaryYield, conversions = [] }) {
  const result = calculateRecipeCost({
    ingredients: ingredients || [],
    yieldQuantity: Number(primaryYield?.quantity || 0),
    yieldPercentage: 100,
    conversions,
  });
  return { batchCost: result.totalCost, costPerYieldUnit: result.costPerYieldUnit, ...result };
}

export function validatePreparedItem(form, allPreparedItems = []) {
  const errors = [];
  if (!String(form.name || '').trim()) errors.push('Name is required.');
  const yields = (form.yields || []).filter((row) => Number(row.quantity) > 0 && String(row.unit || '').trim());
  if (!yields.length) errors.push('At least one valid yield is required.');
  if (yields.filter((row) => row.is_primary).length !== 1) errors.push('Select exactly one primary yield.');
  if (new Set(yields.map((row) => row.unit.trim().toLowerCase())).size !== yields.length) errors.push('Yield units must be unique.');
  if (form.visibilityMode === 'selected' && !(form.visibleLocationIds || []).length) errors.push('Select at least one location.');
  if ((form.steps || []).some((step) => !String(step.instruction || '').trim())) errors.push('Preparation steps cannot be blank.');
  for (const ingredient of form.ingredients || []) {
    if (!ingredient.product_id && !ingredient.sub_recipe_id) errors.push('Every ingredient must reference a purchased product or Prepared Item.');
    if (Number(ingredient.quantity) <= 0 || !String(ingredient.unit || '').trim()) errors.push('Every ingredient needs a positive quantity and unit.');
    if (ingredient.missing_conversion) errors.push(`A unit conversion is missing for ${ingredient.product_name || 'an ingredient'}.`);
    if (ingredient.sub_recipe_id && wouldCreatePreparedItemCycle(form.id, ingredient.sub_recipe_id, allPreparedItems)) errors.push('Circular Prepared Item dependencies are not allowed.');
  }
  return [...new Set(errors)];
}

export function preparedItemsCsv(items) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['Name,Type,Status,Primary Yield,Batch Cost,Cost Per Yield', ...(items || []).map((item) => [
    item.name, item.recipe_type_name || item.category, item.status,
    `${item.yield_quantity || 0} ${item.yield_unit || ''}`.trim(), Number(item.total_cost || 0).toFixed(2), Number(item.cost_per_serving || 0).toFixed(2),
  ].map(escape).join(','))].join('\n');
}
