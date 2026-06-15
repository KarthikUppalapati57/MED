import React, { useState, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Calculator, DollarSign } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function AvTDashboard() {
  const { organization } = useAuth();
  const [period, setPeriod] = useState('current_week');

  const { data: inventory = [], isLoading } = useAuthQuery({
    queryKey: ['inventory', organization?.id],
    queryFn: () => api.entities.Inventory.list(),
    enabled: !!organization?.id,
  });

  // Calculate AvT Math for each inventory item
  // Actual Usage = Opening Inventory + Purchases + Transfers In - Transfers Out - Ending Inventory
  // For demonstration, we'll generate realistic mock data based on current inventory
  const avtData = useMemo(() => {
    return inventory.map(item => {
      // Mock historical data based on current stock
      const openingQty = (item.current_quantity || 10) + Math.floor(Math.random() * 5);
      const purchases = Math.floor(Math.random() * 20);
      const endingQty = item.current_quantity || 0;
      
      const actualUsageQty = openingQty + purchases - endingQty;
      const actualUsageValue = actualUsageQty * (item.unit_cost || 0);

      // Mock theoretical (what POS says we sold)
      // Usually theoretical is slightly less than actual (because of waste/theft)
      const theoreticalUsageQty = Math.max(0, actualUsageQty - Math.floor(Math.random() * 3));
      const theoreticalUsageValue = theoreticalUsageQty * (item.unit_cost || 0);

      const varianceQty = actualUsageQty - theoreticalUsageQty;
      const varianceValue = actualUsageValue - theoreticalUsageValue;
      const variancePercent = theoreticalUsageQty > 0 ? (varianceQty / theoreticalUsageQty) * 100 : 0;

      return {
        id: item.id,
        name: item.product_name,
        category: item.accounting_category,
        unit: item.current_unit,
        unitCost: item.unit_cost || 0,
        openingQty,
        purchases,
        endingQty,
        actualUsageQty,
        actualUsageValue,
        theoreticalUsageQty,
        theoreticalUsageValue,
        varianceQty,
        varianceValue,
        variancePercent
      };
    }).sort((a, b) => b.varianceValue - a.varianceValue);
  }, [inventory, period]);

  const totalActual = avtData.reduce((sum, i) => sum + i.actualUsageValue, 0);
  const totalTheoretical = avtData.reduce((sum, i) => sum + i.theoreticalUsageValue, 0);
  const totalVariance = avtData.reduce((sum, i) => sum + i.varianceValue, 0);
  const overallVariancePercent = totalTheoretical > 0 ? (totalVariance / totalTheoretical) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Actual vs Theoretical (AvT) Costing</h2>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">Actual Usage = Opening + Purchases - Ending</span>
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_week">Current Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="current_period">Current Period</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calculator className="w-4 h-4" />
              <h3 className="font-medium">Total Actual Cost</h3>
            </div>
            <p className="text-3xl font-bold">${totalActual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="w-4 h-4" />
              <h3 className="font-medium">Total Theoretical Cost</h3>
            </div>
            <p className="text-3xl font-bold">${totalTheoretical.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-rose-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-rose-800 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="font-medium">Total Cost Variance</h3>
            </div>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-rose-700">${totalVariance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              <Badge variant="outline" className="bg-rose-100 text-rose-800 border-none text-sm">
                +{overallVariancePercent.toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Usage Variance by Item</CardTitle>
          <CardDescription>Items with variance &gt; 5% are highlighted</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right bg-muted/30">Opening</TableHead>
                  <TableHead className="text-right bg-muted/30">+ Purch</TableHead>
                  <TableHead className="text-right bg-muted/30">- Ending</TableHead>
                  <TableHead className="text-right font-bold bg-muted/50">= Actual Usage</TableHead>
                  <TableHead className="text-right border-l">Theoretical</TableHead>
                  <TableHead className="text-right">Variance Qty</TableHead>
                  <TableHead className="text-right">Variance $</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : avtData.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No inventory data available for AvT.</TableCell></TableRow>
                ) : (
                  avtData.map(item => {
                    const isHighVariance = item.variancePercent > 5;
                    return (
                      <TableRow key={item.id} className={cn(isHighVariance && "bg-rose-50/50")}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.unit} @ ${item.unitCost.toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-right bg-muted/10">{item.openingQty}</TableCell>
                        <TableCell className="text-right bg-muted/10 text-emerald-600">+{item.purchases}</TableCell>
                        <TableCell className="text-right bg-muted/10 text-indigo-600">-{item.endingQty}</TableCell>
                        <TableCell className="text-right font-bold bg-muted/30">
                          {item.actualUsageQty} 
                        </TableCell>
                        <TableCell className="text-right border-l text-muted-foreground">
                          {item.theoreticalUsageQty}
                        </TableCell>
                        <TableCell className={cn("text-right", isHighVariance && "text-rose-600 font-medium")}>
                          {item.varianceQty > 0 ? '+' : ''}{item.varianceQty}
                        </TableCell>
                        <TableCell className={cn("text-right", isHighVariance && "text-rose-600 font-medium")}>
                          ${item.varianceValue.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={cn(
                            "border-none",
                            isHighVariance ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                          )}>
                            {item.variancePercent.toFixed(1)}%
                          </Badge>
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
    </div>
  );
}
