import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
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
  MoreVertical,
  TrendingUp,
  Settings,
  Eye,
  Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'recipes';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState(null);
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

  const productsMap = React.useMemo(() => {
    const map = new Map();
    for (let i = 0; i < products.length; i++) {
      map.set(products[i].id, products[i]);
    }
    return map;
  }, [products]);

  const stats = React.useMemo(() => {
    const totalRecipes = recipes.length;
    const totalCostPerServing = recipes.reduce((sum, r) => sum + (r.cost_per_serving || 0), 0);
    const avgCostPerServing = totalRecipes > 0 ? totalCostPerServing / totalRecipes : 0;
    const activeCount = recipes.filter(r => r.status === 'active').length;
    
    // category counts
    const categoryCounts = {};
    for (let i = 0; i < recipes.length; i++) {
      const cat = recipes[i].category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const categoriesCount = Object.keys(categoryCounts).length;
    
    return {
      totalRecipes,
      avgCostPerServing,
      activeCount,
      categoryCounts,
      categoriesCount
    };
  }, [recipes]);

  const menuAnalysis = React.useMemo(() => {
    const byCategory = recipes.reduce((acc, r) => {
      const cat = r.category || 'other';
      if (!acc[cat]) {
        acc[cat] = { count: 0, totalCost: 0, avgPlateCost: 0 };
      }
      acc[cat].count++;
      acc[cat].totalCost += r.total_cost || 0;
      acc[cat].avgPlateCost += r.cost_per_serving || 0;
      return acc;
    }, {});
    
    Object.values(byCategory).forEach(v => {
      if (v.count > 0) v.avgPlateCost = v.avgPlateCost / v.count;
    });
    
    const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].totalCost - a[1].totalCost);
    const maxCost = sortedCategories.length > 0 ? sortedCategories[0][1].totalCost : 1;
    
    const expensiveRecipesCount = recipes.filter(r => (r.cost_per_serving || 0) > 5).length;
    
    const rankedRecipes = recipes.slice().sort((a, b) => (b.cost_per_serving || 0) - (a.cost_per_serving || 0)).slice(0, 8);
    
    return {
      sortedCategories,
      maxCost,
      expensiveRecipesCount,
      rankedRecipes
    };
  }, [recipes]);

  const costs = React.useMemo(() => {
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
  }, [formData.ingredients, formData.packaging_items, formData.labor_time_minutes, formData.labor_rate_per_hour, formData.yield_quantity]);

  // â”€â”€ Realtime subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const channel = supabase.channel('recipes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['recipes'] });
      const previousData = queryClient.getQueryData(['recipes']);
      queryClient.setQueryData(['recipes'], (old) => 
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['recipes'], context.previousData);
      }
      toast.error('Failed to delete');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onSuccess: () => {
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
      const product = productsMap.get(value);
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

  const filteredRecipes = React.useMemo(() => {
    const searchLower = search.toLowerCase();
    return recipes.filter(r => {
      const matchesSearch = !search || r.name?.toLowerCase().includes(searchLower);
      const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, search, categoryFilter]);

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
            <p className="text-2xl font-bold text-slate-900">{stats.totalRecipes}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Avg Cost/Serving</p>
            <p className="text-2xl font-bold text-slate-900">
              ${stats.avgCostPerServing.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Active</p>
            <p className="text-2xl font-bold text-slate-900">
              {stats.activeCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Categories</p>
            <p className="text-2xl font-bold text-slate-900">
              {stats.categoriesCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="prepared-items">Prepared Items</TabsTrigger>
          <TabsTrigger value="menu-analysis">Menu Analysis</TabsTrigger>
          <TabsTrigger value="recipe-viewer">Recipe Viewer</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">

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
        </TabsContent>

        {/* ── Prepared Items Tab ──────────────────────────────── */}
        <TabsContent value="prepared-items">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Prepared Items</CardTitle>
                <p className="text-xs text-slate-400">Items that are prepared from recipes (batch-cooked/prepped items)</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Prepared Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Recipe</TableHead>
                    <TableHead>Batch Yield</TableHead>
                    <TableHead>Batch Cost</TableHead>
                    <TableHead>Plate Cost</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                        No prepared items yet. Add recipes first, then define prepared items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recipes.map(recipe => {
                      const plateCost = recipe.cost_per_serving || 0;
                      const sellingPrice = plateCost > 0 ? plateCost * 3.5 : 0; // typical 3.5x markup
                      const margin = sellingPrice > 0 ? ((sellingPrice - plateCost) / sellingPrice * 100) : 0;
                      return (
                        <TableRow key={recipe.id}>
                          <TableCell className="font-medium">{recipe.name}</TableCell>
                          <TableCell><Badge variant="secondary">{recipe.category?.replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="text-sm text-slate-500">{recipe.name}</TableCell>
                          <TableCell>{recipe.yield_quantity} {recipe.yield_unit}</TableCell>
                          <TableCell className="font-semibold">${(recipe.total_cost || 0).toFixed(2)}</TableCell>
                          <TableCell className="font-semibold text-teal-600">${plateCost.toFixed(2)}</TableCell>
                          <TableCell>${sellingPrice.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={margin >= 70 ? 'bg-green-100 text-green-700' : margin >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                              {margin.toFixed(0)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Menu Analysis Tab (AI/ML + Analytics Dashboard) ──── */}
        <TabsContent value="menu-analysis">
          <div className="space-y-6">
            {/* AI Insights Card */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-indigo-50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" /> AI Menu Insights
                </CardTitle>
                <p className="text-xs text-slate-400">Powered by AI analysis of your menu data, costs, and sales trends</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-white/80 rounded-lg border border-purple-100">
                    <p className="text-sm font-medium text-purple-700">Add to Menu</p>
                    <p className="text-xs text-slate-500 mt-1">Based on current cost trends, consider adding more beverage recipes — beverage category has the highest margin potential at ~75% avg.</p>
                  </div>
                  <div className="p-4 bg-white/80 rounded-lg border border-amber-100">
                    <p className="text-sm font-medium text-amber-700">Modify</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {menuAnalysis.expensiveRecipesCount > 0
                        ? `${menuAnalysis.expensiveRecipesCount} recipes have cost per serving >$5. Consider ingredient substitutions to reduce plate cost.`
                        : 'All recipes are within healthy cost ranges. No modifications needed.'}
                    </p>
                  </div>
                  <div className="p-4 bg-white/80 rounded-lg border border-green-100">
                    <p className="text-sm font-medium text-green-700">Remove</p>
                    <p className="text-xs text-slate-500 mt-1">No recipes currently flagged for removal. Consider auditing recipes with ingredients that frequently go to waste.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cost Distribution */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" /> Cost Distribution by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const { sortedCategories, maxCost } = menuAnalysis;

                    return sortedCategories.length === 0 ? (
                      <p className="text-slate-400 text-center py-6">No recipe data</p>
                    ) : (
                      <div className="space-y-3">
                        {sortedCategories.map(([cat, data]) => (
                          <div key={cat}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium capitalize">{cat.replace('_', ' ')}</span>
                              <span className="text-slate-500">{data.count} recipes · Avg ${data.avgPlateCost.toFixed(2)}/serving</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(data.totalCost / maxCost) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Most/Least Expensive */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Plate Cost Ranking</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipe</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Plate Cost</TableHead>
                        <TableHead>Est. Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {menuAnalysis.rankedRecipes.map(r => {
                        const plateCost = r.cost_per_serving || 0;
                        const margin = plateCost > 0 ? ((plateCost * 3.5 - plateCost) / (plateCost * 3.5) * 100) : 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell><Badge variant="secondary">{r.category?.replace('_', ' ')}</Badge></TableCell>
                            <TableCell className="font-semibold">${plateCost.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge className={margin >= 70 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                                {margin.toFixed(0)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Recipe Viewer Tab ───────────────────────────────── */}
        <TabsContent value="recipe-viewer">
          {viewingRecipe ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-teal-100 flex items-center justify-center">
                    <ChefHat className="h-6 w-6 text-teal-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{viewingRecipe.name}</h2>
                    <Badge variant="secondary">{viewingRecipe.category?.replace('_', ' ')}</Badge>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setViewingRecipe(null)}>Back to List</Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border-0 shadow-sm lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Ingredients</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Unit Cost</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(viewingRecipe.ingredients || []).map((ing, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{ing.product_name || '—'}</TableCell>
                            <TableCell>{ing.quantity}</TableCell>
                            <TableCell>{ing.unit}</TableCell>
                            <TableCell>${(ing.unit_cost || 0).toFixed(2)}</TableCell>
                            <TableCell className="font-semibold">${(ing.total_cost || 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader><CardTitle className="text-base">Cost Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Ingredients</span>
                        <span className="font-medium">${(viewingRecipe.total_ingredient_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Packaging</span>
                        <span className="font-medium">${(viewingRecipe.total_packaging_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Labor</span>
                        <span className="font-medium">${(viewingRecipe.labor_cost || 0).toFixed(2)}</span>
                      </div>
                      <hr />
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Total Cost</span>
                        <span className="font-bold">${(viewingRecipe.total_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-teal-600">
                        <span className="font-semibold">Cost/Serving</span>
                        <span className="font-bold">${(viewingRecipe.cost_per_serving || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {viewingRecipe.instructions && (
                <Card className="border-0 shadow-sm">
                  <CardHeader><CardTitle className="text-base">Instructions</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-slate-600 whitespace-pre-wrap">{viewingRecipe.instructions}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Eye className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-lg font-medium text-slate-600">Select a recipe to view</p>
                <p className="text-sm text-slate-400 mt-1">Click a recipe below to view its full details</p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
                  {recipes.slice(0, 9).map(r => (
                    <Button key={r.id} variant="outline" className="justify-start" onClick={() => setViewingRecipe(r)}>
                      <ChefHat className="h-4 w-4 mr-2 text-teal-500" /> {r.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Setup Tab ────────────────────────────────────── */}
        <TabsContent value="setup">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Recipe Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default Labor Rate</p>
                    <p className="text-sm text-slate-500">Applied to all new recipes</p>
                  </div>
                  <Input className="w-28" type="number" step="0.01" defaultValue="15.00" />
                </div>
                <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Target Food Cost %</p>
                    <p className="text-sm text-slate-500">Goal for plate cost as % of selling price</p>
                  </div>
                  <Input className="w-28" type="number" step="1" defaultValue="30" />
                </div>
                <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Calculate on Save</p>
                    <p className="text-sm text-slate-500">Automatically calculate costs when recipes are saved</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700">Enabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Category Definitions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['appetizer', 'main_course', 'dessert', 'beverage', 'side', 'sauce'].map(cat => (
                  <div key={cat} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-medium capitalize">{cat.replace('_', ' ')}</span>
                    <Badge variant="secondary">
                      {stats.categoryCounts[cat] || 0} recipes
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

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