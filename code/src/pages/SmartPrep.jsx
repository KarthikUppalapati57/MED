import React, { useMemo, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChefHat, Clock, Flame, Plus, Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/apiClient';
import VoiceAssistant from '@/components/kitchen/VoiceAssistant';
import { useAuth } from '@/lib/AuthContext';
import { useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { filterByContext } from '@/lib/contextUtils';
import { useDebounce } from '@/hooks/useDebounce';
import { useInView } from '@/hooks/useInView';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const today = new Date().toISOString().slice(0, 10);

const priorityStyles = {
  low: 'bg-secondary text-muted-foreground',
  normal: 'bg-brand/10 text-brand',
  high: 'bg-resend-orange/10 text-resend-orange',
  urgent: 'bg-resend-red/10 text-resend-red',
};

export default function SmartPrep() {
  const { user, organization, brand, location, activeBrand, activeLocation } = useAuth();
  const scopedBrand = activeBrand || brand;
  const scopedLocation = activeLocation || location;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    recipe_id: '',
    prep_date: today,
    par_quantity: 0,
    on_hand_quantity: 0,
    forecast_quantity: 0,
    unit: 'portion',
    priority: 'normal',
    notes: '',
  });

  const context = { organization, brand: scopedBrand, location: scopedLocation };
  const debouncedSearch = useDebounce(search, 500);

  const {
    data: plansData,
    fetchNextPage: fetchNextPlans,
    hasNextPage: hasNextPlans,
    isFetchingNextPage: isFetchingNextPlans
  } = useAuthInfiniteQuery({
    queryKey: ['smart-prep-plans', organization?.id, debouncedSearch],
    queryFn: ({ pageParam = 0 }) => api.entities.SmartPrepPlan.list('-prep_date', {
      page: pageParam,
      pageSize: 50,
      search: debouncedSearch || undefined,
      searchColumn: 'name',
      select: 'id, organization_id, brand_id, location_id, name, recipe_id, prep_date, prep_quantity, on_hand_quantity, forecast_quantity, unit, priority, status, notes',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id,
  });

  const plans = useMemo(() => filterByContext(plansData?.pages?.flat() || [], context), [plansData, context]);

  const {
    data: recipesData,
    fetchNextPage: fetchNextRecipes,
    hasNextPage: hasNextRecipes,
    isFetchingNextPage: isFetchingNextRecipes
  } = useAuthInfiniteQuery({
    queryKey: ['recipes', organization?.id],
    queryFn: ({ pageParam = 0 }) => api.entities.Recipe.list('name', {
      page: pageParam,
      pageSize: 50,
      select: 'id, organization_id, brand_id, location_id, name, yield_quantity, yield_unit, cost_per_serving, status',
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id,
  });

  const recipes = useMemo(() => filterByContext(recipesData?.pages?.flat() || [], context), [recipesData, context]);

  const { ref: loadMoreRef, isIntersecting } = useInView({ rootMargin: '100px' });

  useEffect(() => {
    if (isIntersecting) {
      if (hasNextPlans && !isFetchingNextPlans) fetchNextPlans();
      if (hasNextRecipes && !isFetchingNextRecipes) fetchNextRecipes();
    }
  }, [isIntersecting, hasNextPlans, isFetchingNextPlans, fetchNextPlans, hasNextRecipes, isFetchingNextRecipes, fetchNextRecipes]);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  const stats = useMemo(() => {
    const open = plans.filter((plan) => !['completed', 'skipped'].includes(plan.status)).length;
    const urgent = plans.filter((plan) => plan.priority === 'urgent' || plan.priority === 'high').length;
    const totalPrep = plans.reduce((sum, plan) => sum + Number(plan.prep_quantity || 0), 0);
    return { open, urgent, totalPrep };
  }, [plans]);



  const resetForm = () => setForm({
    name: '',
    recipe_id: '',
    prep_date: today,
    par_quantity: 0,
    on_hand_quantity: 0,
    forecast_quantity: 0,
    unit: 'portion',
    priority: 'normal',
    notes: '',
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api.entities.SmartPrepPlan.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-prep-plans'] });
      toast.success('SmartPrep plan created');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message || 'Failed to create prep plan'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.SmartPrepPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart-prep-plans'] });
      toast.success('Prep plan updated');
    },
    onError: (error) => toast.error(error.message || 'Failed to update prep plan'),
  });

  const handleRecipeSelect = (recipeId) => {
    const recipe = recipeMap.get(recipeId);
    setForm((current) => ({
      ...current,
      recipe_id: recipeId,
      name: current.name || recipe?.name || '',
      unit: recipe?.yield_unit || current.unit,
      par_quantity: Number(recipe?.yield_quantity || current.par_quantity || 0),
    }));
  };

  const handleCreate = () => {
    if (!form.name.trim()) {
      toast.error('Prep item name is required');
      return;
    }
    const par = Number(form.par_quantity || 0);
    const onHand = Number(form.on_hand_quantity || 0);
    const forecast = Number(form.forecast_quantity || 0);
    const prepQuantity = Math.max(par + forecast - onHand, 0);
    createMutation.mutate({
      organization_id: organization?.id,
      brand_id: scopedBrand?.id || null,
      location_id: scopedLocation?.id || null,
      recipe_id: form.recipe_id || null,
      name: form.name,
      prep_date: form.prep_date,
      par_quantity: par,
      on_hand_quantity: onHand,
      forecast_quantity: forecast,
      prep_quantity: prepQuantity,
      unit: form.unit,
      priority: form.priority,
      notes: form.notes,
      created_by: user?.id,
    });
  };

  const markComplete = (plan) => updateMutation.mutate({
    id: plan.id,
    data: {
      status: 'completed',
      completed_by: user?.id,
      completed_at: new Date().toISOString(),
    },
  });

  const startPlan = (plan) => updateMutation.mutate({ id: plan.id, data: { status: 'in_progress' } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-brand" />
            SmartPrep
          </h1>
          <p className="text-muted-foreground mt-1">Plan prep from pars, on-hand counts, and forecast demand.</p>
        </div>
        <div className="flex items-center gap-2">
          <VoiceAssistant onTranscript={(text) => {
            setForm(f => ({ ...f, name: text, prep_quantity: 10, unit: 'lbs', priority: 'high' }));
            setDialogOpen(true);
          }} />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Prep Plan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Open Plans</p><p className="text-2xl font-bold">{stats.open}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">High Priority</p><p className="text-2xl font-bold">{stats.urgent}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Prep Qty</p><p className="text-2xl font-bold">{stats.totalPrep.toFixed(1)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prep plans..." className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{plan.prep_date}</span>
                    <Badge className={priorityStyles[plan.priority] || priorityStyles.normal}>{plan.priority}</Badge>
                    <Badge variant="outline">{plan.status}</Badge>
                  </div>
                </div>
                {plan.priority === 'urgent' && <Flame className="h-5 w-5 text-resend-red" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><p className="text-muted-foreground">Par</p><p className="font-semibold">{Number(plan.par_quantity || 0).toFixed(1)}</p></div>
                <div><p className="text-muted-foreground">On Hand</p><p className="font-semibold">{Number(plan.on_hand_quantity || 0).toFixed(1)}</p></div>
                <div><p className="text-muted-foreground">Forecast</p><p className="font-semibold">{Number(plan.forecast_quantity || 0).toFixed(1)}</p></div>
                <div><p className="text-muted-foreground">Prep</p><p className="font-semibold text-brand">{Number(plan.prep_quantity || 0).toFixed(1)} {plan.unit}</p></div>
              </div>
              {plan.notes && <p className="text-sm text-muted-foreground">{plan.notes}</p>}
              <div className="flex gap-2">
                {plan.status === 'planned' && <Button size="sm" variant="outline" onClick={() => startPlan(plan)}><Clock className="h-4 w-4 mr-1" />Start</Button>}
                {plan.status !== 'completed' && <Button size="sm" onClick={() => markComplete(plan)}><Check className="h-4 w-4 mr-1" />Complete</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <Card className="xl:col-span-2">
            <CardContent className="p-12 text-center text-muted-foreground">
              <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
              No prep plans yet.
            </CardContent>
          </Card>
        )}
      </div>

      {hasNextPlans && (
        <div ref={loadMoreRef} className="flex justify-center py-4 text-muted-foreground text-sm">
          {isFetchingNextPlans ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Loading more...'}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create SmartPrep Plan</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Recipe</Label>
              <Select value={form.recipe_id} onValueChange={handleRecipeSelect}>
                <SelectTrigger><SelectValue placeholder="Optional recipe link" /></SelectTrigger>
                <SelectContent>
                  {recipes.map((recipe) => <SelectItem key={recipe.id} value={recipe.id}>{recipe.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prep Item</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.prep_date} onChange={(e) => setForm({ ...form, prep_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div className="space-y-2"><Label>Par</Label><Input type="number" value={form.par_quantity} onChange={(e) => setForm({ ...form, par_quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>On Hand</Label><Input type="number" value={form.on_hand_quantity} onChange={(e) => setForm({ ...form, on_hand_quantity: e.target.value })} /></div>
              <div className="space-y-2"><Label>Forecast</Label><Input type="number" value={form.forecast_quantity} onChange={(e) => setForm({ ...form, forecast_quantity: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
