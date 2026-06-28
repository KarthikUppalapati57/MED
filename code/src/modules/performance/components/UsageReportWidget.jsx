import React, { useMemo } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ClipboardCheck, Package, Scale, Trash2 } from "lucide-react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

const qty = (value) => Number(value || 0).toFixed(2);

const movementDate = (movement) => new Date(movement.created_at || Date.now());

const isPeriodMovement = (movement, start, end) => {
  const date = movementDate(movement);
  return date >= start && date <= end;
};

function createUsageRow(item) {
  return {
    id: item.id,
    productId: item.product_id,
    name: item.product_name || item.name || 'Unnamed item',
    unit: item.current_unit || item.report_by_unit || 'ea',
    unitCost: Number(item.unit_cost || item.latest_price || 0),
    currentQuantity: Number(item.current_quantity || 0),
    opening: 0,
    purchases: 0,
    theoretical: 0,
    waste: 0,
    transferIn: 0,
    transferOut: 0,
    adjustments: 0,
    stockCountVariance: 0,
    ending: Number(item.current_quantity || 0),
  };
}

export function UsageReportWidget() {
  const { organization, brand, location } = useAuth();
  const periodEnd = useMemo(() => new Date(), []);
  const periodStart = useMemo(() => new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1), [periodEnd]);

  const { data: rawInventory = [], isLoading: loadingInventory } = useAuthQuery({
    queryKey: ['usage-report-inventory', organization?.id],
    queryFn: () => api.entities.Inventory.list('product_name'),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const { data: rawMovements = [], isLoading: loadingMovements } = useAuthQuery({
    queryKey: ['usage-report-movements', organization?.id],
    queryFn: () => api.entities.InventoryMovement.list('-created_at', { limit: 5000 }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });

  const usageRows = useMemo(() => {
    const inventoryById = new Map(rawInventory.map((item) => [item.id, item]));
    const rowsByInventoryId = new Map();

    rawInventory.forEach((item) => {
      rowsByInventoryId.set(item.id, createUsageRow(item));
    });

    rawMovements
      .filter((movement) => isPeriodMovement(movement, periodStart, periodEnd))
      .forEach((movement) => {
        const inventoryItem = inventoryById.get(movement.inventory_id);
        if (!inventoryItem && !rowsByInventoryId.has(movement.inventory_id)) return;

        if (!rowsByInventoryId.has(movement.inventory_id)) {
          rowsByInventoryId.set(movement.inventory_id, createUsageRow(inventoryItem || { id: movement.inventory_id }));
        }

        const row = rowsByInventoryId.get(movement.inventory_id);
        const amount = Number(movement.quantity || 0);

        switch (movement.movement_type) {
          case 'invoice_received':
          case 'purchase_order':
            row.purchases += Math.max(0, amount);
            break;
          case 'recipe_consumption':
            row.theoretical += Math.abs(amount);
            break;
          case 'wastage':
          case 'spoilage':
            row.waste += Math.abs(amount);
            break;
          case 'transfer':
            if (amount >= 0) row.transferIn += amount;
            else row.transferOut += Math.abs(amount);
            break;
          case 'manual_adjustment':
            row.adjustments += amount;
            break;
          case 'stock_count':
            row.stockCountVariance += amount;
            break;
          default:
            break;
        }
      });

    return Array.from(rowsByInventoryId.values()).map((row) => {
      const periodNetMovement = row.purchases - row.theoretical - row.waste + row.transferIn - row.transferOut + row.adjustments + row.stockCountVariance;
      const opening = row.ending - periodNetMovement;
      const actualUsage = opening + row.purchases + row.transferIn - row.transferOut - row.ending;
      const varianceQty = actualUsage - row.theoretical;
      const varianceCost = varianceQty * row.unitCost;
      const variancePercent = row.theoretical > 0 ? (varianceQty / row.theoretical) * 100 : 0;
      const wasteCost = row.waste * row.unitCost;

      return {
        ...row,
        opening,
        actualUsage,
        varianceQty,
        varianceCost,
        variancePercent,
        wasteCost,
        status: Math.abs(variancePercent) >= 10 ? 'critical' : Math.abs(variancePercent) >= 5 ? 'warning' : 'good',
      };
    }).sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost));
  }, [rawInventory, rawMovements, periodStart, periodEnd]);

  const summary = useMemo(() => {
    const totalActualCost = usageRows.reduce((sum, row) => sum + Math.max(0, row.actualUsage) * row.unitCost, 0);
    const totalTheoreticalCost = usageRows.reduce((sum, row) => sum + row.theoretical * row.unitCost, 0);
    const totalVarianceCost = usageRows.reduce((sum, row) => sum + row.varianceCost, 0);
    const totalWasteCost = usageRows.reduce((sum, row) => sum + row.wasteCost, 0);
    const criticalCount = usageRows.filter((row) => row.status === 'critical').length;

    return { totalActualCost, totalTheoreticalCost, totalVarianceCost, totalWasteCost, criticalCount };
  }, [usageRows]);

  const isLoading = loadingInventory || loadingMovements;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading food usage data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="glass-card shadow-sm border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Scale className="h-4 w-4" /> Actual Usage Cost
            </p>
            <p className="text-2xl font-bold mt-2">{money(summary.totalActualCost)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card shadow-sm border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Theoretical Usage
            </p>
            <p className="text-2xl font-bold mt-2">{money(summary.totalTheoreticalCost)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card shadow-sm border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Variance Cost
            </p>
            <p className={summary.totalVarianceCost > 0 ? "text-2xl font-bold mt-2 text-resend-red" : "text-2xl font-bold mt-2 text-resend-green"}>
              {money(summary.totalVarianceCost)}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card shadow-sm border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Waste Cost
            </p>
            <p className="text-2xl font-bold mt-2">{money(summary.totalWasteCost)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Food Usage & Inventory Variance</CardTitle>
          <CardDescription>
            Compares opening inventory, purchases, transfers, ending inventory, POS recipe depletion, and waste for the current period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto w-full">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Waste</TableHead>
                  <TableHead className="text-right">Ending</TableHead>
                  <TableHead className="text-right">Actual Usage</TableHead>
                  <TableHead className="text-right">Theoretical</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance Cost</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No inventory usage data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  usageRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{qty(item.opening)} {item.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-blue-600">{qty(item.purchases)} {item.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-rose-600">{item.waste > 0 ? `${qty(item.waste)} ${item.unit}` : '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{qty(item.ending)} {item.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-semibold">{qty(item.actualUsage)} {item.unit}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{qty(item.theoretical)} {item.unit}</TableCell>
                      <TableCell className={item.varianceQty > 0 ? "text-right whitespace-nowrap text-resend-red" : "text-right whitespace-nowrap text-resend-green"}>
                        {item.varianceQty > 0 ? '+' : ''}{qty(item.varianceQty)} {item.unit}
                        <div className="text-xs text-muted-foreground">{item.variancePercent > 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className={item.varianceCost > 0 ? "text-right whitespace-nowrap font-semibold text-resend-red" : "text-right whitespace-nowrap font-semibold text-resend-green"}>
                        {money(item.varianceCost)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {item.status === 'critical' && <Badge className="bg-resend-red/10 text-resend-red">Critical</Badge>}
                        {item.status === 'warning' && <Badge className="bg-resend-yellow/10 text-resend-yellow">Review</Badge>}
                        {item.status === 'good' && <Badge className="bg-resend-green/10 text-resend-green">Good</Badge>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
