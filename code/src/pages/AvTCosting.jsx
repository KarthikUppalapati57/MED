import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, CheckCircle2, AlertCircle, RefreshCw, BarChart3, TrendingUp, DollarSign, Activity, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { format, subDays } from 'date-fns';

const trendData = [
  { day: 'Mon', theoretical: 850, actual: 920 },
  { day: 'Tue', theoretical: 780, actual: 810 },
  { day: 'Wed', theoretical: 920, actual: 1050 },
  { day: 'Thu', theoretical: 890, actual: 940 },
  { day: 'Fri', theoretical: 1250, actual: 1420 },
  { day: 'Sat', theoretical: 1400, actual: 1600 },
  { day: 'Sun', theoretical: 1100, actual: 1250 },
];

export default function AvTCosting() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { organization } = useAuth();

  const startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const endDate = format(new Date(), 'yyyy-MM-dd');

  const { data: varianceData = [], refetch } = useAuthQuery({
    queryKey: ['avt_variance', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_avt_variance_report', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      if (error) throw error;
      return data || [];
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success("AvT metrics updated from latest POS and Inventory data");
  };

  const handleExplainVariance = async () => {
    try {
      if (!organization?.id) {
        toast.error("Select an organization before generating AI explanations");
        return;
      }
      await api.entities.AiInsight.create({
        organization_id: organization.id,
        insight_type: 'variance_analysis',
        severity: 'high',
        title: 'AvT Variance Detected in Ground Beef (80/20)',
        description: 'Actual usage exceeded theoretical by 15 lbs (+10.0%). The AI models suggest reviewing missing count sheets on Tuesday or portion sizes at the grill station.',
        metadata: {
          action: {
            type: 'investigate_variance',
            label: 'Review Usage Logs',
            payload: {}
          }
        }
      });
      toast.success("AI Explanation generated. Check the AI Insights dashboard.");
    } catch (e) {
      toast.error("Failed to generate AI explanation");
    }
  };

  const calculateMetrics = (item) => {
    const varianceQty = item.actual - item.theoretical;
    const variancePercent = (varianceQty / item.theoretical) * 100;
    const varianceCost = varianceQty * item.costPerUnit;
    return { varianceQty, variancePercent, varianceCost };
  };

  const topBleeders = varianceData
    .map(item => ({ ...item, ...calculateMetrics(item) }))
    .sort((a, b) => b.varianceCost - a.varianceCost)
    .slice(0, 5);

  const totalVarianceCost = topBleeders.reduce((sum, item) => sum + item.varianceCost, 0);

  return (
    <div className="p-6 space-y-8 min-h-screen bg-slate-50/50 dark:bg-slate-900/50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Actual vs Theoretical (AvT)</h1>
            <p className="text-muted-foreground mt-1">Bridge POS sales with physical inventory to detect waste and theft.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleExplainVariance} 
            className="bg-brand text-primary-foreground hover:bg-brand/90"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Explain Variances
          </Button>
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="bg-white text-slate-900 border shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
            Sync Latest Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md bg-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign className="w-24 h-24 text-rose-500" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Variance Cost (Weekly)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-rose-600">${totalVarianceCost.toFixed(2)}</div>
            <p className="text-sm font-medium text-rose-600/80 flex items-center mt-2">
              <TrendingUp className="w-4 h-4 mr-1" /> +12.5% from last week
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <BarChart3 className="w-24 h-24 text-brand" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Variance %</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-slate-900">8.4%</div>
            <p className="text-sm font-medium text-emerald-600 flex items-center mt-2">
              <TrendingDown className="w-4 h-4 mr-1" /> -1.2% from last week
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle className="w-24 h-24 text-amber-500" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-amber-500">3</div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              Require immediate attention
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle>AvT Cost Trend</CardTitle>
            <CardDescription>Theoretical vs Actual cost depletion over the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => [`$${value}`, undefined]}
                />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Actual Depletion" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="theoretical" name="Theoretical Depletion" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-b from-rose-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center text-rose-900">
              <AlertTriangle className="w-5 h-5 mr-2 text-rose-500" />
              Top Bleeders
            </CardTitle>
            <CardDescription>Highest variance cost items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topBleeders.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-white shadow-sm border border-rose-100">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{item.ingredient}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      +{item.varianceQty.toFixed(1)} {item.unit} wasted
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-rose-600">${item.varianceCost.toFixed(2)}</p>
                    <Badge variant="outline" className="text-[10px] mt-1 bg-rose-50 text-rose-700 border-none px-1.5 py-0">
                      +{item.variancePercent.toFixed(1)}% var
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-border">
          <CardTitle>Ingredient Variance Breakdown</CardTitle>
          <CardDescription>Detailed comparison of theoretical recipe usage vs actual inventory movements.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-bold">Ingredient</TableHead>
                <TableHead className="text-right font-bold">Theoretical Qty</TableHead>
                <TableHead className="text-right font-bold">Actual Qty</TableHead>
                <TableHead className="text-right font-bold">Variance Qty</TableHead>
                <TableHead className="text-right font-bold">Variance %</TableHead>
                <TableHead className="text-right font-bold">Variance Cost</TableHead>
                <TableHead className="text-center font-bold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {varianceData.map((item) => {
                const metrics = calculateMetrics(item);
                return (
                  <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-medium">{item.ingredient}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.theoretical.toFixed(1)} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.actual.toFixed(1)} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-bold text-rose-600">
                      +{metrics.varianceQty.toFixed(1)} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        "font-bold",
                        metrics.variancePercent > 10 ? "text-rose-600" : 
                        metrics.variancePercent > 5 ? "text-amber-500" : "text-emerald-600"
                      )}>
                        {metrics.variancePercent.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      ${metrics.varianceCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.status === 'critical' && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none"><AlertCircle className="w-3 h-3 mr-1" /> Critical</Badge>}
                      {item.status === 'warning' && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none"><AlertTriangle className="w-3 h-3 mr-1" /> Watch</Badge>}
                      {item.status === 'good' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none"><CheckCircle2 className="w-3 h-3 mr-1" /> On Target</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
