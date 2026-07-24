export function resolveRecipeEditRoute({
  routeValue,
  isEdit = false,
  recipes = [],
  isLoading = false,
  predicate = () => true,
} = {}) {
  if (routeValue === 'new') return { state: 'new', recipe: null };
  if (!isEdit || !routeValue) return { state: 'none', recipe: null };

  const recipe = (recipes || []).find((row) => row?.id === routeValue && predicate(row));
  if (recipe) return { state: 'edit', recipe };
  return { state: isLoading ? 'loading' : 'not-found', recipe: null };
}
