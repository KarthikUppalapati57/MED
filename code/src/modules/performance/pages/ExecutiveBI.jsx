import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { TrendingUp, Users, DollarSign } from 'lucide-react';

const laborVsSalesData = [
  { name: 'Mon', sales: 4000, labor: 800 },
  { name: 'Tue', sales: 3000, labor: 700 },
  { name: 'Wed', sales: 3500, labor: 750 },
  { name: 'Thu', sales: 5000, labor: 900 },
  { name: 'Fri', sales: 8000, labor: 1400 },
  { name: 'Sat', sales: 9000, labor: 1500 },
  { name: 'Sun', sales: 6000, labor: 1100 },
];

const loyaltyData = [
  { segment: 'Bronze', revenue: 15000 },
  { segment: 'Silver', revenue: 25000 },
  { segment: 'Gold', revenue: 45000 },
  { segment: 'Platinum', revenue: 60000 },
];

const procurementData = [
  { name: 'Proteins', value: 35000 },
  { name: 'Produce', value: 15000 },
  { name: 'Dairy', value: 12000 },
  { name: 'Dry Goods', value: 8000 },
  { name: 'Beverages', value: 10000 },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ExecutiveBI() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Executive Command Center</h1>
          <p className="text-slate-500">High-level Business Intelligence and Analytics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-none shadow-md">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-indigo-100 font-medium mb-1">Total Revenue (YTD)</p>
                <h3 className="text-4xl font-bold">$1.2M</h3>
              </div>
              <TrendingUp className="w-8 h-8 text-indigo-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none shadow-md">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-100 font-medium mb-1">Avg Labor Cost %</p>
                <h3 className="text-4xl font-bold">19.4%</h3>
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
                <h3 className="text-4xl font-bold">1,458</h3>
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
            <CardTitle>Sales vs Labor Spend (Weekly)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
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
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Segment Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Loyalty Tier (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loyaltyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="segment" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" fill="#ffc658" name="Revenue ($)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Procurement Category Spend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Procurement Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full flex justify-center">
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
