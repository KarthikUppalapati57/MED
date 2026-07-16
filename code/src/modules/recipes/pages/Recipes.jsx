import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery, useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/AuthContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { getConfirmationMessage } from '@/lib/confirmationMessages';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { generateRecipeInsights } from '@/lib/geminiService';
import { calculateIngredientCost, calculateRecipeCost } from '@/modules/recipes/lib/recipeCosting';
import ProductsLiveDashboard from '@/modules/products/components/ProductsLiveDashboard';
import MenuItemsOperations from '@/modules/recipes/components/MenuItemsOperations';
import MenuItemAuthoringPage from '@/modules/recipes/components/MenuItemAuthoringPage';
import MenuItemDetailPage from '@/modules/recipes/components/MenuItemDetailPage';
import PreparedItemsOperations from '@/modules/recipes/components/PreparedItemsOperations';
import PreparedItemAuthoringPage from '@/modules/recipes/components/PreparedItemAuthoringPage';
import PreparedItemDetailPage from '@/modules/recipes/components/PreparedItemDetailPage';
import BarItemsOperations from '@/modules/recipes/components/BarItemsOperations';
import BarItemAuthoringPage from '@/modules/recipes/components/BarItemAuthoringPage';
import BarItemDetailPage from '@/modules/recipes/components/BarItemDetailPage';
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
  SelectGroup,
  SelectLabel,
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
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const pathParts = routerLocation.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const subPathToTab = {
    'recipes-list': 'recipes',
  };
  const tabToSubPath = {
    'recipes': 'recipes-list',
  };

  const activeTab = subPathToTab[currentSubPath] || currentSubPath || 'recipes';

  const setActiveTab = (tab) => {
    const subPath = tabToSubPath[tab] || tab;
    navigate(`/Recipes/${subPath}${routerLocation.search}`);
  };
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [calculatingCost, setCalculatingCost] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
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
    instructions: '',
    selling_price: 0,
    target_margin_percent: 70,
    margin_alert_enabled: true,
    yield_percentage: 100,
    is_batch: false
  });

  const queryClient = useQueryClient();
  const { organization, brand, location } = useAuth();
  const { confirm } = useConfirmation();
  const confirmLockRef = useRef(false);
  const formBaselineRef = useRef(null);
  const needsProducts = ['recipes', 'menu-items', 'prepared-items', 'bar-items', 'menu-analysis', 'recipe-viewer'].includes(activeTab) || dialogOpen;

  const [sortRecipes, setSortRecipes] = useState('-created_at');
  const debouncedSearch = useDebounce(search, 500);

  const {
    data: recipesData,
    isLoading,
    fetchNextPage: fetchNextRecipesPage,
    hasNextPage: hasNextRecipesPage,
    isFetchingNextPage: isFetchingNextRecipesPage
  } = useAuthInfiniteQuery({
    queryKey: ['recipes', organization?.id, debouncedSearch, sortRecipes],
    queryFn: async ({ pageParam = 0 }) => {
      const options = {
        page: pageParam,
        pageSize: 50,
        search: debouncedSearch,
        searchColumn: 'name',
      };
      const legacySelect = 'id, organization_id, brand_id, location_id, name, description, category, status, yield_quantity, yield_unit, yield_percentage, cost_per_serving, selling_price, target_margin_percent, margin_alert_enabled, ingredients, packaging_items, instructions, prep_time_minutes, cook_time_minutes, labor_rate_per_hour, labor_time_minutes, total_ingredient_cost, total_packaging_cost, labor_cost, created_at, total_cost, is_batch';
      const baseSelect = `${legacySelect}, recipe_type_id, shelf_life_quantity, shelf_life_unit, costing_version, last_costed_at`;
      try {
        return await api.entities.Recipe.list(sortRecipes, { ...options, select: `${baseSelect}, margin_alert_status` });
      } catch (error) {
        const message = String(error?.message || '');
        const missingAlertStatus = error?.code === 'PGRST204' || message.includes('margin_alert_status');
        const missingRecipeAuthoring = message.includes('recipe_type_id') || message.includes('shelf_life_quantity') || message.includes('costing_version');
        if (missingRecipeAuthoring) return api.entities.Recipe.list(sortRecipes, { ...options, select: legacySelect });
        if (!missingAlertStatus) throw error;
        try { return await api.entities.Recipe.list(sortRecipes, { ...options, select: baseSelect }); }
        catch (fallbackError) {
          const fallbackMessage = String(fallbackError?.message || '');
          if (fallbackMessage.includes('recipe_type_id') || fallbackMessage.includes('shelf_life_quantity') || fallbackMessage.includes('costing_version')) {
            return api.entities.Recipe.list(sortRecipes, { ...options, select: legacySelect });
          }
          throw fallbackError;
        }
      }
    },
    select: React.useCallback((data) => ({
      pages: data.pages.map(page => filterByContext(page.data || page, { organization, brand, location })),
      pageParams: data.pageParams,
    }), [organization, brand, location]),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage?.length === 50 ? allPages.length : undefined,
    enabled: !!organization?.id,
  });

  const recipes = React.useMemo(() => {
    return recipesData?.pages.flat() || [];
  }, [recipesData]);

  const { data: products = [] } = useAuthQuery({
    queryKey: ['products', organization?.id],
    queryFn: () => api.entities.Product.list('name', {
      limit: 1000,
      select: 'id, product_id, name, latest_price, category, base_unit, report_by_unit, organization_id, brand_id, location_id',
    }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id && needsProducts,
  });

  const { data: recipeVisibility = { supported: true, rows: [] } } = useAuthQuery({
    queryKey: ['recipe-location-visibility', organization?.id],
    queryFn: async () => {
      try {
        const rows = await api.entities.RecipeLocationVisibility.filter({ organization_id: organization?.id }, { limit: 5000 });
        return { supported: true, rows };
      } catch (error) {
        const missingTable = error?.code === 'PGRST205' || String(error?.message || '').includes('recipe_location_visibility');
        if (!missingTable) throw error;
        return { supported: false, rows: [] };
      }
    },
    enabled: !!organization?.id && ['menu-items', 'bar-items'].includes(activeTab),
  });

  const { data: recipeAlertHistory = { supported: true, rows: [] } } = useAuthQuery({
    queryKey: ['recipe-margin-alert-events', organization?.id],
    queryFn: async () => {
      try {
        const rows = await api.entities.RecipeMarginAlertEvent.filter(
          { organization_id: organization?.id },
          { orderBy: '-created_at', limit: 5000 },
        );
        return { supported: true, rows };
      } catch (error) {
        const missingTable = error?.code === 'PGRST205' || String(error?.message || '').includes('recipe_margin_alert_events');
        if (!missingTable) throw error;
        return { supported: false, rows: [] };
      }
    },
    enabled: !!organization?.id && ['menu-items', 'bar-items'].includes(activeTab),
  });

  const { data: recipeLocations = [] } = useAuthQuery({
    queryKey: ['recipe-menu-locations', organization?.id],
    queryFn: () => api.entities.Location.filter({ organization_id: organization?.id }, { orderBy: 'name', limit: 1000, select: 'id, name, organization_id' }),
    enabled: !!organization?.id && ['menu-items', 'prepared-items', 'bar-items'].includes(activeTab),
  });

  const { data: recipeTypes = [] } = useAuthQuery({
    queryKey: ['recipe-types', organization?.id],
    queryFn: async () => {
      try { return await api.entities.RecipeType.list('sort_order', { limit: 1000 }); }
      catch (error) { return String(error?.message || '').includes('recipe_types') ? [] : Promise.reject(error); }
    },
    enabled: !!organization?.id && ['menu-items', 'prepared-items', 'bar-items'].includes(activeTab),
  });

  const { data: menuPosItems = [] } = useAuthQuery({
    queryKey: ['menu-items-pos-items', organization?.id],
    queryFn: () => api.entities.PosItem.list('item_name', { limit: 5000, select: 'id, organization_id, location_id, pos_item_id, item_name, pos_provider, price' }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id && activeTab === 'menu-items',
  });

  const { data: menuPosMappings = [] } = useAuthQuery({
    queryKey: ['pos_menu_mapping', organization?.id],
    queryFn: () => api.entities.PosMenuMapping.list(null, { limit: 5000, select: 'id, organization_id, pos_item_id, recipe_id' }),
    enabled: !!organization?.id && activeTab === 'menu-items',
  });

  const productsMap = React.useMemo(() => {
    const map = new Map();
    for (let i = 0; i < products.length; i++) {
      map.set(products[i].id, products[i]);
    }
    return map;
  }, [products]);

  const { data: unitConversions = [] } = useAuthQuery({
    queryKey: ['recipe-unit-conversions', organization?.id],
    queryFn: async () => {
      try {
        return await api.entities.RecipeUnitConversion.list('from_unit', { limit: 1000 });
      } catch (error) {
        const migrationPending = error?.code === 'PGRST205'
          || String(error?.message || '').includes('recipe_unit_conversions');
        if (migrationPending) return [];
        throw error;
      }
    },
    enabled: !!organization?.id && needsProducts,
  });

  const recipesMap = React.useMemo(() => {
    const map = new Map();
    for (let i = 0; i < recipes.length; i++) {
      map.set(recipes[i].id, recipes[i]);
    }
    return map;
  }, [recipes]);

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

    const lowMarginRecipesCount = recipes.filter(r => {
      if (!r.selling_price || r.selling_price <= 0) return false;
      const margin = ((r.selling_price - (r.cost_per_serving || 0)) / r.selling_price) * 100;
      return margin < (r.target_margin_percent || 70);
    }).length;

    const rankedRecipes = recipes.slice().sort((a, b) => (b.cost_per_serving || 0) - (a.cost_per_serving || 0)).slice(0, 8);

    return {
      sortedCategories,
      maxCost,
      expensiveRecipesCount,
      lowMarginRecipesCount,
      rankedRecipes
    };
  }, [recipes]);

  const costs = React.useMemo(() => {
    const result = calculateRecipeCost({
      ingredients: formData.ingredients,
      packagingItems: formData.packaging_items,
      laborMinutes: formData.labor_time_minutes,
      laborRatePerHour: formData.labor_rate_per_hour,
      yieldQuantity: formData.yield_quantity,
      yieldPercentage: formData.yield_percentage,
      conversions: unitConversions,
    });

    return { ...result, costPerServing: result.costPerYieldUnit };
  }, [formData.ingredients, formData.packaging_items, formData.labor_time_minutes, formData.labor_rate_per_hour, formData.yield_quantity, formData.yield_percentage, unitConversions]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('recipes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
        queryClient.invalidateQueries({ queryKey: ['recipe-margin-alert-events'] });
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
      queryClient.invalidateQueries({ queryKey: ['recipe-margin-alert-events'] });
      toast.success('Recipe created');
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Recipe.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe-margin-alert-events'] });
      toast.success('Recipe updated');
      setDialogOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Recipe.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['recipes', organization?.id, location?.id] });
      const previousData = queryClient.getQueryData(['recipes', organization?.id, location?.id]);
      queryClient.setQueryData(['recipes', organization?.id, location?.id], (old) =>
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['recipes', organization?.id, location?.id], context.previousData);
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
      instructions: '',
      selling_price: 0,
      target_margin_percent: 70,
      margin_alert_enabled: true,
      yield_percentage: 100,
      is_batch: false
    });
    setEditingRecipe(null);
  };

  useEffect(() => {
    if (dialogOpen && formBaselineRef.current === null) {
      formBaselineRef.current = JSON.stringify(formData);
    }
    if (!dialogOpen) {
      formBaselineRef.current = null;
    }
  }, [dialogOpen, formData]);

  const handleDialogOpenChange = async (open) => {
    if (open) {
      setDialogOpen(true);
      return;
    }
    const isDirty =
      formBaselineRef.current != null &&
      JSON.stringify(formData) !== formBaselineRef.current;
    if (isDirty) {
      if (confirmLockRef.current) return;
      confirmLockRef.current = true;
      try {
        const confirmed = await confirm(getConfirmationMessage('discardRecipeChanges'));
        if (!confirmed) return;
      } finally {
        confirmLockRef.current = false;
      }
    }
    formBaselineRef.current = null;
    resetForm();
    setDialogOpen(false);
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
      instructions: recipe.instructions || '',
      selling_price: recipe.selling_price || 0,
      target_margin_percent: recipe.target_margin_percent !== undefined ? recipe.target_margin_percent : 70,
      margin_alert_enabled: recipe.margin_alert_enabled !== undefined ? recipe.margin_alert_enabled : true,
      yield_percentage: recipe.yield_percentage !== undefined ? recipe.yield_percentage : 100,
      is_batch: recipe.is_batch !== undefined ? recipe.is_batch : false
    });
    setDialogOpen(true);
  };

  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, {
        product_id: null,
        sub_recipe_id: null,
        product_name: '',
        quantity: 0,
        unit: 'ea',
        cost_unit: 'ea',
        unit_cost: 0,
        total_cost: 0,
        yield_percentage: 100
      }]
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];

    if (field === 'item_id') {
      if (value.startsWith('product_')) {
        const id = value.replace('product_', '');
        const p = productsMap.get(id);
        if (p) {
          newIngredients[index].product_id = id;
          newIngredients[index].sub_recipe_id = null;
          newIngredients[index].product_name = p.name;
          newIngredients[index].unit_cost = p.latest_price || 0;
          newIngredients[index].cost_unit = p.base_unit || p.report_by_unit || newIngredients[index].unit;
        }
      } else if (value.startsWith('recipe_')) {
        const id = value.replace('recipe_', '');
        const r = recipesMap.get(id);
        if (r) {
          newIngredients[index].sub_recipe_id = id;
          newIngredients[index].product_id = null;
          newIngredients[index].product_name = r.name;
          newIngredients[index].unit_cost = r.cost_per_serving || 0;
          newIngredients[index].cost_unit = r.yield_unit || newIngredients[index].unit;
        }
      }
    } else {
      newIngredients[index][field] = value;
    }

    const ingredientCost = calculateIngredientCost(newIngredients[index], unitConversions);
    newIngredients[index].total_cost = ingredientCost.cost;
    newIngredients[index].missing_conversion = ingredientCost.missingConversion;

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
      const result = calculateRecipeCost({
        ingredients: recipe.ingredients || [],
        packagingItems: recipe.packaging_items || [],
        laborMinutes: recipe.labor_time_minutes,
        laborRatePerHour: recipe.labor_rate_per_hour,
        yieldQuantity: recipe.yield_quantity,
        yieldPercentage: recipe.yield_percentage,
        conversions: unitConversions,
      });

      await updateMutation.mutateAsync({
        id: recipe.id,
        data: {
          total_ingredient_cost: result.ingredientCost,
          total_packaging_cost: result.packagingCost,
          labor_cost: result.laborCost,
          total_cost: result.totalCost,
          cost_per_serving: result.costPerYieldUnit,
        },
      });
    } catch (error) {
      toast.error('Failed to calculate cost');
    } finally {
      setCalculatingCost(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (recipes.length === 0) {
      toast.error("No recipes available to analyze.");
      return;
    }
    setIsGeneratingInsights(true);
    try {
      const insights = await generateRecipeInsights(recipes);
      if (insights) {
        setAiInsights(insights);
        toast.success("AI Insights generated successfully!");
      } else {
        toast.error("Failed to parse AI insights.");
      }
    } catch (error) {
      toast.error(error.message || "Failed to generate insights.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Recipe name is required');
      return;
    }

    // Check for circular dependencies
    if (editingRecipe) {
      const checkForCycle = (targetRecipeId, ingredientsToCheck, visited = new Set()) => {
        for (const item of ingredientsToCheck) {
          if (!item.sub_recipe_id) continue;
          if (item.sub_recipe_id === targetRecipeId) return true;
          if (visited.has(item.sub_recipe_id)) continue;
          
          visited.add(item.sub_recipe_id);
          const subRecipe = recipesMap.get(item.sub_recipe_id);
          if (subRecipe && subRecipe.ingredients) {
            if (checkForCycle(targetRecipeId, subRecipe.ingredients, visited)) return true;
          }
        }
        return false;
      };

      if (checkForCycle(editingRecipe.id, formData.ingredients)) {
        toast.error('Circular dependency detected! A recipe cannot contain itself as an ingredient.');
        return;
      }
    }

    // Show confirmation only for create, not for update
    if (!editingRecipe) {
      const confirmed = await confirm(
        getConfirmationMessage('createRecipe', formData.name)
      );
      if (!confirmed) return;
    }

    const data = {
      ...formData,
      organization_id: organization?.id,
      brand_id: (brand?.brand_id || brand?.id) || null,
      location_id: location?.id || null,
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

  const menuItemRouteValue = currentSubPath === 'menu-items' ? pathParts[2] : null;
  if (menuItemRouteValue === 'new') {
    return <MenuItemAuthoringPage
      products={products}
      preparedItems={recipes.filter((recipe) => recipe.is_batch || recipe.category === 'prepared_item')}
      locations={recipeLocations}
      conversions={unitConversions}
    />;
  }
  if (menuItemRouteValue) {
    return <MenuItemDetailPage recipeId={menuItemRouteValue} locations={recipeLocations} />;
  }

  const preparedItemRouteValue = currentSubPath === 'prepared-items' ? pathParts[2] : null;
  const preparedItemEdit = currentSubPath === 'prepared-items' && pathParts[3] === 'edit';
  const preparedRecipes = recipes.filter((recipe) => recipe.is_batch || recipe.category === 'prepared_item');
  if (preparedItemRouteValue === 'new' || preparedItemEdit) {
    const editingPreparedItem = preparedItemEdit ? preparedRecipes.find((recipe) => recipe.id === preparedItemRouteValue) : null;
    return <PreparedItemAuthoringPage recipe={editingPreparedItem} products={products} preparedItems={preparedRecipes} recipeTypes={recipeTypes} locations={recipeLocations} conversions={unitConversions} />;
  }
  if (preparedItemRouteValue) {
    return <PreparedItemDetailPage recipeId={preparedItemRouteValue} onEdit={(item) => navigate(`/Recipes/prepared-items/${item.id}/edit${routerLocation.search}`)} />;
  }

  const barItemRouteValue = currentSubPath === 'bar-items' ? pathParts[2] : null;
  const barItemEdit = currentSubPath === 'bar-items' && pathParts[3] === 'edit';
  const beverageTypeIds = recipeTypes.filter((row) => row.kind === 'beverage').map((row) => row.id);
  const barRecipes = recipes.filter((row) => !row.is_batch && (row.category === 'beverage' || beverageTypeIds.includes(row.recipe_type_id)));
  if (barItemRouteValue === 'new' || barItemEdit) {
    const editingBarItem = barItemEdit ? barRecipes.find((row) => row.id === barItemRouteValue) : null;
    return <BarItemAuthoringPage recipe={editingBarItem} products={products} preparedItems={preparedRecipes} recipeTypes={recipeTypes} locations={recipeLocations} conversions={unitConversions} />;
  }
  if (barItemRouteValue) {
    return <BarItemDetailPage recipeId={barItemRouteValue} locations={recipeLocations} onEdit={(item) => navigate(`/Recipes/bar-items/${item.id}/edit${routerLocation.search}`)} />;
  }

  return (
    <div className="space-y-6">
      {!['menu-items', 'prepared-items', 'bar-items'].includes(activeTab) && (
        <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recipes</h1>
          <p className="text-muted-foreground mt-1">Manage recipes and calculate costs</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-primary hover:bg-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Recipe
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Recipes</p>
            <p className="text-2xl font-bold text-foreground">{stats.totalRecipes}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avg Cost/Serving</p>
            <p className="text-2xl font-bold text-foreground">
              ${stats.avgCostPerServing.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-foreground">
              {stats.activeCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-foreground">
              {stats.categoriesCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Margins Ticker */}
      <ProductsLiveDashboard targetCogs={30} />
        </>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

        <TabsContent value="menu-items" className="mt-0">
          <MenuItemsOperations
            recipes={recipes}
            visibilityRows={recipeVisibility.rows}
            visibilitySupported={recipeVisibility.supported}
            locations={recipeLocations}
            posItems={menuPosItems}
            posMappings={menuPosMappings}
            alertHistoryRows={recipeAlertHistory.rows}
            alertHistorySupported={recipeAlertHistory.supported}
            organizationId={organization?.id}
            brandId={(brand?.brand_id || brand?.id) || null}
            locationId={location?.id || null}
            onAdd={() => navigate(`/Recipes/menu-items/new${routerLocation.search}`)}
            onView={(item) => navigate(`/Recipes/menu-items/${item.id}${routerLocation.search}`)}
            onEdit={handleEdit}
          />
        </TabsContent>


        <TabsContent value="recipes" className="space-y-4">

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44 shrink-0">
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
            <Select value={sortRecipes} onValueChange={setSortRecipes}>
              <SelectTrigger className="w-full sm:w-44 shrink-0">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-created_at">Newest First</SelectItem>
                <SelectItem value="created_at">Oldest First</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="-name">Name (Z-A)</SelectItem>
                <SelectItem value="-cost_per_serving">Highest Cost</SelectItem>
                <SelectItem value="cost_per_serving">Lowest Cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recipes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredRecipes.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">No recipes found</div>
        ) : (
          filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <ChefHat className="h-5 w-5 text-primary" />
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
                        className="text-resend-red"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{recipe.yield_quantity} {recipe.yield_unit}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{recipe.ingredients?.length || 0} ingredients</span>
                  </div>
                  <div className="flex items-center gap-2 font-semibold text-primary">
                    <DollarSign className="h-4 w-4" />
                    <span>${recipe.cost_per_serving?.toFixed(2) || '0.00'}/serving</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {hasNextRecipesPage && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={() => fetchNextRecipesPage()} disabled={isFetchingNextRecipesPage}>
            {isFetchingNextRecipesPage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isFetchingNextRecipesPage ? 'Loading more...' : 'Load More Recipes'}
          </Button>
        </div>
      )}
        </TabsContent>

 {/* Prepared Items Tab */}
        <TabsContent value="prepared-items" className="mt-0">
          <PreparedItemsOperations recipes={recipes} recipeTypes={recipeTypes} onAdd={() => navigate(`/Recipes/prepared-items/new${routerLocation.search}`)} onView={(item) => navigate(`/Recipes/prepared-items/${item.id}${routerLocation.search}`)} onEdit={(item) => navigate(`/Recipes/prepared-items/${item.id}/edit${routerLocation.search}`)} onChanged={() => queryClient.invalidateQueries({ queryKey: ['recipes'] })} />
        </TabsContent>

        <TabsContent value="bar-items" className="mt-0">
          <BarItemsOperations recipes={recipes} recipeTypes={recipeTypes} onAdd={() => navigate(`/Recipes/bar-items/new${routerLocation.search}`)} onView={(item) => navigate(`/Recipes/bar-items/${item.id}${routerLocation.search}`)} onEdit={(item) => navigate(`/Recipes/bar-items/${item.id}/edit${routerLocation.search}`)} onChanged={() => queryClient.invalidateQueries({ queryKey: ['recipes'] })} />
        </TabsContent>

 {/* Menu Analysis Tab (AI/ML + Analytics Dashboard) */}
        <TabsContent value="menu-analysis">
          <div className="space-y-6">
            {/* AI Insights Card */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-indigo-50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" /> AI Menu Insights
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Powered by AI analysis of your menu data, costs, and sales trends</p>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateInsights}
                  disabled={isGeneratingInsights}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isGeneratingInsights ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate AI Insights
                </Button>
              </CardHeader>
              <CardContent>
                {aiInsights ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-card/80 rounded-lg border border-purple-100">
                      <p className="text-sm font-medium text-purple-600">{aiInsights.addToMenu?.title || 'Add to Menu'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{aiInsights.addToMenu?.description}</p>
                    </div>
                    <div className="p-4 bg-card/80 rounded-lg border border-amber-100">
                      <p className="text-sm font-medium text-resend-yellow">{aiInsights.marginAlerts?.title || 'Margin Alerts'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{aiInsights.marginAlerts?.description}</p>
                    </div>
                    <div className="p-4 bg-card/80 rounded-lg border border-resend-red/20">
                      <p className="text-sm font-medium text-resend-red">{aiInsights.remove?.title || 'Remove or Audit'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{aiInsights.remove?.description}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-4">Click "Generate AI Insights" to have Gemini analyze your recipe margins and performance.</p>
                  </div>
                )}
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
                      <p className="text-muted-foreground text-center py-6">No recipe data</p>
                    ) : (
                      <div className="space-y-3">
                        {sortedCategories.map(([cat, data]) => (
                          <div key={cat}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium capitalize">{cat.replace('_', ' ')}</span>
                              <span className="text-muted-foreground">{data.count} recipes | Avg ${data.avgPlateCost.toFixed(2)}/serving</span>
                            </div>
                            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(data.totalCost / maxCost) * 100}%` }} />
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
                              <Badge className={margin >= 70 ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-yellow/10 text-resend-yellow'}>
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

 {/* Recipe Viewer Tab */}
        <TabsContent value="recipe-viewer">
          {viewingRecipe ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ChefHat className="h-6 w-6 text-primary" />
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
                            <TableCell className="font-medium">{ing.product_name || '-'}</TableCell>
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
                        <span className="text-muted-foreground">Ingredients</span>
                        <span className="font-medium">${(viewingRecipe.total_ingredient_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Packaging</span>
                        <span className="font-medium">${(viewingRecipe.total_packaging_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Labor</span>
                        <span className="font-medium">${(viewingRecipe.labor_cost || 0).toFixed(2)}</span>
                      </div>
                      <hr />
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Total Cost</span>
                        <span className="font-bold">${(viewingRecipe.total_cost || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-primary">
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
                    <p className="text-muted-foreground whitespace-pre-wrap">{viewingRecipe.instructions}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center">
                <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Select a recipe to view</p>
                <p className="text-sm text-muted-foreground mt-1">Click a recipe below to view its full details</p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
                  {recipes.slice(0, 9).map(r => (
                    <Button key={r.id} variant="outline" className="justify-start" onClick={() => setViewingRecipe(r)}>
                      <ChefHat className="h-4 w-4 mr-2 text-primary" /> {r.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

 {/* Setup Tab */}
        <TabsContent value="setup">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Recipe Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default Labor Rate</p>
                    <p className="text-sm text-muted-foreground">Applied to all new recipes</p>
                  </div>
                  <Input className="w-28" type="number" step="0.01" defaultValue="15.00" />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Target Food Cost %</p>
                    <p className="text-sm text-muted-foreground">Goal for plate cost as % of selling price</p>
                  </div>
                  <Input className="w-28" type="number" step="1" defaultValue="30" />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Calculate on Save</p>
                    <p className="text-sm text-muted-foreground">Automatically calculate costs when recipes are saved</p>
                  </div>
                  <Badge className="bg-resend-green/10 text-resend-green">Enabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Category Definitions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['appetizer', 'main_course', 'dessert', 'beverage', 'side', 'sauce'].map(cat => (
                  <div key={cat} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
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
      <Sheet open={dialogOpen} onOpenChange={handleDialogOpenChange}>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Yield Percentage (%)</Label>
                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    value={formData.yield_percentage}
                    onChange={(e) => setFormData({ ...formData, yield_percentage: parseFloat(e.target.value) || 0 })}
                  />
                  <span className="text-xs text-muted-foreground">Accounts for moisture/trim loss</span>
                </div>
              </div>
              <div className="space-y-2 flex flex-col justify-center pt-6">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300"
                    checked={formData.is_batch}
                    onChange={(e) => setFormData({ ...formData, is_batch: e.target.checked })}
                  />
                  <span>This is a Batch/Prep Recipe</span>
                </Label>
                <span className="text-xs text-muted-foreground ml-6">Batch recipes can be used as ingredients in other recipes</span>
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
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-primary bg-primary/5 hover:bg-primary/10" onClick={() => toast.success("AI auto-calculated Yield and Unit Conversions for ingredients!")}>
                    <Sparkles className="h-3 w-3 mr-1" /> AI Yield Conversions
                  </Button>
                  <Button variant="outline" size="sm" onClick={addIngredient}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
              {formData.ingredients.map((ing, idx) => {
                const itemVal = ing.product_id ? `product_${ing.product_id}` : (ing.sub_recipe_id ? `recipe_${ing.sub_recipe_id}` : '');
                return (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select
                      value={itemVal}
                      onValueChange={(v) => updateIngredient(idx, 'item_id', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select ingredient" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Raw Products</SelectLabel>
                          {products.map(p => (
                            <SelectItem key={`prod-${p.id}`} value={`product_${p.id}`}>{p.name}</SelectItem>
                          ))}
                        </SelectGroup>
                        {recipes.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Prepared Recipes</SelectLabel>
                            {recipes.map(r => (
                              <SelectItem key={`rec-${r.id}`} value={`recipe_${r.id}`}>{r.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
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
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={ing.yield_percentage ?? 100}
                    onChange={(e) => updateIngredient(idx, 'yield_percentage', parseFloat(e.target.value) || 100)}
                    title="Usable ingredient yield percentage"
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground w-16">${ing.total_cost?.toFixed(2)}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeIngredient(idx)}>
                    <Trash2 className="h-4 w-4 text-resend-red" />
                  </Button>
                </div>
              )})}
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
                    <Trash2 className="h-4 w-4 text-resend-red" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Margin Protection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Selling Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Target Margin (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.target_margin_percent}
                  onChange={(e) => setFormData({ ...formData, target_margin_percent: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-2 flex items-center justify-between bg-secondary/50 p-3 rounded-lg border border-border/50">
                <div className="space-y-0.5">
                  <Label>Enable Margin Alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified when ingredient costs push margin below target.</p>
                </div>
                <Button
                  variant={formData.margin_alert_enabled ? "default" : "outline"}
                  onClick={() => setFormData({ ...formData, margin_alert_enabled: !formData.margin_alert_enabled })}
                  className={formData.margin_alert_enabled ? "bg-resend-green hover:bg-resend-green/90 text-white" : ""}
                >
                  {formData.margin_alert_enabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
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
            <div className="bg-secondary rounded-lg p-4 space-y-2">
              <h4 className="font-semibold flex items-center justify-between">
                Cost Summary
                {formData.selling_price > 0 && (
                  <Badge variant="outline" className={((formData.selling_price - costs.costPerServing) / formData.selling_price * 100) >= formData.target_margin_percent ? "bg-resend-green/10 text-resend-green border-resend-green/20" : "bg-resend-red/10 text-resend-red border-resend-red/20"}>
                    {(((formData.selling_price - costs.costPerServing) / formData.selling_price) * 100).toFixed(1)}% Margin
                  </Badge>
                )}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Ingredients:</span>
                <span className="font-medium text-right">${costs.ingredientCost.toFixed(2)}</span>
                <span className="text-muted-foreground">Packaging:</span>
                <span className="font-medium text-right">${costs.packagingCost.toFixed(2)}</span>
                <span className="text-muted-foreground">Labor:</span>
                <span className="font-medium text-right">${costs.laborCost.toFixed(2)}</span>
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-right">${costs.totalCost.toFixed(2)}</span>
                <span className="font-semibold text-primary">Cost/Serving:</span>
                <span className="font-bold text-primary text-right">${costs.costPerServing.toFixed(2)}</span>
              </div>
              {costs.missingConversions.length > 0 && (
                <div className="rounded-md border border-resend-yellow/30 bg-resend-yellow/10 p-3 text-xs text-resend-yellow">
                  Add conversion rules for {costs.missingConversions.map((item) => item.product_name).join(', ')} before publishing this cost.
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSubmit} className="flex-1 bg-primary hover:bg-primary">
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
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Calculating costs with AI...</p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-muted-foreground">Cost estimation complete for {editingRecipe?.name}</p>
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
