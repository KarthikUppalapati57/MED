import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, DollarSign, PieChart, TrendingUp, TrendingDown, ArrowUpRight } from "lucide-react";

export default function Performance() {
  const [activeTab, setActiveTab] = useState('sales');

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
                <p className="text-2xl font-bold mt-1">$45,230.00</p>
                <div className="flex items-center text-resend-green text-xs mt-2 font-medium">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  +4.2% vs budget
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-sm text-muted-foreground">Year-to-Date Sales</p>
                <p className="text-2xl font-bold mt-1">$312,450.00</p>
                <div className="flex items-center text-resend-green text-xs mt-2 font-medium">
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  +2.1% vs budget
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-center">
                <p className="text-sm text-muted-foreground">Budget Pacing</p>
                <p className="text-2xl font-bold mt-1">104%</p>
                <div className="flex items-center text-muted-foreground text-xs mt-2 font-medium">
                  On track to beat monthly target
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
