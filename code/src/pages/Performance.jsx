import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, AlertTriangle, Package, Users, Upload, Link as LinkIcon, Target, CalendarDays, ReceiptText, ClipboardList } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import AvTCosting from './AvTCosting';
import { SalesReportWidget } from '../components/performance/SalesReportWidget';
import { SalesForecastWidget } from '../components/performance/SalesForecastWidget';
import { UsageReportWidget } from '../components/performance/UsageReportWidget';
import { ActionCenterWidget } from '../components/performance/ActionCenterWidget';
import { ExplainableVarianceWidget } from '../components/performance/ExplainableVarianceWidget';
import PredictiveAlerts from '../components/labor/PredictiveAlerts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff7300', '#38bdf8', '#fbbf24'];

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

const sameDate = (value, target) => {
  if (!value || !target) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === target;
};

export default function Performance() {
  const [activeTab, setActiveTab] = useState('overview');
  const [budgetDrafts, setBudgetDrafts] = useState({});
  const queryClient = useQueryClient();

  const { organization, brand, location, userProfile } = useAuth();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const todayKey = now.toISOString().slice(0, 10);

  const { data: rawSalesData, isLoading: loadingSales } = useAuthQuery({
    queryKey: ['pos_sales_data', organization?.id],
    queryFn: () => api.entities.PosSalesData.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const salesData = rawSalesData || [];

  const { data: rawInvoices, isLoading: loadingInvoices } = useAuthQuery({
    queryKey: ['invoices', organization?.id],
    queryFn: () => api.entities.Invoice.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const invoices = rawInvoices || [];

  const { data: rawShifts } = useAuthQuery({
    queryKey: ['employee_shifts', organization?.id],
    queryFn: () => api.entities.EmployeeShift.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const shifts = rawShifts || [];

  const { data: rawAllocations } = useAuthQuery({
    queryKey: ['invoice_allocations', organization?.id],
    queryFn: () => api.entities.InvoiceAllocation.list(),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const allocations = rawAllocations || [];

  const { data: rawLineItems } = useAuthQuery({
    queryKey: ['invoice_line_items', organization?.id],
    queryFn: () => api.entities.InvoiceLineItem.list('-created_at'),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!organization?.id,
  });
  const lineItems = rawLineItems || [];

  const { data: rawBudgetTargets } = useAuthQuery({
    queryKey: ['budget_targets', organization?.id, brand?.id, location?.id, periodStart, periodEnd],
    queryFn: () => api.entities.BudgetTarget.filter({ organization_id: organization?.id }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location })
      .filter((target) => target.period_start === periodStart && target.period_end === periodEnd), [organization, brand, location, periodStart, periodEnd]),
    enabled: !!organization?.id,
  });
  const budgetTargets = rawBudgetTargets || [];

  const budgetByCategory = useMemo(() => {
    const map = {};
    budgetTargets.forEach((target) => {
      map[target.category] = target;
    });
    return map;
  }, [budgetTargets]);

  const saveBudgetTarget = useMutation({
    mutationFn: async ({ category, targetAmount, targetPercent = null }) => {
      const existing = budgetByCategory[category];
      const payload = {
        organization_id: organization?.id,
        brand_id: brand?.id || null,
        location_id: location?.id || null,
        period_start: periodStart,
        period_end: periodEnd,
        category,
        target_amount: Number(targetAmount || 0),
        target_percent: targetPercent == null ? null : Number(targetPercent),
        created_by: userProfile?.id || null,
        updated_by: userProfile?.id || null,
      };
      if (existing) return api.entities.BudgetTarget.update(existing.id, payload);
      return api.entities.BudgetTarget.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget_targets'] });
      toast.success('Budget target saved');
    },
    onError: (error) => toast.error(error.message || 'Failed to save budget target'),
  });

  // --- CORE CALCULATIONS ---
  const totalSales = salesData.reduce((sum, record) => sum + Number(record.revenue || record.total_sales || 0), 0);
  const totalLaborCost = shifts.reduce((sum, shift) => sum + (Number(shift.labor_cost) || 0), 0);

  const lineItemAllocations = allocations.filter(a => a.allocation_type === 'line_items');
  let totalCogs = 0;
  if (lineItemAllocations.length > 0) {
    totalCogs = lineItemAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  } else {
    totalCogs = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  }

  const primeCost = totalCogs + totalLaborCost;

  const salesBudgetTarget = Number(budgetByCategory.Sales?.target_amount || 0);
  const budget = salesBudgetTarget > 0 ? salesBudgetTarget : (totalSales > 0 ? totalSales * 0.95 : 0);
  const variance = budget > 0 ? ((totalSales - budget) / budget) * 100 : 0;

  // --- TREND DATA ---
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const trendMap = Object.fromEntries(days.map(d => [d, { name: d, actual: 0, budget: 0, forecast: 0 }]));
  salesData.forEach(sale => {
    const d = new Date(sale.sale_date || sale.created_at);
    if (!isNaN(d)) {
      const dayName = days[d.getDay()];
      const rev = Number(sale.revenue || sale.total_sales || 0);
      trendMap[dayName].actual += rev;
      trendMap[dayName].budget += budget > 0 ? budget / 7 : rev * 0.95; 
      trendMap[dayName].forecast += rev * 1.05;
    }
  });
  const trendData = days.map(d => trendMap[d]);

  // --- PRICE MOVERS ---
  const moversData = useMemo(() => {
    const map = {};
    lineItems.forEach(item => {
      const name = item.item_name || item.description || 'Unknown';
      if (!map[name]) map[name] = [];
      map[name].push({ price: Number(item.unit_price), date: new Date(item.created_at || new Date()).getTime() });
    });

    const result = [];
    Object.entries(map).forEach(([name, prices]) => {
      if (prices.length > 1) {
        prices.sort((a, b) => b.date - a.date);
        const currentPrice = prices[0].price;
        let previousPrice = prices[1].price;
        for (let i=1; i<prices.length; i++) {
          if (prices[i].price !== currentPrice) {
            previousPrice = prices[i].price;
            break;
          }
        }
        
        if (previousPrice > 0 && currentPrice !== previousPrice) {
          const change = ((currentPrice - previousPrice) / previousPrice) * 100;
          let status = 'neutral';
          if (change > 5) status = 'critical';
          else if (change > 0) status = 'warning';
          else if (change < 0) status = 'positive';

          result.push({ item: name, currentPrice, previousPrice, change: Number(change.toFixed(1)), status });
        }
      }
    });
    return result.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [lineItems]);

  // --- CATEGORY REPORT ---
  const categoryReportData = useMemo(() => {
    const map = {};
    if (lineItemAllocations.length > 0) {
      lineItemAllocations.forEach(a => {
        const cat = a.category_name || 'Uncategorized';
        map[cat] = (map[cat] || 0) + Number(a.amount || 0);
      });
    } else {
      invoices.forEach(inv => {
        const cat = inv.category || 'General';
        map[cat] = (map[cat] || 0) + Number(inv.total_amount || 0);
      });
    }

    return Object.entries(map)
      .map(([name, spend]) => ({ name, spend, pct: totalCogs > 0 ? (spend / totalCogs) * 100 : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }, [allocations, invoices, totalCogs]);

  const categoryPieData = categoryReportData.map((d, i) => ({
    name: d.name,
    value: d.spend,
    color: COLORS[i % COLORS.length]
  }));
  if (categoryPieData.length === 0) {
    categoryPieData.push({ name: 'No Data', value: 1, color: '#e5e7eb' });
  }

  // --- P&L DATA ---
  const getTarget = (category, fallback) => Number(budgetByCategory[category]?.target_amount || fallback || 0);
  const pnlData = [
    { category: 'Sales', actual: totalSales, budget: getTarget('Sales', budget) },
    { category: 'COGS', actual: totalCogs, budget: getTarget('COGS', totalCogs * 0.95) },
    { category: 'Labor', actual: totalLaborCost, budget: getTarget('Labor', totalSales * 0.28) },
    { category: 'Controllables', actual: 0, budget: getTarget('Controllables', 0) },
    { category: 'Prime Cost', actual: primeCost, budget: getTarget('Prime Cost', totalCogs * 0.95 + (totalSales * 0.28)) },
  ].map((row) => ({
    ...row,
    variance: row.budget > 0 ? ((row.actual - row.budget) / row.budget) * 100 : 0,
  }));

  const dailyPnl = useMemo(() => {
    const todaysSales = salesData.reduce((sum, record) => {
      const dateValue = record.sale_date || record.date || record.created_at;
      return sameDate(dateValue, todayKey) ? sum + Number(record.revenue || record.total_sales || 0) : sum;
    }, 0);

    const todaysInvoices = invoices.filter((invoice) => sameDate(invoice.invoice_date || invoice.created_at, todayKey));
    const todaysInvoiceSpend = todaysInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);

    const todaysLabor = shifts.reduce((sum, shift) => {
      const dateValue = shift.shift_start || shift.start_time || shift.created_at;
      return sameDate(dateValue, todayKey) ? sum + Number(shift.labor_cost || 0) : sum;
    }, 0);

    const periodDaysElapsed = Math.max(1, Math.min(now.getDate(), new Date(periodEnd).getDate()));
    const dailySalesTarget = Number(budgetByCategory.Sales?.target_amount || 0) / periodDaysElapsed || (totalSales ? totalSales / periodDaysElapsed : 0);
    const dailyCogsTarget = Number(budgetByCategory.COGS?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.32);
    const dailyLaborTarget = Number(budgetByCategory.Labor?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.28);
    const dailyPrimeTarget = Number(budgetByCategory['Prime Cost']?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.6);
    const prime = todaysInvoiceSpend + todaysLabor;

    const pendingInvoices = invoices.filter((invoice) => ['pending_review', 'validated', 'flagged'].includes(invoice.status));
    const missingInvoiceRisk = todaysSales > 0 && todaysInvoiceSpend === 0;
    const highPriceMovers = moversData.filter((item) => item.status === 'critical' || item.status === 'warning').slice(0, 5);

    const alerts = [];
    if (missingInvoiceRisk) alerts.push({ tone: 'orange', title: 'Sales without invoice spend', body: 'Today has POS sales but no same-day invoice spend. Confirm vendor documents are uploaded.' });
    if (todaysSales > 0 && (todaysInvoiceSpend / todaysSales) * 100 > 32) alerts.push({ tone: 'red', title: 'COGS above target', body: `Today COGS is ${pct((todaysInvoiceSpend / todaysSales) * 100)} against a 32.0% guardrail.` });
    if (todaysSales > 0 && (todaysLabor / todaysSales) * 100 > 28) alerts.push({ tone: 'red', title: 'Labor above target', body: `Today labor is ${pct((todaysLabor / todaysSales) * 100)} against a 28.0% guardrail.` });
    if (pendingInvoices.length > 0) alerts.push({ tone: 'blue', title: `${pendingInvoices.length} invoices need review`, body: 'Clear invoice review so AP, inventory, and P&L stay current.' });
    if (highPriceMovers.length > 0) alerts.push({ tone: 'orange', title: `${highPriceMovers.length} price movers`, body: 'Review vendor item price increases before they distort food cost.' });

    return {
      rows: [
        { label: 'Sales', actual: todaysSales, target: dailySalesTarget, kind: 'sales' },
        { label: 'COGS', actual: todaysInvoiceSpend, target: dailyCogsTarget, kind: 'cost' },
        { label: 'Labor', actual: todaysLabor, target: dailyLaborTarget, kind: 'cost' },
        { label: 'Prime Cost', actual: prime, target: dailyPrimeTarget, kind: 'cost' },
      ].map((row) => ({
        ...row,
        percentOfSales: todaysSales > 0 ? (row.actual / todaysSales) * 100 : 0,
        variance: row.target > 0 ? ((row.actual - row.target) / row.target) * 100 : 0,
      })),
      todaysSales,
      todaysInvoiceSpend,
      todaysLabor,
      prime,
      primePercent: todaysSales > 0 ? (prime / todaysSales) * 100 : 0,
      grossProfit: todaysSales - todaysInvoiceSpend,
      estimatedControllableProfit: todaysSales - prime,
      invoicesCaptured: todaysInvoices.length,
      pendingInvoices,
      highPriceMovers,
      alerts,
      coverage: [
        { label: 'POS Sales', ready: salesData.length > 0, count: salesData.length },
        { label: 'Invoices', ready: invoices.length > 0, count: invoices.length },
        { label: 'Labor', ready: shifts.length > 0, count: shifts.length },
        { label: 'Budgets', ready: budgetTargets.length > 0, count: budgetTargets.length },
      ],
    };
  }, [salesData, invoices, shifts, todayKey, budgetByCategory, periodEnd, totalSales, moversData, budgetTargets.length]);

  // --- EMPTY STATES ---
  if (!loadingSales && !loadingInvoices && salesData.length === 0 && invoices.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in-scale max-w-5xl mx-auto mt-12">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">Welcome to Performance</h1>
          <p className="text-muted-foreground text-lg">Connect your data sources to unlock real-time financial analytics.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="glass-card shadow-sm hover:shadow-md transition-all border-border/50 text-center flex flex-col items-center justify-center p-8">
            <div className="h-16 w-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
              <LinkIcon className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Connect POS</h3>
            <p className="text-sm text-muted-foreground mb-6">Sync your sales, labor, and product mix automatically.</p>
            <Button className="w-full">Integrations</Button>
          </Card>
          <Card className="glass-card shadow-sm hover:shadow-md transition-all border-border/50 text-center flex flex-col items-center justify-center p-8">
            <div className="h-16 w-16 bg-resend-green/10 rounded-full flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-resend-green" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload Invoices</h3>
            <p className="text-sm text-muted-foreground mb-6">Digitize your invoices to track COGS and price movers.</p>
            <Button className="w-full bg-resend-green hover:bg-resend-green/90 text-white">Upload Now</Button>
          </Card>
          <Card className="glass-card shadow-sm hover:shadow-md transition-all border-border/50 text-center flex flex-col items-center justify-center p-8">
            <div className="h-16 w-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
              <Target className="h-8 w-8 text-purple-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Set Budgets</h3>
            <p className="text-sm text-muted-foreground mb-6">Define your targets for Sales, COGS, and Labor.</p>
            <Button variant="outline" className="w-full" onClick={() => setActiveTab('budget')}>Configure</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-scale flex flex-col h-full w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Performance Analytics</h1>
          <p className="text-muted-foreground mt-1 text-lg">High-level KPIs, actual vs budget, and trend analysis.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start shrink-0">
          <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Overview</TabsTrigger>
          <TabsTrigger value="daily_pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Daily P&L</TabsTrigger>
          <TabsTrigger value="pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Controllable P&L</TabsTrigger>
          <TabsTrigger value="category" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Category Report</TabsTrigger>
          <TabsTrigger value="movers" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Price Movers</TabsTrigger>
          <TabsTrigger value="sales_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Report</TabsTrigger>
          <TabsTrigger value="sales_forecast" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Forecast</TabsTrigger>
          <TabsTrigger value="usage_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Usage Report</TabsTrigger>
          <TabsTrigger value="avt" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Theoretical Usage (AvT)</TabsTrigger>
          <TabsTrigger value="variance" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Variance Breakdown</TabsTrigger>
          <TabsTrigger value="action_center" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Action Center</TabsTrigger>
          <TabsTrigger value="budget" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Budget Setup</TabsTrigger>
        </TabsList>

        <div className="flex-1 w-full relative">
          <TabsContent value="overview" className="space-y-6 m-0 h-full">
            {/* Top KPIs Grid - Perfectly Aligned */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="glass-card shadow-sm border-border/50 h-[140px] flex flex-col justify-center">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center mb-1">
                    <TrendingUp className="w-4 h-4 mr-2" /> Sales
                  </p>
                  <p className="text-3xl font-bold">${totalSales.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                  <div className={`text-sm mt-2 font-medium ${variance >= 0 ? 'text-resend-green' : 'text-resend-red'}`}>
                    {variance > 0 ? '+' : ''}{variance.toFixed(1)}% vs budget
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50 h-[140px] flex flex-col justify-center">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center mb-1">
                    <Package className="w-4 h-4 mr-2" /> COGS
                  </p>
                  <p className="text-3xl font-bold">${totalCogs.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                  <div className="text-sm mt-2 font-medium text-muted-foreground">
                    {totalSales > 0 ? ((totalCogs / totalSales) * 100).toFixed(1) : 0}% of sales
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50 h-[140px] flex flex-col justify-center">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center mb-1">
                    <Users className="w-4 h-4 mr-2" /> Labor
                  </p>
                  <p className="text-3xl font-bold">${totalLaborCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                  <div className="text-sm mt-2 font-medium text-muted-foreground">
                    {totalSales > 0 ? ((totalLaborCost / totalSales) * 100).toFixed(1) : 0}% of sales
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50 h-[140px] flex flex-col justify-center bg-gradient-to-br from-brand/5 to-brand/10">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-brand-dark flex items-center mb-1">
                    <DollarSign className="w-4 h-4 mr-2 text-brand" /> Prime Cost
                  </p>
                  <p className="text-3xl font-bold text-brand-dark">${primeCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
                  <div className="text-sm mt-2 font-medium text-brand">
                    {totalSales > 0 ? ((primeCost / totalSales) * 100).toFixed(1) : 0}% of sales
                  </div>
                </CardContent>
              </Card>
            </div>

            <PredictiveAlerts />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sales Trend Chart */}
              <Card className="lg:col-span-2 glass-card shadow-sm border-border/50 flex flex-col min-h-[400px]">
                <CardHeader className="shrink-0">
                  <CardTitle className="text-lg">Sales Trend</CardTitle>
                  <CardDescription>Daily actual sales compared to budget and forecast</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dx={-10} tickFormatter={(val) => `$${val/1000}k`} />
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

              {/* Top Price Movers Widget */}
              <Card className="glass-card shadow-sm border-border/50 flex flex-col min-h-[400px]">
                <CardHeader className="shrink-0 pb-2">
                  <CardTitle className="text-lg flex justify-between items-center">
                    Top Price Movers
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('movers')} className="h-8 text-brand hover:text-brand-dark">View All</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto pr-2 pb-4">
                  <div className="space-y-4">
                    {moversData.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No recent price changes.</p>
                    ) : (
                      moversData.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/40">
                          <div className="overflow-hidden">
                            <p className="font-medium text-sm truncate pr-2">{item.item}</p>
                            <p className="text-xs text-muted-foreground">${item.previousPrice} → ${item.currentPrice}</p>
                          </div>
                          <Badge variant="outline" className={item.change > 0 ? 'bg-resend-red/10 text-resend-red border-resend-red/20' : 'bg-resend-green/10 text-resend-green border-resend-green/20'}>
                            {item.change > 0 ? '+' : ''}{item.change}%
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="daily_pnl" className="space-y-6 m-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <Card className="glass-card shadow-sm border-border/50">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" /> Today's Sales
                  </p>
                  <p className="text-3xl font-bold mt-2">{money(dailyPnl.todaysSales)}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {dailyPnl.invoicesCaptured} invoice{dailyPnl.invoicesCaptured === 1 ? '' : 's'} captured today
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package className="w-4 h-4" /> Today's COGS
                  </p>
                  <p className="text-3xl font-bold mt-2">{money(dailyPnl.todaysInvoiceSpend)}</p>
                  <p className={dailyPnl.todaysSales > 0 && (dailyPnl.todaysInvoiceSpend / dailyPnl.todaysSales) * 100 > 32 ? 'text-sm text-resend-red mt-2' : 'text-sm text-muted-foreground mt-2'}>
                    {pct(dailyPnl.todaysSales > 0 ? (dailyPnl.todaysInvoiceSpend / dailyPnl.todaysSales) * 100 : 0)} of sales
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" /> Today's Labor
                  </p>
                  <p className="text-3xl font-bold mt-2">{money(dailyPnl.todaysLabor)}</p>
                  <p className={dailyPnl.todaysSales > 0 && (dailyPnl.todaysLabor / dailyPnl.todaysSales) * 100 > 28 ? 'text-sm text-resend-red mt-2' : 'text-sm text-muted-foreground mt-2'}>
                    {pct(dailyPnl.todaysSales > 0 ? (dailyPnl.todaysLabor / dailyPnl.todaysSales) * 100 : 0)} of sales
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50 bg-gradient-to-br from-brand/5 to-brand/10">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-brand-dark flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-brand" /> Prime Cost
                  </p>
                  <p className="text-3xl font-bold mt-2 text-brand-dark">{pct(dailyPnl.primePercent)}</p>
                  <p className="text-sm text-brand mt-2">{money(dailyPnl.prime)} total today</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="xl:col-span-2 glass-card shadow-sm border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ReceiptText className="h-5 w-5 text-brand" />
                    Daily Restaurant P&L
                  </CardTitle>
                  <CardDescription>Same-day performance using POS sales, invoices, labor, and current targets.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">% Sales</TableHead>
                          <TableHead className="text-right">Daily Target</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyPnl.rows.map((row) => {
                          const isGood = row.kind === 'sales' ? row.actual >= row.target : row.actual <= row.target;
                          return (
                            <TableRow key={row.label}>
                              <TableCell className="font-medium">{row.label}</TableCell>
                              <TableCell className="text-right">{money(row.actual)}</TableCell>
                              <TableCell className="text-right">{row.label === 'Sales' ? '-' : pct(row.percentOfSales)}</TableCell>
                              <TableCell className="text-right">{money(row.target)}</TableCell>
                              <TableCell className={isGood ? 'text-right text-resend-green' : 'text-right text-resend-red'}>
                                {row.variance > 0 ? '+' : ''}{pct(row.variance)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge className={isGood ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-red/10 text-resend-red'}>
                                  {isGood ? 'On Track' : 'Review'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow>
                          <TableCell className="font-semibold">Gross Profit</TableCell>
                          <TableCell className="text-right font-semibold">{money(dailyPnl.grossProfit)}</TableCell>
                          <TableCell className="text-right">{pct(dailyPnl.todaysSales > 0 ? (dailyPnl.grossProfit / dailyPnl.todaysSales) * 100 : 0)}</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right"><Badge variant="outline">Calculated</Badge></TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-semibold">Est. Controllable Profit</TableCell>
                          <TableCell className="text-right font-semibold">{money(dailyPnl.estimatedControllableProfit)}</TableCell>
                          <TableCell className="text-right">{pct(dailyPnl.todaysSales > 0 ? (dailyPnl.estimatedControllableProfit / dailyPnl.todaysSales) * 100 : 0)}</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right"><Badge variant="outline">Estimate</Badge></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="glass-card shadow-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-brand" />
                      Data Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dailyPnl.coverage.map((source) => (
                      <div key={source.label} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{source.label}</p>
                          <p className="text-xs text-muted-foreground">{source.count} records in scope</p>
                        </div>
                        <Badge className={source.ready ? 'bg-resend-green/10 text-resend-green' : 'bg-resend-orange/10 text-resend-orange'}>
                          {source.ready ? 'Live' : 'Missing'}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="glass-card shadow-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Daily Exceptions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dailyPnl.alerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No daily P&L exceptions right now.</p>
                    ) : dailyPnl.alerts.map((alert, index) => (
                      <div key={`${alert.title}-${index}`} className="rounded-md border border-border/50 px-3 py-2">
                        <p className={alert.tone === 'red' ? 'text-sm font-semibold text-resend-red' : alert.tone === 'orange' ? 'text-sm font-semibold text-resend-orange' : 'text-sm font-semibold text-brand'}>
                          {alert.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{alert.body}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="glass-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>Top Cost Changes Feeding P&L</CardTitle>
                <CardDescription>Vendor price movements that can affect food cost and recipe margins.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {dailyPnl.highPriceMovers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No high-impact price movers yet.</p>
                  ) : dailyPnl.highPriceMovers.map((item) => (
                    <div key={item.item} className="rounded-md border border-border/50 px-3 py-3">
                      <p className="font-medium truncate">{item.item}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        ${item.previousPrice.toFixed(2)} to ${item.currentPrice.toFixed(2)}
                      </p>
                      <Badge className={item.change > 0 ? 'mt-3 bg-resend-red/10 text-resend-red' : 'mt-3 bg-resend-green/10 text-resend-green'}>
                        {item.change > 0 ? '+' : ''}{item.change}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6 m-0">
            <Card className="glass-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>Controllable P&L</CardTitle>
                <CardDescription>Period-to-date performance against budget</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto w-full">
                  <Table className="w-full">
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
                            <TableCell className="font-medium whitespace-nowrap">{item.category}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">${item.actual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">${item.budget.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={isPositive ? 'text-resend-green' : 'text-resend-red'}>
                                {item.variance > 0 ? '+' : ''}{item.variance.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
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
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="category" className="space-y-6 m-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 glass-card shadow-sm border-border/50">
                <CardHeader>
                  <CardTitle>Category Spend</CardTitle>
                  <CardDescription>Breakdown of COGS across categories</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto w-full">
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="text-right">% of COGS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryReportData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No category data available.</TableCell>
                          </TableRow>
                        ) : (
                          categoryReportData.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">${item.spend.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{item.pct.toFixed(1)}%</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card shadow-sm border-border/50 flex flex-col min-h-[400px]">
                <CardHeader className="shrink-0">
                  <CardTitle>Distribution</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Spend']} />
                      <Legend layout="vertical" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="movers" className="space-y-6 m-0">
            <Card className="glass-card shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>Price Movers & Alerts</CardTitle>
                <CardDescription>Tracking all ingredient price changes across recent invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto w-full">
                  <Table className="w-full">
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
                      {moversData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No price movements recorded yet.</TableCell>
                        </TableRow>
                      ) : (
                        moversData.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium whitespace-nowrap flex items-center gap-2">
                              {item.status === 'critical' && <AlertTriangle className="w-4 h-4 text-resend-red shrink-0" />}
                              <span className="truncate max-w-[150px] sm:max-w-xs">{item.item}</span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">${item.currentPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">${item.previousPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={item.change > 0 ? 'text-resend-red' : item.change < 0 ? 'text-resend-green' : 'text-muted-foreground'}>
                                {item.change > 0 ? '+' : ''}{item.change}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {item.status === 'critical' && <Badge className="bg-resend-red/10 text-resend-red">High</Badge>}
                              {item.status === 'warning' && <Badge className="bg-resend-yellow/10 text-resend-yellow">Medium</Badge>}
                              {item.status === 'positive' && <Badge className="bg-resend-green/10 text-resend-green">Favorable</Badge>}
                              {item.status === 'neutral' && <Badge variant="outline">Low</Badge>}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="budget" className="space-y-6 m-0">
            <Card className="glass-card shadow-sm border-border/50 max-w-4xl">
              <CardHeader>
                <CardTitle>Budget Setup</CardTitle>
                <CardDescription>Set current-period targets used by sales pacing and controllable P&L.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto w-full">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Current Target</TableHead>
                        <TableHead>New Target</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['Sales', 'COGS', 'Labor', 'Controllables', 'Prime Cost'].map((category) => (
                        <TableRow key={category}>
                          <TableCell className="font-medium whitespace-nowrap">{category}</TableCell>
                          <TableCell className="whitespace-nowrap">${Number(budgetByCategory[category]?.target_amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="min-w-[120px]">
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={budgetDrafts[category] ?? budgetByCategory[category]?.target_amount ?? ''}
                              onChange={(event) => setBudgetDrafts((prev) => ({ ...prev, [category]: event.target.value }))}
                              className="w-full sm:max-w-40"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saveBudgetTarget.isPending}
                              onClick={() => saveBudgetTarget.mutate({
                                category,
                                targetAmount: budgetDrafts[category] ?? budgetByCategory[category]?.target_amount ?? 0,
                              })}
                            >
                              Save
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales_report" className="space-y-6 m-0">
            <SalesReportWidget salesData={salesData} />
          </TabsContent>

          <TabsContent value="sales_forecast" className="space-y-6 m-0">
            <SalesForecastWidget salesData={salesData} />
          </TabsContent>

          <TabsContent value="usage_report" className="space-y-6 m-0">
            <UsageReportWidget />
          </TabsContent>

          <TabsContent value="avt" className="space-y-0 m-0">
            <AvTCosting />
          </TabsContent>

          <TabsContent value="variance" className="space-y-6 m-0">
            <ExplainableVarianceWidget varianceTotal={totalSales - budget} />
          </TabsContent>

          <TabsContent value="action_center" className="space-y-6 m-0">
            <ActionCenterWidget />
          </TabsContent>


        </div>
      </Tabs>
    </div>
  );
}
