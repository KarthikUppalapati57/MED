import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Calendar, DollarSign } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { startOfWeek, startOfMonth, startOfYear, isAfter, subWeeks, subYears, format, parseISO } from 'date-fns';

export function SalesReportWidget({ salesData }) {
  const now = new Date();
  
  // Metrics: WTD, PTD, YTD
  const metrics = useMemo(() => {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday start
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);
    
    const lastWeekStart = subWeeks(weekStart, 1);
    const lastWeekEnd = subWeeks(now, 1);
    const lastYearStart = subYears(yearStart, 1);
    const lastYearEnd = subYears(now, 1);

    let wtd = 0, ptd = 0, ytd = 0;
    let wtdLastYear = 0, ptdLastYear = 0, ytdLastYear = 0;

    salesData.forEach(sale => {
      const date = parseISO(sale.sale_date || sale.created_at);
      const amount = Number(sale.revenue || sale.total_sales || 0);

      // Current Period
      if (isAfter(date, weekStart) || date.getTime() === weekStart.getTime()) wtd += amount;
      if (isAfter(date, monthStart) || date.getTime() === monthStart.getTime()) ptd += amount;
      if (isAfter(date, yearStart) || date.getTime() === yearStart.getTime()) ytd += amount;

      // Previous Period
      if (isAfter(date, subYears(weekStart, 1)) && date <= lastWeekEnd) wtdLastYear += amount;
      if (isAfter(date, subYears(monthStart, 1)) && date <= subYears(now, 1)) ptdLastYear += amount;
      if (isAfter(date, lastYearStart) && date <= lastYearEnd) ytdLastYear += amount;
    });

    return {
      wtd: { current: wtd, previous: wtdLastYear },
      ptd: { current: ptd, previous: ptdLastYear },
      ytd: { current: ytd, previous: ytdLastYear }
    };
  }, [salesData, now]);

  const calcChange = (curr, prev) => {
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  };

  const getStatusColor = (change) => {
    if (change > 0) return 'text-resend-green';
    if (change < 0) return 'text-resend-red';
    return 'text-muted-foreground';
  };

  const MetricCard = ({ title, current, previous, labelPrev }) => {
    const change = calcChange(current, previous);
    return (
      <Card className="glass-card shadow-sm border-border/50">
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground flex items-center justify-between mb-1">
            {title}
            <DollarSign className="w-4 h-4" />
          </p>
          <p className="text-3xl font-bold">${current.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-sm font-medium flex items-center ${getStatusColor(change)}`}>
              {change > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">vs {labelPrev} (${previous.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})})</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Day of Week Trends
  const dayTrends = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0,0,0,0,0,0,0];
    const sums = [0,0,0,0,0,0,0];

    salesData.forEach(sale => {
      const date = new Date(sale.sale_date || sale.created_at);
      if (!isNaN(date)) {
        const dayIdx = date.getDay();
        sums[dayIdx] += Number(sale.revenue || sale.total_sales || 0);
        counts[dayIdx] += 1;
      }
    });

    return days.map((day, i) => ({
      day,
      avgSales: counts[i] > 0 ? sums[i] / counts[i] : 0
    }));
  }, [salesData]);

  // Daily Sales Table (Last 7 Days)
  const recentSales = useMemo(() => {
    const sorted = [...salesData]
      .filter(s => s.sale_date || s.created_at)
      .sort((a, b) => new Date(b.sale_date || b.created_at) - new Date(a.sale_date || a.created_at));
    
    // Group by date to avoid duplicates
    const grouped = {};
    sorted.forEach(sale => {
      const dateStr = (sale.sale_date || sale.created_at).split('T')[0];
      if (!grouped[dateStr]) {
        grouped[dateStr] = 0;
      }
      grouped[dateStr] += Number(sale.revenue || sale.total_sales || 0);
    });

    return Object.entries(grouped)
      .slice(0, 7)
      .map(([dateStr, amount]) => ({
        date: dateStr,
        amount
      }));
  }, [salesData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="Week-to-Date (WTD)" current={metrics.wtd.current} previous={metrics.wtd.previous} labelPrev="last year" />
        <MetricCard title="Period-to-Date (PTD)" current={metrics.ptd.current} previous={metrics.ptd.previous} labelPrev="last year" />
        <MetricCard title="Year-to-Date (YTD)" current={metrics.ytd.current} previous={metrics.ytd.previous} labelPrev="last year" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Day of Week Trends</CardTitle>
            <CardDescription>Average sales by day of week over all time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dx={-10} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => [`$${value.toFixed(2)}`, 'Avg Sales']}
                />
                <Bar dataKey="avgSales" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Recent Daily Sales</CardTitle>
            <CardDescription>Sales totals for the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Sales Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">No recent sales data</TableCell>
                  </TableRow>
                ) : (
                  recentSales.map((sale, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                        {format(parseISO(sale.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${sale.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
