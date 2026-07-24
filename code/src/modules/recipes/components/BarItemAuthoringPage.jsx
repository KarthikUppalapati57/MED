import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChefHat, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirmation } from '@/hooks/useConfirmation';
import { getConfirmationMessage } from '@/lib/confirmationMessages';
import { calculateAlternateYieldCosts } from '@/modules/recipes/lib/recipeCosting';
import { calculateMenuItemAuthoringCosts, parseIngredientText, recalculateAuthoringIngredient, validateMenuItemAuthoring } from '@/modules/recipes/lib/menuItemAuthoring';
import { validateBarItem } from '@/modules/recipes/lib/barItemsDomain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const UNITS = ['serving', 'each', 'count', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const newIngredient = () => ({ product_id: null, sub_recipe_id: null, product_name: '', quantity: 1, unit: 'each', cost_unit: 'each', unit_cost: 0, yield_percentage: 100, total_cost: 0, notes: '' });
const initialForm = () => ({
  name: '', description: '', recipeTypeId: '', category: 'beverage', status: 'active',
  shelfLifeQuantity: '', shelfLifeUnit: 'days', yields: [{ id: crypto.randomUUID(), quantity: 1, unit: 'serving' }],
  visibilityMode: 'all', visibleLocationIds: [], equipmentNames: [], steps: [{ id: crypto.randomUUID(), instruction: '', notes: '' }],
  ingredients: [], globalPrice: '', useLocationPrices: false, locationPrices: [], targetMarginPercent: 70, marginAlertEnabled: true,
});

function Section({ title, description, children }) {
  return <Card><CardHeader><CardTitle className="text-lg">{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>;
}

export default function BarItemAuthoringPage({ products = [], preparedItems = [], locations = [], conversions = [], recipe = null, recipeTypes: suppliedRecipeTypes = [] }) {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const queryClient = useQueryClient();
  const { organization, brand, location } = useAuth();
  const { canManageRecipes } = usePermissions();
  const { confirm } = useConfirmation();
  const initialRef = useRef(null);
  if (initialRef.current === null) initialRef.current = initialForm();
  const [form, setForm] = useState(initialRef.current);
  const [saving, setSaving] = useState(false);
  const [equipmentDraft, setEquipmentDraft] = useState('');
  const [aiText, setAiText] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const baselineRef = useRef(JSON.stringify(initialRef.current));

  const { data: authoringSchema = { supported: true, equipment: [] } } = useAuthQuery({
    queryKey: ['menu-item-authoring-schema', organization?.id],
    queryFn: async () => {
      try {
        const equipment = await api.entities.RecipeEquipmentCatalog.list('name', { limit: 1000 });
        return { supported: true, equipment };
      } catch (error) {
        const missing = error?.code === 'PGRST205' || String(error?.message || '').includes('recipe_equipment_catalog');
        if (missing) return { supported: false, equipment: [] };
        throw error;
      }
    },
    enabled: Boolean(organization?.id),
  });

  const { data: loadedRecipeTypes = [] } = useAuthQuery({
    queryKey: ['recipe-types', organization?.id],
    queryFn: async () => {
      try { return await api.entities.RecipeType.list('sort_order', { limit: 1000 }); }
      catch (error) { return String(error?.message || '').includes('recipe_types') ? [] : Promise.reject(error); }
    },
    enabled: Boolean(organization?.id),
  });
  const recipeTypes = suppliedRecipeTypes.length ? suppliedRecipeTypes : loadedRecipeTypes;

  useEffect(() => {
    if (!recipe?.id) return;
    let active = true;
    (async () => {
      try {
        const [yields, visibility, steps, assignments, equipment, ingredients, prices] = await Promise.all([
          api.entities.RecipeYield.filter({ recipe_id: recipe.id }, { orderBy: '-is_primary', limit: 100 }),
          api.entities.RecipeLocationVisibility.filter({ recipe_id: recipe.id }, { limit: 1000 }),
          api.entities.RecipePreparationStep.filter({ recipe_id: recipe.id }, { orderBy: 'step_number', limit: 100 }),
          api.entities.RecipeEquipmentAssignment.filter({ recipe_id: recipe.id }, { limit: 100 }),
          api.entities.RecipeEquipmentCatalog.list('name', { limit: 1000 }),
          api.entities.RecipeIngredient.filter({ recipe_id: recipe.id }, { orderBy: 'sort_order', limit: 1000 }),
          api.entities.RecipeLocationPrice.filter({ recipe_id: recipe.id }, { limit: 1000 }),
        ]);
        if (!active) return;
        const equipmentMap = new Map(equipment.map((row) => [row.id, row.name]));
        const catalogRows = [...products.map((row) => ({ ...row, kind: 'product', unit_cost: Number(row.latest_price || 0), cost_unit: row.base_unit || row.report_by_unit || 'each' })), ...preparedItems.map((row) => ({ ...row, kind: 'prepared', unit_cost: Number(row.cost_per_serving || 0), cost_unit: row.yield_unit || 'serving' }))];
        const next = {
          ...initialForm(), name: recipe.name || '', description: recipe.description || '', recipeTypeId: recipe.recipe_type_id || '', status: recipe.status || 'active',
          shelfLifeQuantity: recipe.shelf_life_quantity || '', shelfLifeUnit: recipe.shelf_life_unit || 'days', globalPrice: recipe.selling_price ?? '', targetMarginPercent: recipe.target_margin_percent ?? 70, marginAlertEnabled: recipe.margin_alert_enabled ?? true,
          yields: (yields.length ? yields : [{ quantity: recipe.yield_quantity || 1, unit: recipe.yield_unit || 'serving', is_primary: true }]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((row) => ({ ...row, id: row.id || crypto.randomUUID() })),
          visibilityMode: visibility.length ? 'selected' : 'all', visibleLocationIds: visibility.map((row) => row.location_id).filter(Boolean),
          equipmentNames: assignments.map((row) => equipmentMap.get(row.equipment_id)).filter(Boolean), steps: steps.map((row) => ({ ...row, id: row.id || crypto.randomUUID() })),
          ingredients: ingredients.map((row) => { const selected = catalogRows.find((item) => item.id === (row.product_id || row.sub_recipe_id)); return recalculateAuthoringIngredient({ ...row, product_name: selected?.name || 'Ingredient', unit_cost: Number(row.unit_cost_snapshot || selected?.unit_cost || 0), cost_unit: row.cost_unit || selected?.cost_unit || row.unit }, conversions); }),
          useLocationPrices: prices.length > 0, locationPrices: locations.map((entry) => ({ location_id: entry.id, name: entry.name, price: prices.find((row) => row.location_id === entry.id)?.price ?? '' })),
        };
        setForm(next); baselineRef.current = JSON.stringify(next);
      } catch (error) { toast.error(error.message || 'Unable to load Bar Item'); }
    })();
    return () => { active = false; };
  }, [recipe?.id]);

  const dirty = JSON.stringify(form) !== baselineRef.current;
  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const interceptLinks = async (event) => {
      if (!dirty || saving || event.defaultPrevented || (event.button != null && event.button !== 0)) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      const discard = await confirm(getConfirmationMessage('discardRecipeChanges'));
      if (discard) { baselineRef.current = JSON.stringify(form); navigate(`${url.pathname}${url.search}${url.hash}`); }
    };
    document.addEventListener('click', interceptLinks, true);
    return () => document.removeEventListener('click', interceptLinks, true);
  }, [confirm, dirty, form, navigate, saving]);

  const catalog = useMemo(() => [
    ...products.map((item) => ({ id: item.id, kind: 'product', name: item.name, unit_cost: Number(item.latest_price || 0), cost_unit: item.base_unit || item.report_by_unit || 'ea' })),
    ...preparedItems.map((item) => ({ id: item.id, kind: 'prepared', name: item.name, unit_cost: Number(item.cost_per_serving || 0), cost_unit: item.yield_unit || 'serving' })),
  ], [products, preparedItems]);
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [`${item.kind}:${item.id}`, item])), [catalog]);
  const primaryYield = form.yields[0];
  const costs = useMemo(() => calculateMenuItemAuthoringCosts({ ingredients: form.ingredients, primaryYield, globalPrice: form.globalPrice, conversions }), [form.ingredients, form.globalPrice, primaryYield, conversions]);
  const yieldCosts = useMemo(() => calculateAlternateYieldCosts(costs.totalCost, form.yields), [costs.totalCost, form.yields]);

  const updateIngredient = (index, field, value) => setForm((current) => {
    const rows = [...current.ingredients];
    if (field === 'catalog') {
      const selected = catalogMap.get(value);
      rows[index] = { ...rows[index], product_id: selected?.kind === 'product' ? selected.id : null, sub_recipe_id: selected?.kind === 'prepared' ? selected.id : null, product_name: selected?.name || '', unit_cost: selected?.unit_cost || 0, cost_unit: selected?.cost_unit || rows[index].unit, needs_review: false };
    } else rows[index] = { ...rows[index], [field]: value };
    rows[index] = recalculateAuthoringIngredient(rows[index], conversions);
    return { ...current, ingredients: rows };
  });

  const matchImportedIngredient = (index, value) => {
    const selected = catalogMap.get(value);
    if (!selected) return;
    setImportPreview((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return recalculateAuthoringIngredient({
        ...row,
        product_id: selected.kind === 'product' ? selected.id : null,
        sub_recipe_id: selected.kind === 'prepared' ? selected.id : null,
        product_name: selected.name,
        unit_cost: selected.unit_cost || 0,
        cost_unit: selected.cost_unit || row.unit,
        notes: '',
        needs_review: false,
      }, conversions);
    }));
  };

  const parseAiIngredients = () => {
    const rows = parseIngredientText(aiText, catalog).map((row) => recalculateAuthoringIngredient(row, conversions));
    if (!rows.length) { toast.error('Paste at least one ingredient line.'); return; }
    setImportPreview(rows);
  };

  const mergeImportedIngredients = async () => {
    if (importPreview.some((row) => row.needs_review)) {
      toast.error('Match every imported ingredient before merging.');
      return;
    }
    if (form.ingredients.length) {
      const approved = await confirm({ title: 'Merge imported ingredients?', description: `${importPreview.length} imported row${importPreview.length === 1 ? '' : 's'} will be added after the existing manual rows. Existing rows will not be overwritten.`, confirmText: 'Merge rows', variant: 'info', severity: 'medium' });
      if (!approved) return;
    }
    setForm((current) => ({ ...current, ingredients: [...current.ingredients, ...importPreview] }));
    setImportPreview(null); setAiText('');
    toast.success('Imported rows added for review');
  };

  const cancel = async () => {
    if (dirty && !(await confirm(getConfirmationMessage('discardRecipeChanges')))) return;
    baselineRef.current = JSON.stringify(form);
    navigate(`/Recipes/bar-items${routerLocation.search}`);
  };

  const save = async () => {
    if (saving) return;
    const errors = [...validateMenuItemAuthoring(form), ...validateBarItem({ ...form, yields: form.yields.map((row, index) => ({ ...row, is_primary: index === 0 })) })];
    if (!canManageRecipes) errors.unshift('Your role cannot manage recipes.');
    if (!authoringSchema.supported) errors.unshift('Apply the local Bar Item migration before saving.');
    if (errors.length) { toast.error(errors[0]); return; }
    const approved = await confirm(recipe?.id ? {
      title: `Save changes to “${form.name.trim()}”?`,
      description: 'This updates the Bar Item recipe, its costing inputs, and downstream Recipe costs.',
      confirmText: 'Save changes',
      variant: 'info',
      severity: 'medium',
    } : getConfirmationMessage('createRecipe', form.name.trim()));
    if (!approved) return;
    setSaving(true);
    try {
      const calculatedYields = calculateAlternateYieldCosts(costs.totalCost, form.yields).map((row, index) => ({ quantity: Number(row.quantity), unit: row.unit.trim(), is_primary: index === 0, cost_per_unit: row.cost_per_unit }));
      const steps = form.steps.filter((step) => step.instruction.trim()).map((step, index) => ({ step_number: index + 1, instruction: step.instruction.trim(), notes: step.notes.trim() }));
      const saved = await api.recipes.saveBarItemRelease1({
        recipe: {
          id: recipe?.id || null,
          organization_id: organization.id,
          brand_id: (brand?.brand_id || brand?.id) || null,
          location_id: location?.id || null,
          name: form.name.trim(), description: form.description.trim(), category: form.category, status: form.status,
          recipe_type_id: form.recipeTypeId || null, shelf_life_quantity: form.shelfLifeQuantity || null, shelf_life_unit: form.shelfLifeQuantity ? form.shelfLifeUnit : null,
          ingredients: form.ingredients.map(({ import_id: _importId, needs_review: _needsReview, ...ingredient }) => ingredient),
          instructions: steps.map((step) => `${step.step_number}. ${step.instruction}${step.notes ? ` (${step.notes})` : ''}`).join('\n'),
          selling_price: Number(form.globalPrice || 0), target_margin_percent: form.targetMarginPercent, margin_alert_enabled: form.marginAlertEnabled,
          total_ingredient_cost: costs.ingredientCost, total_cost: costs.totalCost, cost_per_serving: costs.costPerYieldUnit,
        },
        yields: calculatedYields,
        visibility: { mode: form.visibilityMode, location_ids: form.visibleLocationIds },
        equipmentNames: form.equipmentNames,
        steps,
        locationPrices: form.useLocationPrices ? form.locationPrices.filter((row) => row.price !== '').map((row) => ({ location_id: row.location_id, price: Number(row.price) })) : [],
      });
      baselineRef.current = JSON.stringify(form);
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-location-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['menu-item-authoring-schema'] });
      toast.success('Bar Item saved');
      navigate(`/Recipes/bar-items/${saved.id}${routerLocation.search}`);
    } catch (error) {
      const migrationMissing = error?.code === 'PGRST202' || String(error?.message || '').includes('save_bar_item_release1');
      toast.error(migrationMissing ? 'This Supabase environment does not have the local Bar Item migration.' : error?.message || 'Unable to save Bar Item');
    } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 pb-12">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><Button variant="ghost" className="mb-2 px-0" onClick={cancel}><ArrowLeft className="mr-2 h-4 w-4" /> Bar Items</Button><h1 className="text-3xl font-semibold">{recipe ? 'Edit' : 'Create'} a Bar Item</h1><p className="text-muted-foreground">Build a tenant-scoped beverage recipe with live pour-cost controls.</p></div><div className="flex gap-2"><Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving || !canManageRecipes || !authoringSchema.supported}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Bar Item'}</Button></div></div>
    {!authoringSchema.supported && <Alert><AlertTitle>Local Recipe migration required</AlertTitle><AlertDescription>The authoring page remains available for review, but saving is disabled in Supabase environments without `20260715000004_menu_item_authoring_phase1.sql`.</AlertDescription></Alert>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Section title="Item details" description="Identity and operating status for this restaurant-owned Bar Item."><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="menu-name">Name *</Label><Input id="menu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-2"><Label>Beverage recipe type</Label><Select value={form.recipeTypeId || 'unclassified'} onValueChange={(value) => setForm({ ...form, recipeTypeId: value === 'unclassified' ? '' : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unclassified">Other beverage</SelectItem>{recipeTypes.filter((type) => type.kind === 'beverage').map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="seasonal">Seasonal</SelectItem></SelectContent></Select></div><div className="space-y-2 md:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="space-y-2"><Label>Shelf life</Label><Input type="number" min="0.1" step="0.1" placeholder="Optional" value={form.shelfLifeQuantity} onChange={(e) => setForm({ ...form, shelfLifeQuantity: e.target.value })} /></div><div className="space-y-2"><Label>Shelf-life unit</Label><Select value={form.shelfLifeUnit} onValueChange={(shelfLifeUnit) => setForm({ ...form, shelfLifeUnit })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hours">Hours</SelectItem><SelectItem value="days">Days</SelectItem><SelectItem value="weeks">Weeks</SelectItem></SelectContent></Select></div></div></Section>

        <Section title="Yields" description="The first row is the primary serving used for live costing.">{form.yields.map((row, index) => <div key={row.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label>Quantity</Label><Input type="number" min="0.0001" step="0.01" value={row.quantity} onChange={(e) => setForm((current) => ({ ...current, yields: current.yields.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item) }))} /></div><div className="space-y-2"><Label>Unit</Label><Select value={row.unit} onValueChange={(unit) => setForm((current) => ({ ...current, yields: current.yields.map((item, i) => i === index ? { ...item, unit } : item) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map((unit) => <SelectItem value={unit} key={unit}>{unit}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end gap-2"><Badge variant={index === 0 ? 'default' : 'outline'}>{index === 0 ? 'Primary' : money.format(yieldCosts[index]?.cost_per_unit || 0)}</Badge><Button size="icon" variant="ghost" disabled={form.yields.length === 1} onClick={() => setForm({ ...form, yields: form.yields.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button></div></div>)}<Button variant="outline" onClick={() => setForm({ ...form, yields: [...form.yields, { id: crypto.randomUUID(), quantity: 1, unit: 'each' }] })}><Plus className="mr-2 h-4 w-4" /> Add yield</Button></Section>

        <Section title="Restaurant visibility" description="The organization always owns the recipe; optionally limit its availability to selected locations."><div className="flex gap-2"><Button type="button" variant={form.visibilityMode === 'all' ? 'default' : 'outline'} onClick={() => setForm({ ...form, visibilityMode: 'all', visibleLocationIds: [] })}>All locations</Button><Button type="button" variant={form.visibilityMode === 'selected' ? 'default' : 'outline'} onClick={() => setForm({ ...form, visibilityMode: 'selected' })}>Selected locations</Button></div>{form.visibilityMode === 'selected' && <div className="grid gap-2 sm:grid-cols-2">{locations.map((entry) => <label key={entry.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><Checkbox checked={form.visibleLocationIds.includes(entry.id)} onCheckedChange={(checked) => setForm({ ...form, visibleLocationIds: checked ? [...new Set([...form.visibleLocationIds, entry.id])] : form.visibleLocationIds.filter((id) => id !== entry.id) })} />{entry.name}</label>)}</div>}<p className="text-xs text-muted-foreground">Inventory integration is intentionally excluded until the Inventory-owned contract is available.</p></Section>

        <Section title="Equipment" description="Select reusable equipment or add an organization-specific equipment name."><div className="flex gap-2"><Input placeholder="e.g. convection oven" value={equipmentDraft} onChange={(e) => setEquipmentDraft(e.target.value)} /><Button variant="outline" onClick={() => { const name = equipmentDraft.trim(); if (name) { setForm({ ...form, equipmentNames: [...new Set([...form.equipmentNames, name])] }); setEquipmentDraft(''); } }}>Add</Button></div><div className="flex flex-wrap gap-2">{[...new Set([...authoringSchema.equipment.map((item) => item.name), ...form.equipmentNames])].map((name) => <Button key={name} size="sm" variant={form.equipmentNames.includes(name) ? 'default' : 'outline'} onClick={() => setForm({ ...form, equipmentNames: form.equipmentNames.includes(name) ? form.equipmentNames.filter((item) => item !== name) : [...form.equipmentNames, name] })}>{name}</Button>)}</div></Section>

        <Section title="Preparation" description="Create ordered, repeatable instructions without media attachments.">{form.steps.map((step, index) => <div key={step.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[40px_1fr_auto]"><div className="flex h-10 items-center justify-center rounded-md bg-muted font-medium">{index + 1}</div><div className="space-y-2"><Textarea placeholder="Preparation instruction" value={step.instruction} onChange={(e) => setForm((current) => ({ ...current, steps: current.steps.map((row, i) => i === index ? { ...row, instruction: e.target.value } : row) }))} /><Input placeholder="Optional operational notes" value={step.notes} onChange={(e) => setForm((current) => ({ ...current, steps: current.steps.map((row, i) => i === index ? { ...row, notes: e.target.value } : row) }))} /></div><div className="flex gap-1"><Button size="icon" variant="ghost" disabled={index === 0} onClick={() => setForm((current) => { const steps = [...current.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; return { ...current, steps }; })}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" disabled={index === form.steps.length - 1} onClick={() => setForm((current) => { const steps = [...current.steps]; [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; return { ...current, steps }; })}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button></div></div>)}<Button variant="outline" onClick={() => setForm({ ...form, steps: [...form.steps, { id: crypto.randomUUID(), instruction: '', notes: '' }] })}><Plus className="mr-2 h-4 w-4" /> Add step</Button></Section>

        <Section title="Ingredients" description="Use purchased products or prepared Recipe components. Imported rows remain editable and require review.">
          {!catalog.length && <Alert><AlertTitle>No ingredient catalog items available</AlertTitle><AlertDescription>Create purchased products in Products or Recipe components in Prepared Items. Inventory is not modified by this workflow.</AlertDescription></Alert>}
          <div className="rounded-lg border bg-muted/30 p-4"><Label htmlFor="ingredient-paste" className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI-assisted ingredient import</Label><Textarea id="ingredient-paste" className="mt-2" placeholder={'2 cup flour\n1 lb prepared chicken'} value={aiText} onChange={(e) => setAiText(e.target.value)} /><Button className="mt-2" variant="outline" onClick={parseAiIngredients}>Parse for review</Button></div>
          {form.ingredients.map((ingredient, index) => <div key={ingredient.import_id || index} className={`space-y-3 rounded-lg border p-3 ${ingredient.needs_review ? 'border-amber-400 bg-amber-50/40' : ''}`}>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Select value={ingredient.product_id ? `product:${ingredient.product_id}` : ingredient.sub_recipe_id ? `prepared:${ingredient.sub_recipe_id}` : ''} onValueChange={(value) => updateIngredient(index, 'catalog', value)} disabled={!catalog.length}>
                <SelectTrigger><SelectValue placeholder={catalog.length ? 'Select product or prepared item' : 'No catalog items available'} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup><SelectLabel>Purchased products</SelectLabel>{products.length ? products.map((item) => <SelectItem key={item.id} value={`product:${item.id}`}>{item.name}</SelectItem>) : <SelectItem value="no-products" disabled>No purchased products</SelectItem>}</SelectGroup>
                  <SelectGroup><SelectLabel>Prepared items</SelectLabel>{preparedItems.length ? preparedItems.map((item) => <SelectItem key={item.id} value={`prepared:${item.id}`}>{item.name}</SelectItem>) : <SelectItem value="no-prepared" disabled>No prepared items</SelectItem>}</SelectGroup>
                </SelectContent>
              </Select>
              <Input type="number" min="0.0001" step="0.01" value={ingredient.quantity} onChange={(e) => updateIngredient(index, 'quantity', e.target.value)} placeholder="Quantity" />
              <Select value={ingredient.unit} onValueChange={(value) => updateIngredient(index, 'unit', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select>
              <Input type="number" min="0.01" max="100" step="0.1" value={ingredient.yield_percentage} onChange={(e) => updateIngredient(index, 'yield_percentage', e.target.value)} placeholder="Yield %" />
              <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Input value={ingredient.notes || ''} onChange={(e) => updateIngredient(index, 'notes', e.target.value)} placeholder="Ingredient notes" /><div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Cost</span><Badge variant={ingredient.missing_conversion ? 'destructive' : 'outline'}>{ingredient.missing_conversion ? 'Unit conversion needed' : money.format(Number(ingredient.total_cost || 0))}</Badge></div></div>
          </div>)}
          <Button variant="outline" disabled={!catalog.length} onClick={() => setForm({ ...form, ingredients: [...form.ingredients, newIngredient()] })}><Plus className="mr-2 h-4 w-4" /> Add ingredient</Button>
        </Section>

        <Section title="Location pricing" description="Use the global price everywhere or set explicit overrides for individual locations."><div className="flex items-center gap-2"><Checkbox checked={form.useLocationPrices} onCheckedChange={(checked) => setForm({ ...form, useLocationPrices: Boolean(checked), locationPrices: checked ? locations.map((entry) => ({ location_id: entry.id, name: entry.name, price: '' })) : [] })} /><Label>Set location-specific prices</Label></div>{form.useLocationPrices && <div className="space-y-2">{form.locationPrices.map((row, index) => { const effectivePrice = row.price === '' ? Number(form.globalPrice || 0) : Number(row.price); const locationProfit = effectivePrice - costs.costPerYieldUnit; const locationPlateCost = effectivePrice > 0 ? costs.costPerYieldUnit / effectivePrice * 100 : null; return <div className="grid items-center gap-3 rounded-md border p-3 sm:grid-cols-[1fr_150px_120px_120px]" key={row.location_id}><span className="text-sm font-medium">{row.name}</span><Input type="number" min="0" step="0.01" placeholder="Use global" value={row.price} onChange={(e) => setForm((current) => ({ ...current, locationPrices: current.locationPrices.map((item, i) => i === index ? { ...item, price: e.target.value } : item) }))} /><span className="text-sm text-muted-foreground">Profit {money.format(locationProfit)}</span><span className="text-sm text-muted-foreground">Plate {locationPlateCost == null ? '—' : `${locationPlateCost.toFixed(1)}%`}</span></div>; })}</div>}</Section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ChefHat className="h-5 w-5" /> Live beverage economics</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="global-price">Global selling price</Label><Input id="global-price" type="number" min="0" step="0.01" value={form.globalPrice} onChange={(e) => setForm({ ...form, globalPrice: e.target.value })} /></div><div className="grid grid-cols-2 gap-3">{[['Ingredient total', money.format(costs.ingredientCost)], ['Cost per serving', money.format(costs.costPerYieldUnit)], ['Gross profit', Number(form.globalPrice || 0) > 0 ? money.format(costs.netProfit) : 'Set price'], ['Pour cost', costs.plateCostPercent == null ? 'Set price' : `${costs.plateCostPercent.toFixed(1)}%`]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>{costs.missingConversions.length > 0 && <p className="text-xs text-destructive">Resolve {costs.missingConversions.length} missing unit conversion{costs.missingConversions.length === 1 ? '' : 's'} before relying on total cost.</p>}<div className="flex items-center gap-2"><Checkbox checked={form.marginAlertEnabled} onCheckedChange={(checked) => setForm({ ...form, marginAlertEnabled: Boolean(checked) })} /><Label>Enable cost monitoring</Label></div><Button className="w-full" onClick={save} disabled={saving || !canManageRecipes || !authoringSchema.supported}>{saving ? 'Saving...' : 'Save Bar Item'}</Button></CardContent></Card></aside>
    </div>

    <Dialog open={Boolean(importPreview)} onOpenChange={(open) => !open && setImportPreview(null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review imported ingredients</DialogTitle>
          <DialogDescription>Select a purchased product or prepared item for every unmatched row before merging.</DialogDescription>
        </DialogHeader>
        {!catalog.length && <Alert><AlertTitle>No ingredient catalog items available</AlertTitle><AlertDescription>Add purchased products in Products or Recipe components in Prepared Items before matching imported ingredients.</AlertDescription></Alert>}
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {importPreview?.map((row, index) => <div key={row.import_id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_280px] sm:items-center">
            <div><p className="font-medium">{row.product_name}</p><p className="text-sm text-muted-foreground">{row.quantity} {row.unit}</p></div>
            <Select value={row.product_id ? `product:${row.product_id}` : row.sub_recipe_id ? `prepared:${row.sub_recipe_id}` : ''} onValueChange={(value) => matchImportedIngredient(index, value)} disabled={!catalog.length}>
              <SelectTrigger><SelectValue placeholder={catalog.length ? 'Needs match — select item' : 'No catalog items available'} /></SelectTrigger>
              <SelectContent>
                <SelectGroup><SelectLabel>Purchased products</SelectLabel>{products.length ? products.map((item) => <SelectItem key={item.id} value={`product:${item.id}`}>{item.name}</SelectItem>) : <SelectItem value="no-products" disabled>No purchased products</SelectItem>}</SelectGroup>
                <SelectGroup><SelectLabel>Prepared items</SelectLabel>{preparedItems.length ? preparedItems.map((item) => <SelectItem key={item.id} value={`prepared:${item.id}`}>{item.name}</SelectItem>) : <SelectItem value="no-prepared" disabled>No prepared items</SelectItem>}</SelectGroup>
              </SelectContent>
            </Select>
          </div>)}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setImportPreview(null)}>Cancel</Button><Button onClick={mergeImportedIngredients} disabled={importPreview?.some((row) => row.needs_review)}>Merge into ingredients</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
