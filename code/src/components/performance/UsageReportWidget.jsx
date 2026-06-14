import React, { useMemo } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";

export function UsageReportWidget() {
  const { organization, brand, location } = useAuth();

  const { data: rawMovements, isLoading } = useAuthQuery({
    queryKey: ['inventory_movements', organization?.id],
    queryFn: () => api.entities.InventoryMovement.list('-created_at', { limit: 1000 }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const usageData = useMemo(() => {
    if (!rawMovements) return [];

    const productMap = {};

    rawMovements.forEach(mv => {
      const pId = mv.product_id;
      if (!pId) return;

      if (!productMap[pId]) {
        productMap[pId] = {
          id: pId,
          name: mv.product?.name || `Product ${pId.substring(0,6)}`,
          purchases: 0,
          usage: 0,
          waste: 0,
          transferIn: 0,
          transferOut: 0,
          adjustments: 0
        };
      }

      const qty = Number(mv.quantity || 0);

      switch(mv.movement_type) {
        case 'purchase':
        case 'receiving':
          productMap[pId].purchases += qty;
          break;
        case 'sale':
        case 'usage':
        case 'depletion':
          productMap[pId].usage += Math.abs(qty);
          break;
        case 'waste':
        case 'spoilage':
          productMap[pId].waste += Math.abs(qty);
          break;
        case 'transfer_in':
          productMap[pId].transferIn += qty;
          break;
        case 'transfer_out':
          productMap[pId].transferOut += Math.abs(qty);
          break;
        case 'adjustment':
        case 'count_variance':
          productMap[pId].adjustments += qty;
          break;
        default:
          break;
      }
    });

    return Object.values(productMap).sort((a, b) => b.usage - a.usage);
  }, [rawMovements]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading usage data...</div>;
  }

  return (
    <Card className="glass-card shadow-sm border-border/50">
      <CardHeader>
        <CardTitle>Usage & Inventory Movements</CardTitle>
        <CardDescription>Comprehensive log of product depletion, purchases, waste, and adjustments.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto w-full">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Purchased</TableHead>
                <TableHead className="text-right">Actual Usage</TableHead>
                <TableHead className="text-right">Waste</TableHead>
                <TableHead className="text-right">Transfers (Net)</TableHead>
                <TableHead className="text-right">Adjustments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No inventory movements recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                usageData.map((item) => {
                  const netTransfers = item.transferIn - item.transferOut;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-blue-600">
                        {item.purchases > 0 ? `+${item.purchases.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-semibold">
                        {item.usage.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-rose-600">
                        {item.waste > 0 ? item.waste.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {netTransfers === 0 ? '-' : (
                          <span className={netTransfers > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                            {netTransfers > 0 ? '+' : ''}{netTransfers.toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {item.adjustments === 0 ? '-' : (
                          <span className={item.adjustments > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {item.adjustments > 0 ? '+' : ''}{item.adjustments.toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
