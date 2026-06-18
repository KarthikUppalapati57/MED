import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { AlertCircle, CheckCircle2, PackageSearch } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

export default function ThreeWayMatchViewer({ purchaseOrderId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['three-way-match', purchaseOrderId],
    queryFn: () => api.reports.getThreeWayMatchStatus(purchaseOrderId),
    enabled: !!purchaseOrderId
  });

  if (!purchaseOrderId) return null;

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card className="bg-destructive/10 border-destructive/20 text-destructive shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">Failed to load Three-Way Match data.</p>
        </CardContent>
      </Card>
    );
  }

  const isMatched = data.match_status === 'matched';
  const isCritical = data.match_status === 'critical_variance';

  return (
    <Card className="glass-card border-border/50 shadow-sm relative overflow-hidden">
      {/* Background Gradient */}
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${
        isMatched ? 'from-resend-green/20 to-transparent' : 
        isCritical ? 'from-destructive/20 to-transparent' : 
        'from-amber-500/20 to-transparent'
      }`} />
      
      <CardHeader className="pb-3 border-b border-border/50 relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-indigo-400" />
              Three-Way Match Analysis
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Verifying Purchase Order vs Receipt vs Invoice
            </p>
          </div>
          <Badge className={
            isMatched ? "bg-resend-green/20 text-resend-green hover:bg-resend-green/30" : 
            isCritical ? "bg-destructive/20 text-destructive hover:bg-destructive/30" :
            "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30"
          }>
            {isMatched ? (
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> MATCHED</span>
            ) : (
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> VARIANCE DETECTED</span>
            )}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: PO */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Purchase Order</h4>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Total Cost</span>
                <span className="font-mono font-semibold">${Number(data.po_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Items Ordered</span>
                <span className="font-mono">{data.po_quantity} units</span>
              </div>
            </div>
          </div>

          {/* Column 2: Receipt */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Receiving</h4>
            <div className={`p-4 rounded-lg border ${data.received_quantity < data.po_quantity ? 'bg-amber-500/5 border-amber-500/30' : 'bg-muted/30 border-border/50'}`}>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Items Received</span>
                <span className={`font-mono ${data.received_quantity < data.po_quantity ? 'text-amber-500 font-bold' : ''}`}>
                  {data.received_quantity} units
                </span>
              </div>
            </div>
          </div>

          {/* Column 3: Invoice */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Final Invoice</h4>
            <div className={`p-4 rounded-lg border ${data.variance_percent > 5 || data.variance_amount > 50 ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/30 border-border/50'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-muted-foreground">Total Billed</span>
                <span className={`font-mono ${data.variance_percent > 5 || data.variance_amount > 50 ? 'text-destructive font-bold' : 'font-semibold'}`}>
                  ${Number(data.invoice_total).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Variance</span>
                <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${data.variance_amount > 0 ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  ${Number(data.variance_amount).toFixed(2)} ({Number(data.variance_percent).toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {!isMatched && (
          <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-200 leading-relaxed">
              {isCritical 
                ? "CRITICAL: This order has significant quantity and price discrepancies. The invoice has been blocked and requires manager approval."
                : data.match_status === 'quantity_variance'
                ? "QUANTITY MISMATCH: We received fewer items than we ordered. Ensure the vendor issues a credit memo."
                : "PRICE MISMATCH: The vendor billed us more than the Purchase Order cost. The invoice has been flagged."
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
