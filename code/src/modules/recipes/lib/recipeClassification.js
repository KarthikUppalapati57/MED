export const RECIPE_CLASSIFICATIONS = {
  MENU_ITEM: {
    key: 'menu-item',
    label: 'Menu Item',
    description: 'Finished dish with price, profit, and plate-cost tracking.',
  },
  PREPARED_ITEM: {
    key: 'prepared-item',
    label: 'Prepared Item',
    description: 'Reusable batch or prep component used inside other recipes.',
  },
  BAR_ITEM: {
    key: 'bar-item',
    label: 'Bar Item',
    description: 'Beverage recipe with pour-cost tracking.',
  },
  GENERAL_RECIPE: {
    key: 'general-recipe',
    label: 'General Recipe',
    description: 'Recipe library record for costing, prep, or reference.',
  },
};

export function getBeverageTypeIds(recipeTypes = []) {
  return (recipeTypes || []).filter((row) => row?.kind === 'beverage').map((row) => row.id);
}

export function isActiveRecipeRecord(recipe) {
  return Boolean(recipe) && !recipe.deleted_at;
}

export function filterActiveRecipes(recipes = []) {
  return (recipes || []).filter(isActiveRecipeRecord);
}

export function isPreparedRecipe(recipe) {
  return isActiveRecipeRecord(recipe) && Boolean(recipe?.is_batch || recipe?.category === 'prepared_item');
}

export function isBarRecipe(recipe, beverageTypeIds = []) {
  return !isPreparedRecipe(recipe)
    && isActiveRecipeRecord(recipe)
    && (recipe?.category === 'beverage' || beverageTypeIds.includes(recipe?.recipe_type_id));
}

export function isMenuRecipe(recipe, beverageTypeIds = []) {
  return isActiveRecipeRecord(recipe)
    && !isPreparedRecipe(recipe)
    && !isBarRecipe(recipe, beverageTypeIds)
    && recipe.category !== 'general';
}

export function classifyRecipe(recipe, { recipeTypes = [], beverageTypeIds = null } = {}) {
  const resolvedBeverageTypeIds = beverageTypeIds || getBeverageTypeIds(recipeTypes);
  if (isPreparedRecipe(recipe)) return RECIPE_CLASSIFICATIONS.PREPARED_ITEM;
  if (isBarRecipe(recipe, resolvedBeverageTypeIds)) return RECIPE_CLASSIFICATIONS.BAR_ITEM;
  if (isMenuRecipe(recipe, resolvedBeverageTypeIds)) return RECIPE_CLASSIFICATIONS.MENU_ITEM;
  return RECIPE_CLASSIFICATIONS.GENERAL_RECIPE;
}

export function getRecipeClassificationLabel(recipe, options = {}) {
  return classifyRecipe(recipe, options).label;
}
