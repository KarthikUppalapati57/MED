import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Package, Store, Smartphone, ExternalLink, PowerOff, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DeliveryAggregator() {
  const { organization, location } = useAuth();
  const queryClient = useQueryClient();

  const { data: channels = [], isLoading: loadingChannels } = useQuery({
    queryKey: ['delivery_channels', location?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_channels')
        .select('*')
        .eq('location_id', location?.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!location?.id
  });

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ['recipes', organization?.id],
    queryFn: () => api.entities.Recipe.filter({ organization_id: organization?.id, category: 'Menu Item' }),
    enabled: !!organization?.id
  });

  const syncMenuMutation = useMutation({
    mutationFn: async ({ recipe_id, action }) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-delivery-menus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          location_id: location.id,
          recipe_id,
          action
        })
      });
      
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    }
  });

  const handle86Item = (recipeId) => {
    toast.promise(syncMenuMutation.mutateAsync({ recipe_id: recipeId, action: '86_item' }), {
      loading: 'Pushing out-of-stock update to delivery partners...',
      success: 'Item successfully 86\'d across all channels!',
      error: 'Failed to update delivery platforms.'
    });
  };

  const activeChannels = channels.filter(c => c.is_active);

  if (!organization || !location) return null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Delivery Aggregator</h1>
          <p className="text-muted-foreground mt-1">Publish menu updates and manage stock across 3rd-party platforms</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Smartphone className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-bold text-orange-900">DoorDash</p>
                <p className="text-sm text-orange-700">Store ID: {channels.find(c => c.provider === 'doordash')?.store_id || 'Not Connected'}</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white">
              {channels.find(c => c.provider === 'doordash')?.is_active ? 'Active' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Store className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-green-900">UberEats</p>
                <p className="text-sm text-green-700">Store ID: {channels.find(c => c.provider === 'ubereats')?.store_id || 'Not Connected'}</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white">
              {channels.find(c => c.provider === 'ubereats')?.is_active ? 'Active' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Package className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-red-900">Grubhub</p>
                <p className="text-sm text-red-700">Store ID: {channels.find(c => c.provider === 'grubhub')?.store_id || 'Not Connected'}</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white">
              {channels.find(c => c.provider === 'grubhub')?.is_active ? 'Active' : 'Offline'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu Sync Status</CardTitle>
          <CardDescription>Manage menu items across {activeChannels.length} active delivery platforms</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRecipes ? (
            <p className="text-muted-foreground text-sm">Loading menu items...</p>
          ) : activeChannels.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              Please connect at least one delivery platform in Integrations to enable menu sync.
            </div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No menu items defined. Create recipes with the category "Menu Item".
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Menu Item</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Delivery Status</TableHead>
                  <TableHead className="text-right">Omnichannel Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipes.map(recipe => (
                  <TableRow key={recipe.id}>
                    <TableCell className="font-semibold">{recipe.name}</TableCell>
                    <TableCell>${Number(recipe.target_price || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className="bg-teal-50 text-teal-700 border-teal-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        In Stock ({activeChannels.length} channels)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => syncMenuMutation.mutate({ recipe_id: recipe.id, action: 'price_update' })}
                          disabled={syncMenuMutation.isPending}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" /> Push Price Update
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handle86Item(recipe.id)}
                          disabled={syncMenuMutation.isPending}
                        >
                          <PowerOff className="w-4 h-4 mr-1" /> "86" Everywhere
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
