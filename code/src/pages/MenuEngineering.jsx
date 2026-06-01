import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, Star, HelpCircle, Frown } from 'lucide-react';

export default function MenuEngineering() {
  const { organization } = useAuth();
  
  const { data: matrixData = [], isLoading } = useQuery({
    queryKey: ['menu-engineering', organization?.id],
    queryFn: () => api.reports.getMenuEngineering(organization?.id),
    enabled: !!organization?.id
  });

  const analyzedData = useMemo(() => {
    if (!matrixData.length) return { items: [], avgVolume: 0, avgProfit: 0 };
    
    // Calculate averages
    const totalVolume = matrixData.reduce((sum, item) => sum + Number(item.total_quantity_sold || 0), 0);
    const totalProfit = matrixData.reduce((sum, item) => sum + Number(item.total_profit || 0), 0);
    
    const avgVolume = totalVolume / matrixData.length;
    const avgProfit = totalProfit / matrixData.length;

    // Categorize items
    const items = matrixData.map(item => {
      const volume = Number(item.total_quantity_sold || 0);
      const profit = Number(item.total_profit || 0);
      let category = 'Dog'; // Low volume, Low profit
      let icon = Frown;
      let colorClass = 'bg-resend-red/10 text-resend-red';
      
      if (volume >= avgVolume && profit >= avgProfit) {
        category = 'Star'; // High volume, High profit
        icon = Star;
        colorClass = 'bg-resend-green/10 text-resend-green';
      } else if (volume >= avgVolume && profit < avgProfit) {
        category = 'Plowhorse'; // High volume, Low profit
        icon = Activity;
        colorClass = 'bg-resend-blue/10 text-resend-blue';
      } else if (volume < avgVolume && profit >= avgProfit) {
        category = 'Puzzle'; // Low volume, High profit
        icon = HelpCircle;
        colorClass = 'bg-resend-yellow/10 text-resend-yellow';
      }

      return {
        ...item,
        volume,
        profit,
        matrixCategory: category,
        MatrixIcon: icon,
        colorClass
      };
    }).sort((a, b) => b.profit - a.profit);

    return { items, avgVolume, avgProfit };
  }, [matrixData]);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-brand" /> Menu Engineering (PMIX Analysis)
        </h1>
        <p className="text-muted-foreground mt-1">
          Combine POS sales data with theoretical recipe costs to identify your most profitable menu items.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm glass-card border-border/40">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Star className="h-8 w-8 text-resend-green mb-2" />
            <h3 className="font-bold text-lg text-foreground">Stars</h3>
            <p className="text-xs text-muted-foreground mt-1">High Profit, High Volume. Keep these prominent!</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm glass-card border-border/40">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Activity className="h-8 w-8 text-resend-blue mb-2" />
            <h3 className="font-bold text-lg text-foreground">Plowhorses</h3>
            <p className="text-xs text-muted-foreground mt-1">Low Profit, High Volume. Try to increase price or reduce portion.</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm glass-card border-border/40">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <HelpCircle className="h-8 w-8 text-resend-yellow mb-2" />
            <h3 className="font-bold text-lg text-foreground">Puzzles</h3>
            <p className="text-xs text-muted-foreground mt-1">High Profit, Low Volume. Promote these to increase sales.</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm glass-card border-border/40">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <Frown className="h-8 w-8 text-resend-red mb-2" />
            <h3 className="font-bold text-lg text-foreground">Dogs</h3>
            <p className="text-xs text-muted-foreground mt-1">Low Profit, Low Volume. Consider removing from menu.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>PMIX Matrix Results</CardTitle>
          <CardDescription>Average Volume: {analyzedData.avgVolume.toFixed(1)} | Average Profit: ${analyzedData.avgProfit.toFixed(2)}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Quantity Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Total Profit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyzedData.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No POS sales data mapped to recipes yet. Check back after POS sync runs.
                  </TableCell>
                </TableRow>
              ) : (
                analyzedData.items.map(item => (
                  <TableRow key={item.pos_item_id}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{item.category}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{item.volume}</TableCell>
                    <TableCell className="text-right">${Number(item.total_revenue || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">${item.profit.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={item.colorClass + " border-0"}>
                        <item.MatrixIcon className="h-3 w-3 mr-1" />
                        {item.matrixCategory}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
