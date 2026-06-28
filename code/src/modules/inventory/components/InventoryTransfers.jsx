import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { ArrowRightLeft, Send, Search, Building2, PackageCheck } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';
import { createTransferWorkflow, completeTransferWorkflow } from '@/lib/workflowService';
import { useAuth } from '@/lib/AuthContext';

export default function InventoryTransfers({ inventory, updateInventoryMutation, organization }) {
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [destination, setDestination] = useState('');
  const { userProfile, location } = useAuth();
  
  const { data: locations = [] } = useAuthQuery({
    queryKey: ['locations', organization?.id],
    queryFn: () => api.entities.Location.list(),
    enabled: !!organization?.id,
  });
  const handleAddItem = (item) => {
    if (!selectedItems.find(i => i.id === item.id)) {
      setSelectedItems([...selectedItems, { ...item, transfer_quantity: 1 }]);
    }
  };

  const handleRemoveItem = (id) => {
    setSelectedItems(selectedItems.filter(i => i.id !== id));
  };

  const handleUpdateTransferQty = (id, qty) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.id === id) {
        // Ensure we don't transfer more than we have
        const maxQty = item.current_quantity || 0;
        const validQty = Math.min(Math.max(0, qty), maxQty);
        return { ...item, transfer_quantity: validQty };
      }
      return item;
    }));
  };

  const processTransfer = async () => {
    if (!destination) {
      toast.error("Please select a destination location.");
      return;
    }
    if (selectedItems.length === 0) {
      toast.error("Please add items to transfer.");
      return;
    }

    try {
      const itemsToTransfer = selectedItems.map(item => ({
        inventoryItem: item,
        quantity: item.transfer_quantity
      }));

      const result = await api.metrics.executeInternalTransfer(
        organization?.id,
        location?.id || null,
        destination,
        itemsToTransfer,
        userProfile?.id || null
      );

      // Note: we can also manually invalidate the query here if we imported queryClient
      toast.success(`Transfer Complete! Sent ${selectedItems.length} items to ${locations.find(l=>l.id === destination)?.name || 'Destination'}`);
      setSelectedItems([]);
      setDestination('');
    } catch (error) {
      toast.error(error.message || "Failed to process transfer.");
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.product_name?.toLowerCase().includes(search.toLowerCase()) && 
    (item.current_quantity || 0) > 0 // Only show items we actually have in stock
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left Column: Transfer Cart & Process */}
      <div className="xl:col-span-2 space-y-6">
        <Card className="border-0 shadow-sm border-t-4 border-t-indigo-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
              New Inter-Store Transfer
            </CardTitle>
            <CardDescription>
              Move prep items or raw ingredients from your current location to another branch or commissary.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Destination Location
                </label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select destination..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="min-h-[250px] border rounded-lg overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow>
                    <TableHead>Item to Transfer</TableHead>
                    <TableHead className="w-[120px]">Available</TableHead>
                    <TableHead className="w-[150px]">Transfer Qty</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-[200px] text-center text-muted-foreground">
                        <PackageCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                        No items added to transfer batch
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.location || 'Unassigned Zone'}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {item.current_quantity} {item.current_unit || 'ea'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              min="0" 
                              max={item.current_quantity}
                              value={item.transfer_quantity}
                              onChange={(e) => handleUpdateTransferQty(item.id, parseFloat(e.target.value) || 0)}
                              className="w-20 font-mono text-sm"
                            />
                            <span className="text-xs text-muted-foreground">{item.current_unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-resend-red hover:bg-resend-red/10" onClick={() => handleRemoveItem(item.id)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={processTransfer}
                disabled={selectedItems.length === 0 || !destination}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8"
              >
                <Send className="h-4 w-4 mr-2" />
                Dispatch Transfer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Inventory Picker */}
      <div>
        <Card className="border-0 shadow-sm h-full">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-semibold">Available Inventory</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                className="pl-8 bg-secondary border-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[600px]">
            <div className="divide-y">
              {filteredInventory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No items found in stock.
                </div>
              ) : (
                filteredInventory.map(item => {
                  const isAdded = selectedItems.some(i => i.id === item.id);
                  return (
                    <div key={item.id} className={`p-4 flex items-center justify-between hover:bg-slate-50 transition-colors ${isAdded ? 'opacity-50' : ''}`}>
                      <div>
                        <p className="font-medium text-sm">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">Stock: {item.current_quantity} {item.current_unit}</p>
                      </div>
                      <Button 
                        variant={isAdded ? "secondary" : "outline"} 
                        size="sm"
                        disabled={isAdded}
                        onClick={() => handleAddItem(item)}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
