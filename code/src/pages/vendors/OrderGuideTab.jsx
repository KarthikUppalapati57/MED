import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ShoppingCart, Loader2, Download, Printer } from 'lucide-react';
import { toast } from "sonner";

export default function OrderGuideTab({ vendorId }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['vendor_items_order_guide', vendorId],
    queryFn: () => api.entities.VendorItem.filter(
      { vendor_id: vendorId, organization_id: organization?.id },
      { orderBy: 'vendor_item_name' }
    ),
    enabled: !!vendorId && !!organization?.id
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, updates }) => api.entities.VendorItem.update(id, {
      ...updates,
      organization_id: organization?.id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_items_order_guide', vendorId]);
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`)
  });

  const handleToggleOrderGuide = (id, currentVal) => {
    updateItemMutation.mutate({ id, updates: { on_order_guide: !currentVal } });
  };

  const handleUpdateQuantity = (id, value) => {
    const qty = parseFloat(value);
    if (!isNaN(qty)) {
      updateItemMutation.mutate({ id, updates: { preferred_quantity: qty } });
    }
  };

  const handleGenerateOrder = async () => {
    setGenerating(true);
    try {
      const orderItems = items.filter(i => i.on_order_guide);
      if (orderItems.length === 0) {
        toast.error("No items on the order guide. Please add some first.");
        return;
      }
      
      const payload = {
        vendor_id: vendorId,
        organization_id: organization?.id,
        status: 'draft',
        items: orderItems.map(i => ({
          vendor_item_id: i.id,
          name: i.vendor_item_name,
          quantity: i.preferred_quantity || 1,
          price: i.last_price || i.default_price || 0
        })),
        total_amount: orderItems.reduce((acc, i) => acc + ((i.last_price || i.default_price || 0) * (i.preferred_quantity || 1)), 0)
      };

      await api.entities.AutoOrder.create(payload);

      toast.success("Draft order generated successfully!");
      // Optionally navigate to orders tab or auto orders page
    } catch (err) {
      toast.error(`Failed to generate order: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Order Guide Setup</h3>
          <p className="text-sm text-muted-foreground">Select items to appear on your standard order guide for this vendor.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon"><Printer className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon"><Download className="h-4 w-4" /></Button>
          <Button onClick={handleGenerateOrder} disabled={generating} className="bg-primary">
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate Order
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">On Guide</TableHead>
              <TableHead>Item Name</TableHead>
              <TableHead>Pack Size</TableHead>
              <TableHead>Last Price</TableHead>
              <TableHead className="w-[150px]">Pref. Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading order guide...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No items found. Add items to the vendor catalog first.
                </TableCell>
              </TableRow>
            ) : (
              items.map(item => (
                <TableRow key={item.id} className={item.on_order_guide ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Switch 
                      checked={!!item.on_order_guide}
                      onCheckedChange={() => handleToggleOrderGuide(item.id, !!item.on_order_guide)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.vendor_item_name}</TableCell>
                  <TableCell>{item.pack_size || item.vendor_unit || '—'}</TableCell>
                  <TableCell>${Number(item.last_price || item.default_price || 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      defaultValue={item.preferred_quantity || 1}
                      disabled={!item.on_order_guide}
                      onBlur={(e) => handleUpdateQuantity(item.id, e.target.value)}
                      className="w-20 bg-background"
                      min="1"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
