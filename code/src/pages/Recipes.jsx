import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ChefHat,
  Clock,
  DollarSign,
  Calculator,
  Loader2,
  Package,
  Users,
  MoreVertical
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function Recipes() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [calculatingCost, setCalculatingCost] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'main_course',
    yield_quantity: 1,
    yield_unit: 'serving',
    prep_time_minutes: 0,
    cook_time_minutes: 0,
    ingredients: [],
    labor_time_minutes: 0,
    labor_rate_per_hour: 15,
    packaging_items: [],
    instructions: ''
  });

  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading } = useAuthQuery({
    queryKey: ['recipes'],
    queryFn: () => api.entities.Recipe.list('-created_at'),
  });

  const { data: products = [] } = useAuthQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Recipe.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe created');
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Recipe.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe updated');
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'main_course',
      yield_quantity: 1,
      yield_unit: 'serving',
      prep_time_minutes: 0,
      cook_time_minutes: 0,
      ingredients: [],
      labor_time_minutes: 0,
      labor_rate_per_hour: 15,
      packaging_items: [],
      instructions: ''
    });
    setEditingRecipe(null);
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      name: recipe.name || '',
      description: recipe.description || '',
      category: recipe.category || 'main_course',
      yield_quantity: recipe.yield_quantity || 1,
      yield_unit: recipe.yield_unit || 'serving',
      prep_time_minutes: recipe.prep_time_minutes || 0,
      cook_time_minutes: recipe.cook_time_minutes || 0,
      ingredients: recipe.ingredients || [],
      labor_time_minutes: recipe.labor_time_minutes || 0,
      labor_rate_per_hour: recipe.labor_rate_per_hour || 15,
      packaging_items: recipe.packaging_items || [],
      instructions: recipe.instructions || ''
    });
    setDialogOpen(true);
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, {
        product_id: '',
        product_name: '',
        quantity: 0,
        unit: 'ea',
        unit_cost: 0,
        total_cost: 0
      }]
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index][field] = value;
    
    // Update product info from selection
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newIngredients[index].product_name = product.name;
        newIngredients[index].unit_cost = product.latest_price || 0;
        newIngredients[index].total_cost = newIngredients[index].quantity * (product.latest_price || 0);
      }
    }
    
    // Update total cost
    if (field === 'quantity' || field === 'unit_cost') {
      newIngredients[index].total_cost = 
        (newIngredients[index].quantity || 0) * (newIngredients[index].unit_cost || 0);
    }
    
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const removeIngredient = (index) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index)
    });
  };

  const addPackaging = () => {
    setFormData({
      ...formData,
      packaging_items: [...formData.packaging_items, {
        item_name: '',
        quantity: 1,
        unit_cost: 0,
        total_cost: 0
      }]
    });
  };

  const updatePackaging = (index, field, value) => {
    const newItems = [...formData.packaging_items];
    newItems[index][field] = value;
    newItems[index].total_cost = (newItems[index].quantity || 0) * (newItems[index].unit_cost || 0);
    setFormData({ ...formData, packaging_items: newItems });
  };

  const removePackaging = (index) => {
    setFormData({
      ...formData,
      packaging_items: formData.packaging_items.filter((_, i) => i !== index)
    });
  };

  const calculateCosts = () => {
    const ingredientCost = formData.ingredients.reduce((sum, i) => sum + (i.total_cost || 0), 0);
    const packagingCost = formData.packaging_items.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const laborCost = (formData.labor_time_minutes / 60) * formData.labor_rate_per_hour;
    const totalCost = ingredientCost + packagingCost + laborCost;
    const costPerServing = formData.yield_quantity > 0 ? totalCost / formData.yield_quantity : totalCost;

    return {
      ingredientCost,
      packagingCost,
      laborCost,
      totalCost,
      costPerServing
    };
  };

  const handleCalculateWithAI = async (recipe) => {
    setEditingRecipe(recipe);
    setCostDialogOpen(true);
    setCalculatingCost(true);

    try {
      const ingredientCost = (recipe.ingredients || []).reduce(
        (sum, i) => sum + (i.total_cost || 0),
        0
      );
      const packagingCost = (recipe.packaging_items || []).reduce(
        (sum, p) => sum + (p.total_cost || 0),
        0
      );
      const laborCost = ((recipe.labor_time_minutes || 0) / 60) * (recipe.labor_rate_per_hour || 0);
      const totalCost = ingredientCost + packagingCost + laborCost;
      const costPerServing = (recipe.yield_quantity || 1) > 0
        ? totalCost / (recipe.yield_quantity || 1)
        : totalCost;

      await updateMutation.mutateAsync({
        id: recipe.id,
        data: {
          total_cost: totalCost,
          cost_per_serving: costPerServing,
        },
      });
    } catch (error) {
      toast.error('Failed to calculate cost');
    } finally {
      setCalculatingCost(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Recipe name is required');
      return;
    }

    const costs = calculateCosts();
    const data = {
      ...formData,
      total_ingredient_cost: costs.ingredientCost,
      total_packaging_cost: costs.packagingCost,
      labor_cost: costs.laborCost,
      total_cost: costs.totalCost,
      cost_per_serving: costs.costPerServing
    };

    if (editingRecipe) {
      updateMutation.mutate({ id: editingRecipe.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = !search || r.name?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const costs = calculateCosts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recipes</h1>
          <p className="text-slate-500 mt-1">Manage recipes and calculate costs</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Recipe
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Recipes</p>
            <p className="text-2xl font-bold text-slate-900">{recipes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Avg Cost/Serving</p>
            <p className="text-2xl font-bold text-slate-900">
              ${(recipes.reduce((sum, r) => sum + (r.cost_per_serving || 0), 0) / (recipes.length || 1)).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Active</p>
            <p className="text-2xl font-bold text-slate-900">
              {recipes.filter(r => r.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Categories</p>
            <p className="text-2xl font-bold text-slate-900">
              {new Set(recipes.map(r => r.category)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="appetizer">Appetizer</SelectItem>
                <SelectItem value="main_course">Main Course</SelectItem>
                <SelectItem value="dessert">Dessert</SelectItem>
                <SelectItem value="beverage">Beverage</SelectItem>
                <SelectItem value="side">Side</SelectItem>
                <SelectItem value="sauce">Sauce</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recipes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-slate-500">Loading...</div>
        ) : filteredRecipes.length === 0 ? (
          <div className="col-span-full text-center py-8 text-slate-500">No recipes found</div>
        ) : (
          filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
                      <ChefHat className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{recipe.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {recipe.category?.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(recipe)}>
                        <Edit2 className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCalculateWithAI(recipe)}>
                        <Calculator className="h-4 w-4 mr-2" /> Calculate Cost
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteMutation.mutate(recipe.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock className="h-4 w-4" />
                    <span>{(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Users className="h-4 w-4" />
                    <span>{recipe.yield_quantity} {recipe.yield_unit}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Package className="h-4 w-4" />
                    <span>{recipe.ingredients?.length || 0} ingredients</span>
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-teal-600">
                    <DollarSign className="h-4 w-4" />
                    <span>${recipe.cost_per_serving?.toFixed(2) || '0.00'}/serving</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Recipe Form Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRecipe ? 'Edit Recipe' : 'Add Recipe'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Recipe Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter recipe name"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="appetizer">Appetizer</SelectItem>
                    <SelectItem value="main_course">Main Course</SelectItem>
                    <SelectItem value="dessert">Dessert</SelectItem>
                    <SelectItem value="beverage">Beverage</SelectItem>
                    <SelectItem value="side">Side</SelectItem>
                    <SelectItem value="sauce">Sauce</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Yield</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={formData.yield_quantity}
                    onChange={(e) => setFormData({ ...formData, yield_quantity: parseFloat(e.target.value) || 0 })}
                    className="w-20"
                  />
                  <Input
                    value={formData.yield_unit}
                    onChange={(e) => setFormData({ ...formData, yield_unit: e.target.value })}
                    placeholder="servings"
                  />
                </div>
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prep Time (min)</Label>
                <Input
                  type="number"
                  value={formData.prep_time_minutes}
                  onChange={(e) => setFormData({ ...formData, prep_time_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cook Time (min)</Label>
                <Input
                  type="number"
                  value={formData.cook_time_minutes}
                  onChange={(e) => setFormData({ ...formData, cook_time_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Ingredients */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Ingredients</Label>
                <Button variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {formData.ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select
                      value={ing.product_id}
                      onValueChange={(v) => updateIngredient(idx, 'product_id', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    className="w-20"
                  />
                  <Input
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-20"
                  />
                  <span className="text-sm text-slate-500 w-16">${ing.total_cost?.toFixed(2)}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeIngredient(idx)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Labor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Labor Time (min)</Label>
                <Input
                  type="number"
                  value={formData.labor_time_minutes}
                  onChange={(e) => setFormData({ ...formData, labor_time_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Labor Rate ($/hr)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.labor_rate_per_hour}
                  onChange={(e) => setFormData({ ...formData, labor_rate_per_hour: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Packaging */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Packaging Items</Label>
                <Button variant="outline" size="sm" onClick={addPackaging}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {formData.packaging_items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <Input
                    value={item.item_name}
                    onChange={(e) => updatePackaging(idx, 'item_name', e.target.value)}
                    placeholder="Item name"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updatePackaging(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    className="w-20"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={item.unit_cost}
                    onChange={(e) => updatePackaging(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                    placeholder="Cost"
                    className="w-24"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removePackaging(idx)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                placeholder="Step by step instructions..."
                rows={4}
              />
            </div>

            {/* Cost Summary */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold">Cost Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-500">Ingredients:</span>
                <span className="font-medium text-right">${costs.ingredientCost.toFixed(2)}</span>
                <span className="text-slate-500">Packaging:</span>
                <span className="font-medium text-right">${costs.packagingCost.toFixed(2)}</span>
                <span className="text-slate-500">Labor:</span>
                <span className="font-medium text-right">${costs.laborCost.toFixed(2)}</span>
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-right">${costs.totalCost.toFixed(2)}</span>
                <span className="font-semibold text-teal-600">Cost/Serving:</span>
                <span className="font-bold text-teal-600 text-right">${costs.costPerServing.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmit} className="flex-1 bg-teal-600 hover:bg-teal-700">
                {editingRecipe ? 'Update' : 'Create'} Recipe
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* AI Cost Dialog */}
      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Cost Estimation</DialogTitle>
          </DialogHeader>
          {calculatingCost ? (
            <div className="py-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-teal-500 mx-auto" />
              <p className="mt-4 text-slate-500">Calculating costs with AI...</p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-slate-500">Cost estimation complete for {editingRecipe?.name}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCostDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}