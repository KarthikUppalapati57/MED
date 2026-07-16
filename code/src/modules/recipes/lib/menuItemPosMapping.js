export const normalizeMenuItemName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function menuItemNameScore(recipeName, posItemName) {
  const recipe = normalizeMenuItemName(recipeName);
  const pos = normalizeMenuItemName(posItemName);
  if (!recipe || !pos) return 0;
  if (recipe === pos) return 1;
  const recipeTokens = new Set(recipe.split(' '));
  const posTokens = new Set(pos.split(' '));
  const intersection = [...recipeTokens].filter((token) => posTokens.has(token)).length;
  const union = new Set([...recipeTokens, ...posTokens]).size;
  return union ? intersection / union : 0;
}

export function enrichMenuItemWithPos(item, posItems = [], mappings = []) {
  const mapping = mappings.find((entry) => entry.recipe_id === item.id);
  const mappedPosItem = mapping ? posItems.find((entry) => entry.id === mapping.pos_item_id) : null;
  const mappedPosIds = new Set(mappings.map((entry) => entry.pos_item_id));
  const suggestion = !mapping ? posItems
    .filter((entry) => !mappedPosIds.has(entry.id))
    .map((entry) => ({ item: entry, score: menuItemNameScore(item.name, entry.item_name) }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score)[0] : null;
  const manualPrice = Number(item.selling_price || 0);
  const posPrice = Number(mappedPosItem?.price || 0);
  const menuPrice = manualPrice > 0 ? manualPrice : posPrice;
  const netProfit = menuPrice - item.cost;
  const plateCostPercent = menuPrice > 0 ? (item.cost / menuPrice) * 100 : null;

  return {
    ...item,
    mapping,
    mappedPosItem,
    mappingStatus: mapping ? 'mapped' : suggestion ? 'suggested' : 'unmapped',
    suggestedPosItem: suggestion?.item || null,
    suggestionScore: suggestion?.score || 0,
    menuPrice,
    priceSource: manualPrice > 0 ? 'manual' : posPrice > 0 ? 'pos' : 'missing',
    netProfit,
    plateCostPercent,
    isAboveTarget: plateCostPercent !== null && plateCostPercent > item.targetPlateCostPercent,
    alertSeverity: item.alertStatus === 'active' && plateCostPercent !== null && plateCostPercent > item.targetPlateCostPercent ? 'attention' : 'normal',
  };
}
