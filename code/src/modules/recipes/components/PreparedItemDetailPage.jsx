import React from 'react';
import { ArrowLeft, Edit2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export default function PreparedItemDetailPage({recipeId,onEdit}) {
  const navigate=useNavigate(); const {organization}=useAuth();
  const {data,isLoading,error}=useAuthQuery({queryKey:['prepared-item-detail',organization?.id,recipeId],enabled:Boolean(organization?.id&&recipeId),queryFn:async()=>{
    const recipe=await api.entities.Recipe.get(recipeId);
    const [yields,ingredients,steps,dependencies,snapshots]=await Promise.all([
      api.entities.RecipeYield.filter({recipe_id:recipeId},{orderBy:'-is_primary',limit:100}),api.entities.RecipeIngredient.filter({recipe_id:recipeId},{orderBy:'sort_order',limit:1000}),api.entities.RecipePreparationStep.filter({recipe_id:recipeId},{orderBy:'step_number',limit:100}),
      api.recipes.getPreparedItemDependencies(recipeId),api.entities.RecipeCostSnapshot.filter({recipe_id:recipeId},{orderBy:'-costing_version',limit:10}),
    ]); return{recipe,yields,ingredients,steps,dependencies,snapshots};
  }});
  if(isLoading)return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin"/></div>;
  if(error)return <Alert variant="destructive"><AlertTitle>Unable to load Prepared Item</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
  const {recipe,yields,ingredients,steps,dependencies,snapshots}=data;
  return <div className="mx-auto max-w-6xl space-y-6 pb-12"><div className="flex items-center justify-between"><div><Button variant="ghost" className="px-0" onClick={()=>navigate('/Recipes/prepared-items')}><ArrowLeft className="mr-2 h-4 w-4"/>Prepared Items</Button><h1 className="text-3xl font-semibold">{recipe.name}</h1><div className="mt-2 flex gap-2"><Badge className="capitalize">{recipe.status}</Badge><Badge variant="outline">Prepared Item</Badge></div></div><Button onClick={()=>onEdit(recipe)}><Edit2 className="mr-2 h-4 w-4"/>Edit</Button></div>
  <div className="grid gap-4 md:grid-cols-4">{[['Batch cost',money.format(Number(recipe.total_cost||0))],['Cost / primary yield',money.format(Number(recipe.cost_per_serving||0))],['Primary yield',`${recipe.yield_quantity||0} ${recipe.yield_unit||''}`],['Shelf life',recipe.shelf_life_quantity?`${recipe.shelf_life_quantity} ${recipe.shelf_life_unit}`:'Not set']].map(([label,value])=><Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></CardContent></Card>)}</div>
  {recipe.description&&<Card><CardHeader><CardTitle>Description</CardTitle></CardHeader><CardContent>{recipe.description}</CardContent></Card>}
  <Card><CardHeader><CardTitle>Yields</CardTitle></CardHeader><CardContent><div className="flex flex-wrap gap-2">{yields.map((row)=><Badge variant={row.is_primary?'default':'outline'} key={row.id}>{row.quantity} {row.unit}{row.is_primary?' · Primary':''} · {money.format(Number(row.cost_per_unit||0))}</Badge>)}</div></CardContent></Card>
  <Card><CardHeader><CardTitle>Ingredients</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead>Quantity</TableHead><TableHead>Yield</TableHead><TableHead>Cost contribution</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader><TableBody>{ingredients.length?ingredients.map((row)=><TableRow key={row.id}><TableCell>{row.product_id?'Purchased product':'Nested Prepared Item'}</TableCell><TableCell>{row.quantity} {row.unit}</TableCell><TableCell>{row.yield_percentage}%</TableCell><TableCell>{money.format(Number(row.quantity||0)*Number(row.unit_cost_snapshot||0)/(Number(row.yield_percentage||100)/100))}</TableCell><TableCell>{row.notes||'—'}</TableCell></TableRow>):<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No ingredients</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
  <Card><CardHeader><CardTitle>Preparation</CardTitle></CardHeader><CardContent className="space-y-3">{steps.length?steps.map((row)=><div key={row.id} className="flex gap-3 rounded-md border p-3"><span className="font-semibold">{row.step_number}</span><div><p>{row.instruction}</p>{row.notes&&<p className="text-sm text-muted-foreground">{row.notes}</p>}</div></div>):<p className="text-sm text-muted-foreground">No preparation steps.</p>}</CardContent></Card>
  <Card><CardHeader><CardTitle>Used in Recipes</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Recipe</TableHead><TableHead>Recipe kind</TableHead><TableHead>Quantity</TableHead><TableHead>Yield</TableHead><TableHead>Cost contribution</TableHead></TableRow></TableHeader><TableBody>{dependencies.length?dependencies.map((row)=><TableRow key={row.recipe_id}><TableCell className="font-medium">{row.recipe_name}</TableCell><TableCell>{row.is_prepared_item?'Prepared Item':'Menu Item / Recipe'}</TableCell><TableCell>{row.quantity} {row.unit}</TableCell><TableCell>{row.yield_percentage}%</TableCell><TableCell>{money.format(Number(row.cost_contribution||0))}</TableCell></TableRow>):<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">This Prepared Item is not currently used by another recipe.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
  <Card><CardHeader><CardTitle>Cost history</CardTitle></CardHeader><CardContent className="space-y-2">{snapshots.length?snapshots.map((row)=><div key={row.id} className="flex justify-between rounded-md border p-3 text-sm"><span>Version {row.costing_version} · {new Date(row.created_at).toLocaleString()}</span><span>{money.format(Number(row.total_cost||0))} batch · {money.format(Number(row.cost_per_yield_unit||0))}/{row.primary_yield_unit}</span></div>):<p className="text-sm text-muted-foreground">Cost snapshots begin after the Prepared Items migration is applied.</p>}</CardContent></Card>
  </div>;
}
