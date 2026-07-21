import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Calculator, DollarSign } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';

const getDateRange = (period) => {
  const now = new Date();
  if (period === 'last_week') {
    return {
      startDate: format(subDays(startOfWeek(now), 7), 'yyyy-MM-dd'),
      endDate: format(subDays(startOfWeek(now), 1), 'yyyy-MM-dd'),
    };
  }
  if (period === 'current_period') {
    return {
      startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
      endDate: format(now, 'yyyy-MM-dd'),
    };
  }
  return {
    startDate: format(subDays(now, 7), 'yyyy-MM-dd'),
    endDate: format(now, 'yyyy-MM-dd'),
  };
};

export default function AvTDashboard() {
  const [period, setPeriod] = useState('current_week');
  const { startDate, endDate } = getDateRange(period);

  const { data: avtData = [], isLoading } = useAuthQuery({
    queryKey: ['inventory-avt-dashboard', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_avt_variance_report', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data || []).map((item) => {
        const actualUsageQty = Number(item.actual || 0);
        const theoreticalUsageQty = Number(item.theoretical || 0);
        const unitCost = Number(item.costPerUnit || 0);
        const varianceQty = actualUsageQty - theoreticalUsageQty;
        const varianceValue = varianceQty * unitCost;
        const variancePercent = theoreticalUsageQty > 0 ? (varianceQty / theoreticalUsageQty) * 100 : 0;
        return {
          id: item.id,
          name: item.ingredient,
          unit: item.unit,
          unitCost,
          actualUsageQty,
          actualUsageValue: actualUsageQty * unitCost,
          theoreticalUsageQty,
          theoreticalUsageValue: theoreticalUsageQty * unitCost,
          varianceQty,
          varianceValue,
          variancePercent,
        };
      }).sort((a, b) => b.varianceValue - a.varianceValue);
    },
  });

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
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">Actual usage is pulled from inventory movements and POS recipe consumption.</span>
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
                {overallVariancePercent > 0 ? '+' : ''}{overallVariancePercent.toFixed(1)}%
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
                  <TableHead className="text-right font-bold bg-muted/50">Actual Usage</TableHead>
                  <TableHead className="text-right border-l">Theoretical</TableHead>
                  <TableHead className="text-right">Variance Qty</TableHead>
                  <TableHead className="text-right">Variance $</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : avtData.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No AvT data available for this period. Import POS sales and inventory movements first.</TableCell></TableRow>
                ) : (
                  avtData.map(item => {
                    const isHighVariance = item.variancePercent > 5;
                    return (
                      <TableRow key={item.id} className={cn(isHighVariance && "bg-rose-50/50")}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">{item.unit} @ ${item.unitCost.toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-right font-bold bg-muted/30">{item.actualUsageQty.toFixed(2)}</TableCell>
                        <TableCell className="text-right border-l text-muted-foreground">{item.theoreticalUsageQty.toFixed(2)}</TableCell>
                        <TableCell className={cn("text-right", isHighVariance && "text-rose-600 font-medium")}>
                          {item.varianceQty > 0 ? '+' : ''}{item.varianceQty.toFixed(2)}
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
