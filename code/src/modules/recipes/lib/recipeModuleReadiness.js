import { isBarItem } from './barItemsDomain';
import { isSellableMenuItem } from './menuItemsDomain';
import { isPreparedItem } from './preparedItemsDomain';

export function buildRecipeModuleReadiness({
  recipes = [],
  products = [],
  conversions = [],
  recipeTypes = [],
} = {}) {
  const preparedItems = recipes.filter(isPreparedItem);
  const barItems = recipes.filter((recipe) => isBarItem(recipe, recipeTypes.filter((type) => type.kind === 'beverage').map((type) => type.id)));
  const menuItems = recipes.filter((recipe) => isSellableMenuItem(recipe) && !barItems.some((item) => item.id === recipe.id));
  const pricedMenuItems = menuItems.filter((recipe) => Number(recipe.selling_price || 0) > 0);
  const costedItems = recipes.filter((recipe) => Number(recipe.cost_per_serving || recipe.total_cost || 0) > 0);
  const costedMenuItems = menuItems.filter((recipe) => Number(recipe.cost_per_serving || recipe.total_cost || 0) > 0);

  const steps = [
    {
      key: 'products',
      label: 'Products available',
      description: 'Purchased products provide ingredient prices and cost units.',
      complete: products.length > 0,
      count: products.length,
    },
    {
      key: 'conversions',
      label: 'Unit conversions configured',
      description: 'Conversions connect product purchase units to recipe units.',
      complete: conversions.length > 0,
      count: conversions.length,
    },
    {
      key: 'prepared-items',
      label: 'Prepared items created',
      description: 'Batch components roll sauce, mix, and prep costs into menu items.',
      complete: preparedItems.length > 0,
      count: preparedItems.length,
    },
    {
      key: 'menu-items',
      label: 'Menu items costed',
      description: 'Sellable dishes need ingredients, yields, and live cost per serving.',
      complete: menuItems.length > 0 && costedMenuItems.length === menuItems.length,
      count: costedMenuItems.length,
      total: menuItems.length,
    },
    {
      key: 'prices',
      label: 'Selling prices entered',
      description: 'Prices unlock food-cost %, gross profit, and margin risk.',
      complete: menuItems.length > 0 && pricedMenuItems.length === menuItems.length,
      count: pricedMenuItems.length,
      total: menuItems.length,
    },
    {
      key: 'bar-items',
      label: 'Bar items optional',
      description: 'Use Bar Items for beverages or pour-cost tracking.',
      complete: barItems.length > 0,
      count: barItems.length,
      optional: true,
    },
  ];

  const requiredSteps = steps.filter((step) => !step.optional);
  const completedRequired = requiredSteps.filter((step) => step.complete).length;

  return {
    steps,
    completedRequired,
    requiredTotal: requiredSteps.length,
    percent: requiredSteps.length ? Math.round((completedRequired / requiredSteps.length) * 100) : 0,
    menuItems,
    preparedItems,
    barItems,
    pricedMenuItems,
    costedItems,
    costedMenuItems,
  };
}
