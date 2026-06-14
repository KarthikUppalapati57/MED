import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Percent, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

export function ExplainableVarianceWidget({ varianceTotal = -1250.00 }) {
  // Mock data to demonstrate the breakdown of variance
  // Negative means margin loss (cost increase / revenue loss)
  const varianceBreakdown = [
    { category: 'Invoice Price Changes', value: -450, desc: 'Vendor cost increases (e.g. Ground Beef +12%)', color: '#ef4444' }, // red-500
    { category: 'Product Mix', value: 150, desc: 'Higher sales of high-margin items (e.g. Soda)', color: '#10b981' }, // emerald-500
    { category: 'Waste / Spoilage', value: -320, desc: 'Logged waste in prep & expired inventory', color: '#ef4444' },
    { category: 'Labor Pacing', value: -480, desc: 'Over-staffing during slow periods (Tue/Wed)', color: '#ef4444' },
    { category: 'Theft / Unlogged', value: -150, desc: 'AvT variance not accounted for by waste logs', color: '#f59e0b' }, // amber-500
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded shadow-md text-sm">
          <p className="font-semibold mb-1">{data.category}</p>
          <p className={`font-bold ${data.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ${Math.abs(data.value).toFixed(2)} {data.value > 0 ? 'Favorable' : 'Unfavorable'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{data.desc}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-card shadow-sm border-border/50 flex flex-col justify-center">
          <CardHeader className="pb-2">
            <CardTitle>Total Unexplained Variance</CardTitle>
            <CardDescription>Difference between theoretical budget and actual performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-rose-600 flex items-center">
              <TrendingDown className="w-8 h-8 mr-2" />
              -${Math.abs(varianceTotal).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              We have successfully isolated the root causes of 88% of this margin loss.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle>Top Drivers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {varianceBreakdown.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full`} style={{backgroundColor: item.color}}></div>
                  <span className="font-medium text-sm">{item.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${item.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {item.value > 0 ? '+' : '-'}${Math.abs(item.value)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Variance Waterfall Analysis</CardTitle>
          <CardDescription>Visual breakdown of exactly where margin was gained or lost this period</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={varianceBreakdown}
              margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(val) => `$${val}`} />
              <YAxis dataKey="category" type="category" width={120} tick={{fontSize: 12}} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                {varianceBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
