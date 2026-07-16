import React from 'react';
import { ArrowLeft, ChefHat, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function MenuItemDetailPage({ recipeId, locations = [] }) {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const { data, isLoading, error } = useAuthQuery({
    queryKey: ['menu-item-detail', organization?.id, recipeId],
    queryFn: async () => {
      const recipe = await api.entities.Recipe.get(recipeId);
      if (recipe.organization_id !== organization?.id) throw new Error('Menu Item not found in this organization.');
      const safe = async (client, conditions, options = {}) => {
        try { return await client.filter(conditions, options); }
        catch (fetchError) {
          if (fetchError?.code === 'PGRST205' || String(fetchError?.message || '').includes('schema cache')) return [];
          throw fetchError;
        }
      };
      const [yields, steps, assignments, equipment, locationPrices, visibility] = await Promise.all([
        safe(api.entities.RecipeYield, { recipe_id: recipeId }, { orderBy: '-is_primary', limit: 100 }),
        safe(api.entities.RecipePreparationStep, { recipe_id: recipeId }, { orderBy: 'step_number', limit: 100 }),
        safe(api.entities.RecipeEquipmentAssignment, { recipe_id: recipeId }, { limit: 100 }),
        safe(api.entities.RecipeEquipmentCatalog, { organization_id: organization.id }, { orderBy: 'name', limit: 1000 }),
        safe(api.entities.RecipeLocationPrice, { recipe_id: recipeId }, { limit: 1000 }),
        safe(api.entities.RecipeLocationVisibility, { recipe_id: recipeId }, { limit: 1000 }),
      ]);
      const equipmentById = new Map(equipment.map((item) => [item.id, item]));
      return { recipe, yields, steps, equipmentNames: assignments.map((item) => equipmentById.get(item.equipment_id)?.name).filter(Boolean), locationPrices, visibility };
    },
    enabled: Boolean(organization?.id && recipeId),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (error || !data?.recipe) return <Alert variant="destructive"><AlertTitle>Unable to open Menu Item</AlertTitle><AlertDescription>{error?.message || 'Menu Item not found.'}</AlertDescription></Alert>;

  const { recipe, yields, steps, equipmentNames, locationPrices, visibility } = data;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const plateCost = Number(recipe.selling_price || 0) > 0 ? Number(recipe.cost_per_serving || 0) / Number(recipe.selling_price) * 100 : null;
  const selectedLocations = visibility.filter((row) => row.location_id && row.is_visible).map((row) => locations.find((entry) => entry.id === row.location_id)?.name).filter(Boolean);

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <div><Button variant="ghost" className="mb-2 px-0" onClick={() => navigate('/Recipes/menu-items')}><ArrowLeft className="mr-2 h-4 w-4" /> Menu Items</Button><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h1 className="text-3xl font-semibold">{recipe.name}</h1><Badge variant={recipe.status === 'active' ? 'default' : 'secondary'} className="capitalize">{recipe.status}</Badge></div><p className="mt-1 text-muted-foreground">{recipe.description || 'No description provided.'}</p></div><Badge variant="outline" className="capitalize">{String(recipe.category || 'other').replaceAll('_', ' ')}</Badge></div></div>

    <div className="grid gap-3 sm:grid-cols-4">{[
      ['Unit cost', money.format(Number(recipe.cost_per_serving || 0))],
      ['Menu price', money.format(Number(recipe.selling_price || 0))],
      ['Unit profit', money.format(Number(recipe.selling_price || 0) - Number(recipe.cost_per_serving || 0))],
      ['Plate cost', plateCost == null ? 'Price required' : `${plateCost.toFixed(1)}%`],
    ].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>)}</div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Yields</CardTitle></CardHeader><CardContent className="space-y-2">{yields.length ? yields.map((row) => <div className="flex justify-between rounded-md border p-3" key={row.id}><span>{Number(row.quantity)} {row.unit}</span><span className="flex items-center gap-2">{money.format(Number(row.cost_per_unit || 0))}<Badge variant={row.is_primary ? 'default' : 'outline'}>{row.is_primary ? 'Primary' : 'Alternate'}</Badge></span></div>) : <p className="text-sm text-muted-foreground">No normalized yields found.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Availability</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">{selectedLocations.length ? selectedLocations.join(', ') : 'All locations'}</p>{locationPrices.length > 0 && <div className="space-y-2">{locationPrices.map((row) => <div key={row.id} className="flex justify-between rounded-md border p-3 text-sm"><span>{locations.find((entry) => entry.id === row.location_id)?.name || 'Location'}</span><span>{money.format(Number(row.price))}</span></div>)}</div>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Ingredients</CardTitle></CardHeader><CardContent className="space-y-2">{ingredients.length ? ingredients.map((item, index) => <div key={`${item.product_id || item.sub_recipe_id || index}`} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto]"><div><p className="font-medium">{item.product_name || 'Ingredient'}</p>{item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}</div><span className="text-sm">{Number(item.quantity || 0)} {item.unit} · {Number(item.yield_percentage || 100)}% yield</span><span className="text-sm font-medium">{money.format(Number(item.total_cost || 0))}</span></div>) : <p className="text-sm text-muted-foreground">No ingredients added.</p>}</CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Preparation</CardTitle></CardHeader><CardContent className="space-y-3">{steps.length ? steps.map((step) => <div key={step.id} className="flex gap-3 rounded-md border p-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{step.step_number}</div><div><p className="text-sm">{step.instruction}</p>{step.notes && <p className="mt-1 text-xs text-muted-foreground">{step.notes}</p>}</div></div>) : <p className="whitespace-pre-line text-sm text-muted-foreground">{recipe.instructions || 'No preparation steps added.'}</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ChefHat className="h-4 w-4" /> Equipment and handling</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2">{equipmentNames.length ? equipmentNames.map((name) => <Badge variant="secondary" key={name}>{name}</Badge>) : <span className="text-sm text-muted-foreground">No equipment assigned.</span>}</div><p className="text-sm"><span className="text-muted-foreground">Shelf life:</span> {recipe.shelf_life_quantity ? `${Number(recipe.shelf_life_quantity)} ${Number(recipe.shelf_life_quantity) === 1 ? String(recipe.shelf_life_unit || '').replace(/s$/, '') : recipe.shelf_life_unit}` : 'Not specified'}</p></CardContent></Card></div>
  </div>;
}
