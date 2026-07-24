import { calculateRecipeCost } from './recipeCosting';

export const BEVERAGE_TYPE_NAMES = ['Cocktail', 'Beer', 'Wine', 'Spirit Pour', 'Non-Alcoholic Beverage', 'Other'];

export function isBarItem(recipe, beverageTypeIds = []) {
  return Boolean(recipe)
    && !recipe.deleted_at
    && !recipe.is_batch
    && (beverageTypeIds.includes(recipe.recipe_type_id) || recipe.category === 'beverage');
}

export function calculateBarItemCosts({ ingredients = [], primaryYield, sellingPrice, conversions = [] }) {
  const result = calculateRecipeCost({ ingredients, yieldQuantity: Number(primaryYield?.quantity || 0), yieldPercentage: 100, conversions });
  const price = Number(sellingPrice || 0);
  return {
    ...result,
    pourCostPercent: price > 0 ? result.costPerYieldUnit / price * 100 : null,
    grossProfit: price > 0 ? price - result.costPerYieldUnit : null,
  };
}

export function filterBarItems(items, { search = '', type = 'all', alert = 'all', status = 'active' } = {}, beverageTypeIds = []) {
  const needle = search.trim().toLowerCase();
  return (items || []).filter((item) => isBarItem(item, beverageTypeIds)).filter((item) => {
    const alertStatus = item.margin_alert_status || (item.margin_alert_enabled ? 'active' : 'none');
    return (!needle || String(item.name || '').toLowerCase().includes(needle))
      && (type === 'all' || item.recipe_type_id === type)
      && (alert === 'all' || alertStatus === alert)
      && (status === 'all' || item.status === status);
  });
}

export function validateBarItem(form) {
  const errors = [];
  if (!String(form.name || '').trim()) errors.push('Name is required.');
  const validYields = (form.yields || []).filter((row) => Number(row.quantity) > 0 && String(row.unit || '').trim());
  if (!validYields.length) errors.push('At least one positive yield is required.');
  if (validYields.filter((row) => row.is_primary).length !== 1) errors.push('Select exactly one primary yield.');
  if (form.visibilityMode === 'selected' && !(form.visibleLocationIds || []).length) errors.push('Select at least one visible location.');
  if ((form.ingredients || []).some((row) => !row.product_id && !row.sub_recipe_id)) errors.push('Match every ingredient before saving.');
  if ((form.ingredients || []).some((row) => Number(row.quantity) <= 0 || !String(row.unit || '').trim())) errors.push('Every ingredient needs a positive quantity and unit.');
  if ((form.ingredients || []).some((row) => row.missing_conversion)) errors.push('Resolve all missing unit conversions before saving.');
  if ((form.steps || []).some((row) => !String(row.instruction || '').trim())) errors.push('Preparation steps cannot be blank.');
  if (Number(form.globalPrice || 0) < 0) errors.push('Selling price cannot be negative.');
  return [...new Set(errors)];
}

export function barItemsCsv(items, typeMap = new Map()) {
  const q = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['Name,Type,Status,Cost Per Serving,Selling Price,Pour Cost %,Gross Profit,Alert Status', ...(items || []).map((item) => {
    const price = Number(item.selling_price || 0); const cost = Number(item.cost_per_serving || 0);
    return [item.name, typeMap.get(item.recipe_type_id) || 'Other', item.status, cost.toFixed(2), price.toFixed(2), price > 0 ? (cost / price * 100).toFixed(2) : '', price > 0 ? (price - cost).toFixed(2) : '', item.margin_alert_status || 'none'].map(q).join(',');
  })].join('\n');
}
