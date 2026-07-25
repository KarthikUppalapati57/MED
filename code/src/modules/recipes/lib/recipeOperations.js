import { isBarItem } from './barItemsDomain';
import { isSellableMenuItem } from './menuItemsDomain';
import { isPreparedItem } from './preparedItemsDomain';

export function buildRecipeOperationsOverview({
  recipes = [],
  products = [],
  conversions = [],
  recipeTypes = [],
  recipeCategories = [],
} = {}) {
  const beverageTypeIds = recipeTypes
    .filter((type) => type.kind === 'beverage')
    .map((type) => type.id);
  const preparedItems = recipes.filter(isPreparedItem);
  const barItems = recipes.filter((recipe) => isBarItem(recipe, beverageTypeIds));
  const menuItems = recipes.filter(
    (recipe) => isSellableMenuItem(recipe) && !barItems.some((item) => item.id === recipe.id),
  );
  const pricedMenuItems = menuItems.filter((recipe) => Number(recipe.selling_price || 0) > 0);
  const costedRecipes = recipes.filter((recipe) => Number(recipe.cost_per_serving || recipe.total_cost || 0) > 0);
  const marginAlerts = recipes.filter((recipe) => recipe.margin_alert_enabled !== false);
  const invoicePricedProducts = products.filter((product) => Number(product.latest_price || 0) > 0);
  const nutritionReadyRecipes = recipes.filter(
    (recipe) => (recipe.ingredients || []).length > 0 && Number(recipe.yield_quantity || 0) > 0,
  );

  return {
    summary: {
      totalRecipes: recipes.length,
      menuItems: menuItems.length,
      preparedItems: preparedItems.length,
      barItems: barItems.length,
      costedRecipes: costedRecipes.length,
      pricedMenuItems: pricedMenuItems.length,
      products: products.length,
      invoicePricedProducts: invoicePricedProducts.length,
      conversions: conversions.length,
      categories: recipeCategories.length,
      nutritionReadyRecipes: nutritionReadyRecipes.length,
      marginAlerts: marginAlerts.length,
    },
    tools: [
      {
        key: 'recipe-book',
        title: 'Recipe Book',
        description: 'Centralized recipes, ingredients, instructions, batch yields, categories, and menu knowledge.',
        status: recipes.length > 0 ? 'live' : 'setup',
        metric: recipes.length,
        metricLabel: 'recipes',
        route: 'recipes',
      },
      {
        key: 'food-costing',
        title: 'Food Costing',
        description: 'Recipe cost rollups from ingredient prices, yields, labor, packaging, conversion rules, and menu pricing.',
        status: costedRecipes.length > 0 ? 'live' : 'setup',
        metric: costedRecipes.length,
        metricLabel: 'costed',
        route: 'menu-items',
      },
      {
        key: 'invoice-price-sync',
        title: 'Invoice Price Sync',
        description: 'Ingredient price updates from invoices feed recipe and inventory costs through the product catalog.',
        status: invoicePricedProducts.length > 0 ? 'connected' : 'setup',
        metric: invoicePricedProducts.length,
        metricLabel: 'priced products',
        route: 'products',
      },
      {
        key: 'inventory',
        title: 'Inventory Integration',
        description: 'Products and prepared recipes are ready to support counts, variance reporting, and recipe-aware inventory.',
        status: products.length > 0 ? 'connected' : 'setup',
        metric: products.length,
        metricLabel: 'products',
        route: 'inventory',
      },
      {
        key: 'prep-production',
        title: 'Prep & Production',
        description: 'Prepared items and recipe instructions support food prep lists, batch planning, and consistent execution.',
        status: preparedItems.length > 0 ? 'live' : 'setup',
        metric: preparedItems.length,
        metricLabel: 'prep items',
        route: 'prepared-items',
      },
      {
        key: 'task-checklists',
        title: 'Task Lists & Checklists',
        description: 'Recipe-backed prep work, line checks, opening and closing lists, SOPs, audits, and onboarding workflows.',
        status: preparedItems.length || menuItems.length ? 'ready' : 'setup',
        metric: preparedItems.length + menuItems.length,
        metricLabel: 'recipe sources',
        route: 'smartprep',
      },
      {
        key: 'nutrition-labels',
        title: 'Nutrition Labels',
        description: 'Recipe ingredients and yields are structured for nutrition mapping, allergen details, and printable labels.',
        status: nutritionReadyRecipes.length > 0 ? 'ready' : 'setup',
        metric: nutritionReadyRecipes.length,
        metricLabel: 'ready',
        route: 'recipes',
      },
      {
        key: 'training',
        title: 'Team Training',
        description: 'Instructions, categories, recipe cards, and menu context give BOH and FOH a shared operating source.',
        status: recipes.length > 0 ? 'ready' : 'setup',
        metric: recipeCategories.length,
        metricLabel: 'categories',
        route: 'setup',
      },
      {
        key: 'purchasing',
        title: 'Purchasing',
        description: 'Ingredient catalog and vendor-priced products support purveyor catalogs and ordering workflows.',
        status: products.length > 0 ? 'connected' : 'setup',
        metric: products.length,
        metricLabel: 'catalog items',
        route: 'orders',
      },
      {
        key: 'analytics',
        title: 'Analytics & Reporting',
        description: 'Menu profitability, ingredient costs, margin alerts, recipe readiness, and variance-ready reports.',
        status: pricedMenuItems.length > 0 ? 'live' : 'setup',
        metric: marginAlerts.length,
        metricLabel: 'alerts on',
        route: 'menu-analysis',
      },
    ],
  };
}
