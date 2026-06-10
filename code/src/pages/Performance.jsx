import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, DollarSign, TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Package, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function Performance() {
  const [activeTab, setActiveTab] = useState('sales');

  const { organization, location } = useAuth();

  const { data: salesData = [] } = useAuthQuery({
    queryKey: ['pos_sales_data', organization?.id, location?.id],
    queryFn: () => {
      const filters = {};
      if (location?.id) filters.location_id = location.id;
      else if (organization?.id) filters.organization_id = organization.id;
      return api.entities.PosSalesData.filter(filters);
    },
    enabled: !!organization?.id,
  });

  const { data: posItems = [] } = useAuthQuery({
    queryKey: ['pos_items', organization?.id, location?.id],
    queryFn: () => {
      const filters = {};
      if (location?.id) filters.location_id = location.id;
      else if (organization?.id) filters.organization_id = organization.id;
      return api.entities.PosItem.filter(filters);
    },
    enabled: !!organization?.id,
  });

  const totalSales = salesData.reduce((sum, record) => sum + Number(record.revenue), 0);
  const budget = totalSales > 0 ? totalSales * 0.95 : 50000; 
  const variance = ((totalSales - budget) / budget) * 100;

  // Mock Sales Trend Data
  const trendData = [
    { name: 'Mon', actual: 4000, budget: 4400, forecast: 4200 },
    { name: 'Tue', actual: 3000, budget: 3200, forecast: 3100 },
    { name: 'Wed', actual: 2000, budget: 2400, forecast: 2200 },
    { name: 'Thu', actual: 2780, budget: 2900, forecast: 2800 },
    { name: 'Fri', actual: 5890, budget: 4800, forecast: 6000 },
    { name: 'Sat', actual: 6390, budget: 5800, forecast: 6500 },
    { name: 'Sun', actual: 5490, budget: 4300, forecast: 5600 },
  ];

  // Mock Category Distribution
  const categoryData = [
    { name: 'Food', value: 65, color: '#3b82f6' },
    { name: 'Beverage (N/A)', value: 15, color: '#10b981' },
    { name: 'Alcohol', value: 18, color: '#8b5cf6' },
    { name: 'Merch', value: 2, color: '#f59e0b' },
  ];

  // Mock Controllable P&L
  const pnlData = [
    { category: 'Sales', actual: 125000, budget: 120000, variance: 4.1 },
    { category: 'COGS', actual: 35000, budget: 33600, variance: -4.1 },
    { category: 'Labor', actual: 38000, budget: 36000, variance: -5.5 },
    { category: 'Controllables', actual: 12000, budget: 12500, variance: 4.0 },
    { category: 'Prime Cost', actual: 73000, budget: 69600, variance: -4.8 },
  ];

  // Mock Price Movers
  const moversData = [
    { item: 'Ribeye Steak 12oz', currentPrice: 18.50, previousPrice: 14.25, change: 29.8, status: 'critical' },
    { item: 'Avocado (Case)', currentPrice: 45.00, previousPrice: 38.00, change: 18.4, status: 'warning' },
    { item: 'Fry Oil (Jug)', currentPrice: 22.00, previousPrice: 28.00, change: -21.4, status: 'positive' },
    { item: 'Chicken Breast', currentPrice: 2.15, previousPrice: 2.10, change: 2.3, status: 'neutral' },
  ];

  return (
    <div className="space-y-6 animate-fade-in-scale">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Performance Analytics</h1>
          <p className="text-muted-foreground mt-1 text-lg">High-level KPIs, actual vs budget, and trend analysis.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start">
          <TabsTrigger value="sales" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales vs Budget</TabsTrigger>
          <TabsTrigger value="pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Controllable P&L</TabsTrigger>
          <TabsTrigger value="category" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Category Report</TabsTrigger>
          <TabsTrigger value="movers" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Price Movers</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass-card shadow-sm border-border/50">
              <CardContent className="p-6 flex flex-col justify-center">
                <p className="text-sm font-medium text-muted-foreground flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Period-to-Date Sales
                </p>
                <p className="text-4xl font-bold mt-2">${totalSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                <div className={`flex items-center text-sm mt-3 font-medium ${variance >= 0 ? 'text-resend-green' : 'text-resend-red'}`}>
                  {variance >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  {variance > 0 ? '+' : ''}{variance.toFixed(1)}% vs budget
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card shadow-sm border-border/50">
              <CardContent className="p-6 flex flex-col justify-center">
                <p className="text-sm font-medium text-muted-foreground flex items-center">
                  <Package className="w-4 h-4 mr-2" />
                  Budget Pacing
                </p>
                <p className="text-4xl font-bold mt-2">{totalSales > 0 ? ((totalSales / budget) * 100).toFixed(1) : 0}%</p>
                <Progress value={totalSales > 0 ? (totalSales / budget) * 100 : 0} className="mt-3 h-2" />
                <div className="flex items-center text-muted-foreground text-sm mt-3 font-medium">
                  {totalSales >= budget ? 'On track to beat target' : 'Behind target pace'}
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card shadow-sm bg-gradient-to-br from-brand/10 to-brand/5 border-brand/20">
              <CardContent className="p-6 flex flex-col justify-center">
                <p className="text-sm text-brand-dark font-medium flex items-center">
                  <Users className="w-4 h-4 mr-2 text-brand" />
                  AI Forecast (Next 7 Days)
                </p>
                <p className="text-4xl font-bold mt-2 text-brand-dark">${(budget * 0.25).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                <div className="flex items-center text-brand text-sm mt-3 font-medium">
                  <ArrowRight className="w-4 h-4 mr-1" /> Expected strong weekend volume
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 glass-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Sales Trend</CardTitle>
                <CardDescription>Daily actual sales compared to budget and forecast</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280'}} dx={-10} tickFormatter={(val) => `$${val/1000}k`} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value) => [`$${value}`, 'Sales']}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Area type="monotone" dataKey="actual" name="Actual Sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                    <Area type="monotone" dataKey="budget" name="Budget" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Category Breakdown</CardTitle>
                <CardDescription>Sales distribution by product category</CardDescription>
              </CardHeader>
              <CardContent className="h-80 flex flex-col justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value) => [`${value}%`, 'Share']} />
                    <Legend layout="vertical" verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pnl" className="space-y-6">
          <Card className="glass-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Controllable P&L</CardTitle>
              <CardDescription>Period-to-date performance against budget</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnlData.map((item, idx) => {
                    const isPositive = item.category === 'Sales' ? item.variance >= 0 : item.variance <= 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.category}</TableCell>
                        <TableCell className="text-right">${item.actual.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${item.budget.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={isPositive ? 'text-resend-green' : 'text-resend-red'}>
                            {item.variance > 0 ? '+' : ''}{item.variance}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {isPositive ? (
                            <Badge className="bg-resend-green/10 text-resend-green hover:bg-resend-green/20">On Target</Badge>
                          ) : (
                            <Badge className="bg-resend-red/10 text-resend-red hover:bg-resend-red/20">Over Budget</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category" className="space-y-6">
          <Card className="glass-card shadow-sm border-border/50 p-8 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Category Report</h3>
            <p className="text-muted-foreground">Detailed category breakdown is currently pulling historical data. Expected completion shortly.</p>
          </Card>
        </TabsContent>

        <TabsContent value="movers" className="space-y-6">
          <Card className="glass-card shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Price Movers & Alerts</CardTitle>
              <CardDescription>Ingredients with significant price changes affecting your COGS</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Previous Price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moversData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {item.status === 'critical' && <AlertTriangle className="w-4 h-4 text-resend-red" />}
                        {item.item}
                      </TableCell>
                      <TableCell className="text-right">${item.currentPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${item.previousPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <span className={item.change > 0 ? 'text-resend-red' : item.change < 0 ? 'text-resend-green' : 'text-muted-foreground'}>
                          {item.change > 0 ? '+' : ''}{item.change}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'critical' && <Badge className="bg-resend-red/10 text-resend-red">High</Badge>}
                        {item.status === 'warning' && <Badge className="bg-resend-yellow/10 text-resend-yellow">Medium</Badge>}
                        {item.status === 'positive' && <Badge className="bg-resend-green/10 text-resend-green">Favorable</Badge>}
                        {item.status === 'neutral' && <Badge variant="outline">Low</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
