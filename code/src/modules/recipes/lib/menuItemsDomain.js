export function isSellableMenuItem(recipe) {
  return Boolean(recipe)
    && !recipe.deleted_at
    && recipe.is_batch !== true
    && recipe.category !== 'prepared_item';
}

export function deriveMenuItemMetrics(recipe, fallbackTargetPlateCostPercent = 30) {
  const cost = Number(recipe?.cost_per_serving || 0);
  const menuPrice = Number(recipe?.selling_price || 0);
  const netProfit = menuPrice - cost;
  const plateCostPercent = menuPrice > 0 ? (cost / menuPrice) * 100 : null;
  const storedTargetMargin = Number(recipe?.target_margin_percent);
  const targetPlateCostPercent = Number.isFinite(storedTargetMargin)
    ? Math.max(0, Math.min(100, 100 - storedTargetMargin))
    : fallbackTargetPlateCostPercent;
  const mappedIngredientCount = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients.filter((ingredient) => ingredient?.product_id || ingredient?.sub_recipe_id).length
    : 0;

  return {
    ...recipe,
    cost,
    menuPrice,
    netProfit,
    plateCostPercent,
    targetPlateCostPercent,
    mappedIngredientCount,
    inventoryTracking: mappedIngredientCount > 0,
    alertStatus: recipe?.margin_alert_status === 'paused'
      ? 'paused'
      : recipe?.margin_alert_enabled ? 'active' : 'none',
    isAboveTarget: plateCostPercent !== null && plateCostPercent > targetPlateCostPercent,
    alertSeverity: recipe?.margin_alert_enabled && plateCostPercent !== null && plateCostPercent > targetPlateCostPercent ? 'attention' : 'normal',
  };
}

export function filterMenuItems(items, {
  search = '',
  categories = [],
  alertStatuses = [],
  visibility = 'any',
  activeOnly = true,
} = {}) {
  const needle = search.trim().toLowerCase();
  return items.filter((item) => {
    if (activeOnly && item.status !== 'active') return false;
    if (categories.length && !categories.includes(item.category)) return false;
    if (alertStatuses.length && !alertStatuses.includes(item.alertStatus)) return false;
    if (visibility !== 'any' && item.visibilityMode !== visibility) return false;
    if (needle && !String(item.name || '').toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function buildMenuItems(recipes, options = {}) {
  const target = options.targetPlateCostPercent ?? 30;
  return recipes.filter(isSellableMenuItem).map((recipe) => deriveMenuItemMetrics(recipe, target));
}

export function sortMenuItems(items, key = 'name', direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  const valueFor = (item) => {
    if (key === 'inventoryTracking') return item.inventoryTracking ? 1 : 0;
    if (key === 'monitoring') return item.alertStatus || '';
    if (key === 'plateCostPercent') return item.plateCostPercent;
    return item[key];
  };

  return [...items].sort((left, right) => {
    const a = valueFor(left);
    const b = valueFor(right);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * multiplier;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
  });
}
