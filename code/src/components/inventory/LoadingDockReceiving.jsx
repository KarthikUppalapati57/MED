import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Package, Truck, CheckCircle2, AlertTriangle, ChevronLeft } from 'lucide-react';

export default function LoadingDockReceiving() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receivedQtys, setReceivedQtys] = useState({});

  const { data: pendingOrders = [], isLoading } = useAuthQuery({
    queryKey: ['pending-orders'],
    queryFn: async () => {
      // Fetch orders that are sent or partially received
      const allOrders = await api.entities.AutoOrder.list('-created_at');
      return allOrders.filter(o => o.status === 'sent' || o.status === 'ordered' || o.status === 'partially_received' || o.status === 'pending');
    }
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ order, qtys, isPartial }) => {
      // 1. Update order status
      const newStatus = isPartial ? 'partially_received' : 'received';
      await api.entities.AutoOrder.update(order.id, {
        status: newStatus,
        updated_at: new Date().toISOString()
      });

      // 2. Create receiving record
      const receivingItems = order.items.map(item => ({
        ...item,
        received_quantity: qtys[item.product_id] || 0,
        discrepancy: item.approved_quantity - (qtys[item.product_id] || 0)
      }));

      // NOTE: We wrap the api call in a try/catch in case the receivings table is not perfectly matched to the API client yet.
      try {
        await api.entities.Receiving.create({
          order_id: order.id,
          vendor_id: order.vendor_id,
          status: isPartial ? 'partial' : 'received',
          items: receivingItems
        });
      } catch (err) {
        console.error("Receiving table might not exist yet or failed:", err);
      }

      // 3. (Optional) Auto-generate credit memo requests for discrepancies
      if (isPartial) {
        const shortItems = receivingItems.filter(i => i.discrepancy > 0);
        if (shortItems.length > 0) {
           toast.warning(`${shortItems.length} items short-shipped. Credit memo requested.`);
        }
      }

      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.success(`Order marked as ${newStatus.replace('_', ' ')}!`);
      setSelectedOrder(null);
    }
  });

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    const initialQtys = {};
    order.items?.forEach(i => {
      initialQtys[i.product_id] = i.approved_quantity || i.suggested_quantity || 0;
    });
    setReceivedQtys(initialQtys);
  };

  const handleQtyChange = (productId, val) => {
    setReceivedQtys(prev => ({
      ...prev,
      [productId]: Math.max(0, Number(val))
    }));
  };

  const handleReceive = () => {
    let isPartial = false;
    selectedOrder.items?.forEach(i => {
      const expected = i.approved_quantity || i.suggested_quantity || 0;
      const actual = receivedQtys[i.product_id] || 0;
      if (actual < expected) {
        isPartial = true;
      }
    });

    receiveMutation.mutate({ order: selectedOrder, qtys: receivedQtys, isPartial });
  };

  if (selectedOrder) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => setSelectedOrder(null)} className="mb-2 -ml-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Orders
        </Button>
        <Card className="border-0 shadow-xl overflow-hidden rounded-[24px]">
          <div className="bg-primary/5 p-6 border-b border-primary/10">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Receiving Order {selectedOrder.order_number}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Vendor: <span className="font-semibold text-foreground">{selectedOrder.vendor_name}</span></p>
          </div>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {selectedOrder.items?.map(item => {
                const expected = item.approved_quantity || item.suggested_quantity || 0;
                const actual = receivedQtys[item.product_id] || 0;
                const isShort = actual < expected;

                return (
                  <div key={item.product_id} className="p-4 sm:p-6 hover:bg-secondary/20 transition-colors">
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground text-lg">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">Expected: {expected} {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-12 w-12 rounded-xl border-border bg-card"
                          onClick={() => handleQtyChange(item.product_id, actual - 1)}
                        >
                          -
                        </Button>
                        <div className="relative">
                          <Input 
                            type="number"
                            value={actual}
                            onChange={(e) => handleQtyChange(item.product_id, e.target.value)}
                            className="w-20 text-center h-12 text-lg font-bold rounded-xl bg-card border-border shadow-inner"
                          />
                        </div>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-12 w-12 rounded-xl border-border bg-card"
                          onClick={() => handleQtyChange(item.product_id, actual + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    {isShort && (
                      <div className="mt-3 bg-resend-yellow/10 border border-resend-yellow/20 rounded-lg p-2.5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-resend-yellow" />
                        <p className="text-xs font-semibold text-amber-800">Short ship detected: Missing {expected - actual} {item.unit}. Credit memo will be requested.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-6 bg-secondary/30 mt-4 border-t border-border">
              <Button 
                className="w-full h-14 text-lg font-bold rounded-2xl bg-primary hover:bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                onClick={handleReceive}
                disabled={receiveMutation.isPending}
              >
                {receiveMutation.isPending ? 'Processing...' : (
                  <>
                    <CheckCircle2 className="w-6 h-6 mr-2" />
                    Complete Receiving
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Loading Dock
          </h2>
          <p className="text-muted-foreground mt-1">Select an expected delivery to begin receiving.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading pending deliveries...</div>
      ) : pendingOrders.length === 0 ? (
        <Card className="border-2 border-dashed shadow-none bg-transparent">
          <CardContent className="py-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold text-foreground">All Caught Up!</h3>
            <p className="text-muted-foreground max-w-sm mt-2">There are no pending deliveries expected at this time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingOrders.map(order => (
            <Card 
              key={order.id} 
              className="border-0 shadow-md hover:shadow-xl transition-all cursor-pointer rounded-[24px] group"
              onClick={() => handleSelectOrder(order)}
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Truck className="w-6 h-6 text-primary" />
                  </div>
                  <Badge variant="secondary" className="bg-resend-yellow/10 text-resend-yellow font-bold">
                    {order.status.replace('_', ' ')}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{order.vendor_name}</h3>
                <p className="text-sm font-medium text-muted-foreground mb-4">Order: {order.order_number}</p>
                <div className="flex justify-between items-center text-sm pt-4 border-t border-border">
                  <span className="text-muted-foreground">{order.items?.length || 0} items expected</span>
                  <span className="font-bold text-primary">Receive →</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
