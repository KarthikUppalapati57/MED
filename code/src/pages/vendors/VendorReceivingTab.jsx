import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Package } from 'lucide-react';
import ThreeWayMatchViewer from '@/components/ThreeWayMatchViewer';
import { Skeleton } from "@/components/ui/skeleton";

export default function VendorReceivingTab({ vendorId }) {
  const [selectedPo, setSelectedPo] = useState(null);

  const { data: pos, isLoading } = useQuery({
    queryKey: ['vendor_purchase_orders', vendorId],
    queryFn: async () => {
      return api.entities.PurchaseOrder.filter({ vendor_id: vendorId }, { orderBy: '-created_at' });
    },
    enabled: !!vendorId
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Receiving & POs</h2>
          <p className="text-sm text-muted-foreground">Manage purchase orders and view three-way match reports.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <Card className="glass-card shadow-sm border-border/50">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg">Recent Purchase Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
                {pos?.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm flex flex-col items-center">
                    <Package className="h-8 w-8 mb-2 opacity-20" />
                    No Purchase Orders found.
                  </div>
                ) : (
                  pos?.map(po => (
                    <div 
                      key={po.id} 
                      className={`p-4 cursor-pointer hover:bg-muted/30 transition-colors ${selectedPo === po.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      onClick={() => setSelectedPo(po.id)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold font-mono text-sm">PO-{po.id.split('-')[0].toUpperCase()}</span>
                        <Badge variant="outline" className={
                          po.status === 'received' ? 'bg-resend-green/10 text-resend-green border-resend-green/20' : 
                          po.status === 'draft' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary border-primary/20'
                        }>
                          {po.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center mt-2 text-sm text-muted-foreground">
                        <span>{new Date(po.created_at).toLocaleDateString()}</span>
                        <span className="font-medium">${Number(po.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          {selectedPo ? (
            <div className="space-y-6">
              <ThreeWayMatchViewer purchaseOrderId={selectedPo} />
              
              <Card className="border border-dashed border-border/60 bg-muted/10">
                <CardContent className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium">Log New Receipt</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Did a truck just arrive? Log the delivery quantities and any damaged items against this Purchase Order.
                  </p>
                  <Button variant="outline" className="mt-2">Start Receiving Flow</Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="glass-card shadow-sm border-border/50 h-full min-h-[400px] flex items-center justify-center">
              <CardContent className="text-center text-muted-foreground p-8 flex flex-col items-center">
                <Package className="h-12 w-12 mb-4 opacity-20" />
                <p>Select a Purchase Order from the list to view its Three-Way Match analysis and receiving history.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
