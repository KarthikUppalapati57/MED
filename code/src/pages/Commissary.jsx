import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Store, ArrowRightLeft, Plus, CheckCircle, Clock, Search, XCircle, FileText } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { filterByContext } from '@/lib/contextUtils';

export default function Commissary() {
  const { organization, location, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('orders');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);

  // Fetch all locations to identify the commissary
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').eq('organization_id', organization?.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  const commissaryLocation = locations.find(l => l.is_commissary);
  const isCurrentLocationCommissary = location?.is_commissary;

  // Fetch transfers
  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['intercompany_transfers', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intercompany_transfers')
        .select(`
          *,
          from_location:locations!intercompany_transfers_from_location_id_fkey(name),
          to_location:locations!intercompany_transfers_to_location_id_fkey(name)
        `)
        .eq('organization_id', organization?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  // Fetch recipes/products available to order from commissary
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('recipes').select('*').eq('organization_id', organization?.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id
  });

  const batchRecipes = recipes.filter(r => r.is_batch);

  const [orderItems, setOrderItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(1);

  const addItemToOrder = () => {
    if (!selectedItem) return;
    const recipe = batchRecipes.find(r => r.id === selectedItem);
    if (!recipe) return;

    const existing = orderItems.find(i => i.recipe_id === recipe.id);
    if (existing) {
      setOrderItems(orderItems.map(i => i.recipe_id === recipe.id ? { ...i, quantity: i.quantity + orderQuantity, total_cost: (i.quantity + orderQuantity) * i.unit_cost } : i));
    } else {
      setOrderItems([...orderItems, {
        recipe_id: recipe.id,
        name: recipe.name,
        quantity: orderQuantity,
        unit: recipe.yield_unit || 'batch',
        unit_cost: recipe.cost_per_serving || recipe.total_cost || 0,
        total_cost: orderQuantity * (recipe.cost_per_serving || recipe.total_cost || 0)
      }]);
    }
    setSelectedItem('');
    setOrderQuantity(1);
  };

  const removeOrderItem = (index) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const submitOrderMutation = useMutation({
    mutationFn: async () => {
      if (!commissaryLocation) throw new Error("No commissary location configured for this organization.");
      if (!location) throw new Error("You must be operating under a specific location to place an order.");
      
      const total = orderItems.reduce((sum, item) => sum + item.total_cost, 0);
      
      const { error } = await supabase.from('intercompany_transfers').insert({
        organization_id: organization.id,
        from_location_id: commissaryLocation.id,
        to_location_id: location.id,
        items_json: orderItems,
        total_amount: total,
        status: 'pending'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['intercompany_transfers']);
      toast.success("Order submitted to Commissary");
      setIsOrderModalOpen(false);
      setOrderItems([]);
    },
    onError: (err) => toast.error(err.message)
  });

  const fulfillOrderMutation = useMutation({
    mutationFn: async (transferId) => {
      const { error } = await supabase.from('intercompany_transfers').update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
        fulfilled_by: userProfile?.id
      }).eq('id', transferId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['intercompany_transfers']);
      toast.success("Order fulfilled. GL Offset entries automatically recorded.");
      setViewOrder(null);
    },
    onError: (err) => toast.error(err.message)
  });

  const formatCurrency = (val) => `$${Number(val || 0).toFixed(2)}`;

  // Filter transfers based on current role
  const relevantTransfers = isCurrentLocationCommissary 
    ? transfers.filter(t => t.from_location_id === location?.id)
    : transfers.filter(t => t.to_location_id === location?.id);

  if (!organization) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Commissary</h1>
          <p className="text-muted-foreground mt-1">Inter-company transfers and batch orders</p>
        </div>
        {!isCurrentLocationCommissary && (
          <Button onClick={() => setIsOrderModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Place Order
          </Button>
        )}
      </div>

      {!commissaryLocation && (
        <Card className="border-resend-yellow bg-resend-yellow/10">
          <CardContent className="p-4 flex items-center gap-4">
            <Store className="h-6 w-6 text-resend-yellow" />
            <div>
              <p className="font-semibold text-resend-yellow">No Commissary Configured</p>
              <p className="text-sm text-resend-yellow/80">You need to mark a location as a Commissary in Organization Settings to use this feature.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {commissaryLocation && (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="orders">Orders & Transfers</TabsTrigger>
          {isCurrentLocationCommissary && <TabsTrigger value="catalog">Commissary Catalog</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="orders" className="mt-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                {isCurrentLocationCommissary ? 'Incoming Orders to Fulfill' : 'My Orders from Commissary'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading transfers...</p>
              ) : relevantTransfers.length === 0 ? (
                <div className="text-center py-12 bg-secondary/30 rounded-lg border border-dashed">
                  <ArrowRightLeft className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="font-medium text-muted-foreground">No transfers found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>{isCurrentLocationCommissary ? 'Ordering Location' : 'Fulfilling Location'}</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relevantTransfers.map(t => (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => setViewOrder(t)}>
                        <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">
                          {isCurrentLocationCommissary ? t.to_location?.name : t.from_location?.name}
                        </TableCell>
                        <TableCell>{t.items_json?.length || 0} items</TableCell>
                        <TableCell>{formatCurrency(t.total_amount)}</TableCell>
                        <TableCell>
                          <Badge className={
                            t.status === 'fulfilled' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                            t.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }>
                            {t.status === 'pending' ? <Clock className="w-3 h-3 mr-1" /> : null}
                            {t.status === 'fulfilled' ? <CheckCircle className="w-3 h-3 mr-1" /> : null}
                            {t.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <Button variant="ghost" size="sm">View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isCurrentLocationCommissary && (
        <TabsContent value="catalog" className="mt-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Available Batch Recipes</CardTitle>
              <CardDescription>Recipes marked as "Batch/Prep" that sister locations can order.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Cost / Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchRecipes.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                      <TableCell>{formatCurrency(r.cost_per_serving || r.total_cost)} / {r.yield_unit || 'serving'}</TableCell>
                    </TableRow>
                  ))}
                  {batchRecipes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No batch recipes defined yet. Create them in the Recipes module.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>
      )}

      {/* Place Order Modal */}
      <Dialog open={isOrderModalOpen} onOpenChange={setIsOrderModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order from Commissary</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label>Select Batch Recipe</Label>
                <Select value={selectedItem} onValueChange={setSelectedItem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {batchRecipes.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} - {formatCurrency(r.cost_per_serving || r.total_cost)}/{r.yield_unit || 'serving'}
                      </SelectItem>
                    ))}
                    {batchRecipes.length === 0 && <SelectItem value="none" disabled>No items available</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-2">
                <Label>Qty</Label>
                <Input type="number" min="1" value={orderQuantity} onChange={e => setOrderQuantity(Number(e.target.value))} />
              </div>
              <Button onClick={addItemToOrder} variant="secondary">Add</Button>
            </div>

            {orderItems.length > 0 && (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.quantity} {item.unit}</TableCell>
                        <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                        <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeOrderItem(idx)}>
                            <XCircle className="w-4 h-4 text-rose-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 bg-secondary/30 flex justify-between items-center border-t">
                  <span className="font-semibold">Order Total</span>
                  <span className="font-bold text-lg">{formatCurrency(orderItems.reduce((s,i)=>s+i.total_cost,0))}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsOrderModalOpen(false)}>Cancel</Button>
              <Button disabled={orderItems.length === 0 || submitOrderMutation.isPending} onClick={() => submitOrderMutation.mutate()}>
                {submitOrderMutation.isPending ? 'Submitting...' : 'Submit Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Order Modal */}
      {viewOrder && (
        <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex justify-between items-center">
                <span>Transfer Details</span>
                <Badge className={
                            viewOrder.status === 'fulfilled' ? 'bg-teal-50 text-teal-700 border-teal-200 mr-6' :
                            viewOrder.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200 mr-6' :
                            'bg-amber-50 text-amber-700 border-amber-200 mr-6'
                          }>
                  {viewOrder.status.toUpperCase()}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">From</p>
                  <p className="font-semibold">{viewOrder.from_location?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">To</p>
                  <p className="font-semibold">{viewOrder.to_location?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p>{new Date(viewOrder.created_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewOrder.items_json || []).map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.quantity} {item.unit}</TableCell>
                        <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 bg-secondary/30 flex justify-between items-center border-t">
                  <span className="font-semibold">Total Amount</span>
                  <span className="font-bold">{formatCurrency(viewOrder.total_amount)}</span>
                </div>
              </div>

              {viewOrder.status === 'fulfilled' && (
                <div className="p-4 bg-teal-50 border border-teal-100 rounded-lg flex gap-3 text-sm text-teal-800">
                  <FileText className="w-5 h-5 flex-shrink-0 text-teal-600" />
                  <div>
                    <p className="font-semibold">Automated GL Entries Created</p>
                    <ul className="list-disc ml-5 mt-1 opacity-90">
                      <li>Debit: {viewOrder.to_location?.name} COGS ({formatCurrency(viewOrder.total_amount)})</li>
                      <li>Credit: {viewOrder.from_location?.name} Intercompany Revenue ({formatCurrency(viewOrder.total_amount)})</li>
                    </ul>
                  </div>
                </div>
              )}

              {isCurrentLocationCommissary && viewOrder.status === 'pending' && (
                <div className="flex justify-end pt-4 border-t gap-3">
                  <Button variant="outline" onClick={() => setViewOrder(null)}>Close</Button>
                  <Button 
                    onClick={() => fulfillOrderMutation.mutate(viewOrder.id)}
                    disabled={fulfillOrderMutation.isPending}
                  >
                    Fulfill Order & Post to GL
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
