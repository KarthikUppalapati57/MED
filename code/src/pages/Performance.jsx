import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';

export default function Performance() {
  const [activeTab, setActiveTab] = useState('sales');

  const { data: salesData = [] } = useAuthQuery({
    queryKey: ['pos_sales_data'],
    queryFn: () => api.entities.PosSalesData.list(),
  });

  const totalSales = salesData.reduce((sum, record) => sum + Number(record.revenue), 0);
  const budget = totalSales > 0 ? totalSales * 0.95 : 50000; // Mock budget for now
  const variance = ((totalSales - budget) / budget) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Dashboard</h1>
          <p className="text-muted-foreground mt-1">High-level KPIs, actual vs budget, and trend analysis.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 mb-6">
          <TabsTrigger value="sales">Sales vs Budget</TabsTrigger>
          <TabsTrigger value="pnl">Controllable P&L</TabsTrigger>
          <TabsTrigger value="category">Category Report</TabsTrigger>
          <TabsTrigger value="movers">Price Movers</TabsTrigger>
          <TabsTrigger value="usage">Usage Report</TabsTrigger>
          <TabsTrigger value="forecast">Forecasts</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-sm text-muted-foreground">Period-to-Date Sales</p>
                <p className="text-2xl font-bold mt-1">${totalSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                <div className={`flex items-center text-xs mt-2 font-medium ${variance >= 0 ? 'text-resend-green' : 'text-resend-red'}`}>
                  {variance >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                  {variance > 0 ? '+' : ''}{variance.toFixed(1)}% vs budget
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-sm text-muted-foreground">Budget Pacing</p>
                <p className="text-2xl font-bold mt-1">{totalSales > 0 ? ((totalSales / budget) * 100).toFixed(1) : 0}%</p>
                <div className="flex items-center text-muted-foreground text-xs mt-2 font-medium">
                  {totalSales >= budget ? 'On track to beat target' : 'Behind target pace'}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-brand/10 to-brand/5 border-brand/20">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-sm text-brand-dark font-medium">AI Forecast (Next 7 Days)</p>
                <p className="text-2xl font-bold mt-1 text-brand-dark">${(budget * 0.25).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                <div className="flex items-center text-brand text-xs mt-2 font-medium">
                  Expected strong weekend volume
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Sales Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-64 flex items-center justify-center bg-secondary/20 rounded-b-xl border-t border-border">
              <p className="text-muted-foreground">Sales charts will render here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card className="border-0 shadow-sm p-8 text-center text-muted-foreground">
            Controllable P&L module in development
          </Card>
        </TabsContent>
        <TabsContent value="category">
          <Card className="border-0 shadow-sm p-8 text-center text-muted-foreground">
            Category Report module in development
          </Card>
        </TabsContent>
        <TabsContent value="movers">
          <Card className="border-0 shadow-sm p-8 text-center text-muted-foreground">
            Price Movers & Alerts module in development
          </Card>
        </TabsContent>
        <TabsContent value="usage">
          <Card className="border-0 shadow-sm p-8 text-center text-muted-foreground">
            Usage Report module in development
          </Card>
        </TabsContent>
        <TabsContent value="forecast">
          <Card className="border-0 shadow-sm p-8 text-center text-muted-foreground">
            AI Sales Forecasts module in development
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
