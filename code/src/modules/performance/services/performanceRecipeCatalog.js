import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { mergeRecipeAnalyticsEvidence } from '@/modules/performance/services/inventoryRecipeCalculations';

const RELATION_BATCH_SIZE = 200;
const RELATION_PAGE_SIZE = 1000;

async function fetchRecipeRelations(table, recipeIds, organizationId) {
  if (!recipeIds.length) return [];
  const rows = [];

  for (let offset = 0; offset < recipeIds.length; offset += RELATION_BATCH_SIZE) {
    const ids = recipeIds.slice(offset, offset + RELATION_BATCH_SIZE);
    for (let page = 0; ; page += 1) {
      const from = page * RELATION_PAGE_SIZE;
      const to = from + RELATION_PAGE_SIZE - 1;
      const { data, error } = await api.client
        .from(table)
        .select('*')
        .eq('organization_id', organizationId)
        .in('recipe_id', ids)
        .range(from, to);
      if (error) throw error;
      const pageRows = data || [];
      rows.push(...pageRows);
      if (pageRows.length < RELATION_PAGE_SIZE) break;
    }
  }

  return rows;
}

export async function fetchLocationRecipeAnalytics({
  organization,
  brand,
  location,
}) {
  if (!organization?.id || !location?.id) {
    throw new Error('Recipe analytics requires one active organization and location.');
  }

  const recipeRows = await api.entities.Recipe.list('-updated_at', { limit: 5000 });
  const scopedRecipes = filterByContext(recipeRows, { organization, brand, location });
  const recipeIds = scopedRecipes.map((recipe) => recipe.id).filter(Boolean);

  const [ingredients, locationPrices, visibility] = await Promise.all([
    fetchRecipeRelations('recipe_ingredients', recipeIds, organization.id),
    fetchRecipeRelations('recipe_location_prices', recipeIds, organization.id),
    fetchRecipeRelations('recipe_location_visibility', recipeIds, organization.id),
  ]);

  return mergeRecipeAnalyticsEvidence({
    recipes: scopedRecipes,
    ingredients,
    locationPrices,
    visibility,
    locationId: location.id,
  });
}

export default fetchLocationRecipeAnalytics;
