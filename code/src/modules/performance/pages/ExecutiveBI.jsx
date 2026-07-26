import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, Users, DollarSign } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#d84797'];
const CHART_DAYS = 14;

export default function ExecutiveBI() {
  const { organization, brand, location } = useAuth();
  const filterCb = React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]);

  const now = new Date();
  const ytdStart = `${now.getFullYear()}-01-01`;
  const todayKey = now.toISOString().slice(0, 10);
  const chartStart = subDays(now, CHART_DAYS - 1).toISOString().slice(0, 10);

  const { data: salesData, isLoading: salesLoading } = useAuthQuery({
    queryKey: ['pos_sales_data', organization?.id],
    queryFn: () => api.entities.PosSalesData.list(),
    select: filterCb,
    enabled: !!organization?.id,
  });

  const { data: shiftsData, isLoading: shiftsLoading } = useAuthQuery({
    queryKey: ['employee_shifts', organization?.id],
    queryFn: () => api.entities.EmployeeShift.list(),
    select: filterCb,
    enabled: !!organization?.id,
  });

  const { data: customersData, isLoading: customersLoading } = useAuthQuery({
    queryKey: ['customers', organization?.id],
    queryFn: () => api.entities.Customer.list(),
    select: filterCb,
    enabled: !!organization?.id,
  });

  const { data: loyaltyData, isLoading: loyaltyLoading } = useAuthQuery({
    queryKey: ['loyalty_memberships', organization?.id],
    queryFn: () => api.entities.LoyaltyMembership.list(),
    select: filterCb,
    enabled: !!organization?.id,
  });

  const { data: categoryReport, isLoading: categoryLoading } = useAuthQuery({
    queryKey: ['category_performance_report', organization?.id, brand?.brand_id || brand?.id, location?.id, ytdStart, todayKey],
    queryFn: () => api.reports.getCategoryPerformanceReport({
      organizationId: organization?.id,
      locationIds: location?.id ? [location.id] : null,
      dateFrom: ytdStart,
      dateTo: todayKey,
    }),
    enabled: !!organization?.id,
  });

  const isLoading = salesLoading || shiftsLoading || customersLoading || loyaltyLoading || categoryLoading;

  const ytdSales = useMemo(() => (salesData || []).reduce((sum, row) => {
    const d = row.date || row.created_at;
    return d && d.slice(0, 10) >= ytdStart ? sum + Number(row.revenue || 0) : sum;
  }, 0), [salesData, ytdStart]);

  const ytdLabor = useMemo(() => (shiftsData || []).reduce((sum, shift) => {
    const d = shift.shift_date || shift.start_time;
    return d && d.slice(0, 10) >= ytdStart ? sum + Number(shift.labor_cost || 0) : sum;
  }, 0), [shiftsData, ytdStart]);

  const avgLaborPct = ytdSales > 0 ? (ytdLabor / ytdSales) * 100 : 0;

  const laborVsSalesData = useMemo(() => {
    const days = [];
    for (let i = 0; i < CHART_DAYS; i++) {
      const d = subDays(now, CHART_DAYS - 1 - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const salesByDay = {};
    (salesData || []).forEach((row) => {
      const d = (row.date || row.created_at || '').slice(0, 10);
      if (d >= chartStart) salesByDay[d] = (salesByDay[d] || 0) + Number(row.revenue || 0);
    });
    const laborByDay = {};
    (shiftsData || []).forEach((shift) => {
      const d = (shift.shift_date || shift.start_time || '').slice(0, 10);
      if (d >= chartStart) laborByDay[d] = (laborByDay[d] || 0) + Number(shift.labor_cost || 0);
    });
    return days.map((d) => ({
      name: format(new Date(d), 'MMM d'),
      sales: Math.round(salesByDay[d] || 0),
      labor: Math.round(laborByDay[d] || 0),
    }));
  }, [salesData, shiftsData, chartStart, now]);

  const loyaltyByTier = useMemo(() => {
    const spendByCustomer = {};
    (customersData || []).forEach((c) => { spendByCustomer[c.id] = Number(c.total_spent || 0); });
    const totals = {};
    (loyaltyData || []).forEach((membership) => {
      const tier = membership.tier ? membership.tier.charAt(0).toUpperCase() + membership.tier.slice(1) : 'Unknown';
      totals[tier] = (totals[tier] || 0) + (spendByCustomer[membership.customer_id] || 0);
    });
    return Object.entries(totals)
      .map(([segment, revenue]) => ({ segment, revenue: Math.round(revenue) }))
      .sort((a, b) => a.revenue - b.revenue);
  }, [customersData, loyaltyData]);

  const procurementData = useMemo(() => (categoryReport?.categoryBreakdown || [])
    .map((row) => ({ name: row.category, value: Math.round(Number(row.currentSpend || 0)) }))
    .filter((row) => row.value > 0), [categoryReport]);

  const loyaltyMemberCount = (loyaltyData || []).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Executive Command Center</h1>
          <p className="text-muted-foreground">High-level Business Intelligence and Analytics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-none shadow-md">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-indigo-100 font-medium mb-1">Total Revenue (YTD)</p>
                <h3 className="text-4xl font-bold">
                  {isLoading ? '...' : `$${ytdSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </h3>
              </div>
              <TrendingUp className="w-8 h-8 text-indigo-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none shadow-md">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-100 font-medium mb-1">Avg Labor Cost % (YTD)</p>
                <h3 className="text-4xl font-bold">{isLoading ? '...' : `${avgLaborPct.toFixed(1)}%`}</h3>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-none shadow-md">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-amber-100 font-medium mb-1">Loyalty Members</p>
                <h3 className="text-4xl font-bold">{isLoading ? '...' : loyaltyMemberCount.toLocaleString()}</h3>
              </div>
              <Users className="w-8 h-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Labor vs Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Sales vs Labor Spend (Last {CHART_DAYS} Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
              ) : laborVsSalesData.every((d) => d.sales === 0 && d.labor === 0) ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No POS sales or labor data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={laborVsSalesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#8884d8" activeDot={{ r: 8 }} name="Sales ($)" />
                    <Line yAxisId="right" type="monotone" dataKey="labor" stroke="#82ca9d" name="Labor ($)" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Segment Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Loyalty Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
              ) : loyaltyByTier.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No loyalty members yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={loyaltyByTier} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="segment" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill="#ffc658" name="Revenue ($)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Procurement Category Spend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Procurement Spend by Category (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full flex justify-center">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
              ) : procurementData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No invoice spend recorded yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={procurementData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {procurementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
