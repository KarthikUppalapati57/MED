import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Activity, Star, HelpCircle, Frown, Link2, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MenuEngineering() {
  const { organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('matrix');
  
  const filterCb = React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]);
  
  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['menu-engineering', organization?.id, location?.id],
        queryFn: () => api.reports.getMenuEngineering(organization?.id),
        enabled: !!organization?.id
      },
      {
        queryKey: ['pos_items', organization?.id],
        queryFn: () => api.entities.PosItem.list(),
        select: filterCb,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['recipes', organization?.id],
        queryFn: () => api.entities.Recipe.list(),
        select: filterCb,
        enabled: !!organization?.id,
      },
      {
        queryKey: ['pos_menu_mapping', organization?.id],
        queryFn: () => api.entities.PosMenuMapping.list(),
        select: filterCb,
        enabled: !!organization?.id,
      }
    ]
  });

  const isLoadingMatrix = results[0].isLoading;
  const matrixData = results[0].data || [];
  
  const isLoadingPos = results[1].isLoading;
  const posItems = results[1].data || [];
  
  const isLoadingRecipes = results[2].isLoading;
  const recipes = results[2].data || [];
  
  const isLoadingMappings = results[3].isLoading;
  const mappings = results[3].data || [];

  const createMapping = useMutation({
    mutationFn: async (payload) => {
      return api.entities.PosMenuMapping.create({
        organization_id: organization.id,
        pos_item_id: payload.pos_item_id,
        recipe_id: payload.recipe_id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_menu_mapping', organization?.id] });
      toast.success("Mapping saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save mapping");
    }
  });

  const deleteMapping = useMutation({
    mutationFn: async (id) => {
      return api.entities.PosMenuMapping.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos_menu_mapping', organization?.id] });
      toast.success("Mapping removed");
    }
  });

  const analyzedData = useMemo(() => {
    if (!matrixData.length) return { items: [], avgVolume: 0, avgProfit: 0 };
    
    const totalVolume = matrixData.reduce((sum, item) => sum + Number(item.total_quantity_sold || 0), 0);
    const totalProfit = matrixData.reduce((sum, item) => sum + Number(item.total_profit || 0), 0);
    
    const avgVolume = totalVolume / matrixData.length;
    const avgProfit = totalProfit / matrixData.length;

    const items = matrixData.map(item => {
      const volume = Number(item.total_quantity_sold || 0);
      const profit = Number(item.total_profit || 0);
      let category = 'Dog'; 
      let icon = Frown;
      let colorClass = 'bg-resend-red/10 text-resend-red';
      
      if (volume >= avgVolume && profit >= avgProfit) {
        category = 'Star';
        icon = Star;
        colorClass = 'bg-resend-green/10 text-resend-green';
      } else if (volume >= avgVolume && profit < avgProfit) {
        category = 'Plowhorse';
        icon = Activity;
        colorClass = 'bg-resend-blue/10 text-resend-blue';
      } else if (volume < avgVolume && profit >= avgProfit) {
        category = 'Puzzle';
        icon = HelpCircle;
        colorClass = 'bg-resend-yellow/10 text-resend-yellow';
      }

      return {
        ...item,
        volume,
        profit,
        matrixCategory: category,
        MatrixIcon: icon,
        colorClass
      };
    }).sort((a, b) => b.profit - a.profit);

    return { items, avgVolume, avgProfit };
  }, [matrixData]);

  const isLoading = isLoadingMatrix || isLoadingPos || isLoadingRecipes || isLoadingMappings;

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-7 w-7 text-brand" /> Menu Engineering
        </h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Combine POS sales data with theoretical recipe costs.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start">
          <TabsTrigger value="matrix" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">PMIX Matrix</TabsTrigger>
          <TabsTrigger value="mapping" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">POS Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm glass-card border-border/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="p-3 bg-resend-green/10 rounded-full mb-3"><Star className="h-6 w-6 text-resend-green" /></div>
                <h3 className="font-bold text-lg text-foreground">Stars</h3>
                <p className="text-xs text-muted-foreground mt-1">High Profit, High Volume.</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm glass-card border-border/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="p-3 bg-resend-blue/10 rounded-full mb-3"><Activity className="h-6 w-6 text-resend-blue" /></div>
                <h3 className="font-bold text-lg text-foreground">Plowhorses</h3>
                <p className="text-xs text-muted-foreground mt-1">Low Profit, High Volume.</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm glass-card border-border/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="p-3 bg-resend-yellow/10 rounded-full mb-3"><HelpCircle className="h-6 w-6 text-resend-yellow" /></div>
                <h3 className="font-bold text-lg text-foreground">Puzzles</h3>
                <p className="text-xs text-muted-foreground mt-1">High Profit, Low Volume.</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm glass-card border-border/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col items-center text-center">
                <div className="p-3 bg-resend-red/10 rounded-full mb-3"><Frown className="h-6 w-6 text-resend-red" /></div>
                <h3 className="font-bold text-lg text-foreground">Dogs</h3>
                <p className="text-xs text-muted-foreground mt-1">Low Profit, Low Volume.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm glass-card border-border/50">
            <CardHeader>
              <CardTitle>PMIX Matrix Results</CardTitle>
              <CardDescription>Average Volume: {analyzedData.avgVolume.toFixed(1)} | Average Profit: ${analyzedData.avgProfit.toFixed(2)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Menu Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Quantity Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Total Profit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyzedData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No POS sales data mapped to recipes yet. Use the POS Mapping tab to map items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    analyzedData.items.map(item => (
                      <TableRow key={item.pos_item_id}>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{item.category}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{item.volume}</TableCell>
                        <TableCell className="text-right">${Number(item.total_revenue || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">${item.profit.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={item.colorClass + " border-0"}>
                            <item.MatrixIcon className="h-3 w-3 mr-1" />
                            {item.matrixCategory}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-6">
          <Card className="glass-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Link2 className="w-5 h-5 mr-2 text-brand" /> 
                Map POS Items to Recipes
              </CardTitle>
              <CardDescription>
                Link incoming POS sales data to your recipe catalog to automatically deplete theoretical inventory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>POS Item</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Linked Recipe</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No POS items synced yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    posItems.map(item => {
                      const mapping = mappings.find(m => m.pos_item_id === item.id);
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{item.pos_provider}</Badge></TableCell>
                          <TableCell>
                            {mapping ? (
                              <div className="flex items-center text-sm font-medium text-foreground bg-secondary/40 px-3 py-1.5 rounded-md w-fit border border-border/50">
                                {recipes.find(r => r.id === mapping.recipe_id)?.name || 'Unknown Recipe'}
                              </div>
                            ) : (
                              <Select
                                onValueChange={(val) => {
                                  if(val) createMapping.mutate({ pos_item_id: item.id, recipe_id: val });
                                }}
                              >
                                <SelectTrigger className="w-[250px]">
                                  <SelectValue placeholder="Select Recipe to link..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {recipes.map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {mapping && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => deleteMapping.mutate(mapping.id)}
                                disabled={deleteMapping.isPending}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Unlink
                              </Button>
                            )}
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
      </Tabs>
    </div>
  );
}
