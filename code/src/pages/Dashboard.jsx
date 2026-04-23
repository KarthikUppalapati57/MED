import React from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  FileText,
  CreditCard,
  Warehouse,
  TrendingUp,
  ArrowRight,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#0d9488', '#0891b2', '#6366f1', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_at'),
  });

  const { data: payments = [] } = useAuthQuery({
    queryKey: ['payments'],
    queryFn: () => api.entities.Payment.list('-created_at'),
  });

  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['inventory'],
    queryFn: () => api.entities.Inventory.list(),
  });

  const { data: products = [] } = useAuthQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list(),
  });

  // Calculate stats
  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const totalUnpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
  const thisMonthSpend = invoices
    .filter(i => new Date(i.invoice_date) >= new Date(new Date().setDate(1)))
    .reduce((sum, i) => sum + (i.total_amount || 0), 0);

  // Chart data
  const spendByCategory = invoices.reduce((acc, inv) => {
    inv.line_items?.forEach(item => {
      const cat = item.category || 'Other';
      acc[cat] = (acc[cat] || 0) + (item.extended_price || 0);
    });
    return acc;
  }, {});

  const pieData = Object.entries(spendByCategory).map(([name, value]) => ({ name, value }));

  // Recent invoices for pending review
  const recentPendingInvoices = invoices.filter(i => i.status === 'pending_review').slice(0, 5);
  const upcomingPayments = invoices
    .filter(i => i.payment_status === 'unpaid' && i.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your operations</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Invoices</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{pendingInvoices}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <Link to={createPageUrl('Invoices')} className="text-sm text-teal-600 hover:text-teal-700 mt-3 inline-flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Unpaid Amount</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">${totalUnpaid.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <Link to={createPageUrl('Payments')} className="text-sm text-teal-600 hover:text-teal-700 mt-3 inline-flex items-center gap-1">
              View payments <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Low Stock Items</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{lowStockItems}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Warehouse className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
            <Link to={createPageUrl('Inventory')} className="text-sm text-teal-600 hover:text-teal-700 mt-3 inline-flex items-center gap-1">
              View inventory <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">This Month Spend</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">${thisMonthSpend.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-teal-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-teal-600" />
              </div>
            </div>
            <div className="text-sm text-slate-500 mt-3 flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span>{products.length} products tracked</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend by Category */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400">
                No data yet
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {pieData.slice(0, 4).map((item, idx) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx] }} />
                  <span className="text-slate-600">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Invoices */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Pending Review</CardTitle>
            <Link to={createPageUrl('Invoices')}>
              <Button variant="ghost" size="sm" className="text-teal-600">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentPendingInvoices.length > 0 ? (
              <div className="space-y-3">
                {recentPendingInvoices.map(invoice => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center border">
                        <FileText className="h-5 w-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{invoice.vendor_name}</p>
                        <p className="text-sm text-slate-500">#{invoice.invoice_number}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">${invoice.total_amount?.toLocaleString()}</p>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">
                        Pending
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                No pending invoices
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Payments */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Upcoming Payments</CardTitle>
          <Link to={createPageUrl('Payments')}>
            <Button variant="ghost" size="sm" className="text-teal-600">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {upcomingPayments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="pb-3 font-medium">Vendor</th>
                    <th className="pb-3 font-medium">Invoice #</th>
                    <th className="pb-3 font-medium">Due Date</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {upcomingPayments.map(invoice => {
                    const dueDate = new Date(invoice.due_date);
                    const isOverdue = dueDate < new Date();
                    const isDueSoon = !isOverdue && dueDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    
                    return (
                      <tr key={invoice.id} className="text-sm">
                        <td className="py-3 font-medium text-slate-900">{invoice.vendor_name}</td>
                        <td className="py-3 text-slate-600">#{invoice.invoice_number}</td>
                        <td className="py-3">
                          <span className={isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-slate-600'}>
                            {format(dueDate, 'MMM d, yyyy')}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-slate-900">${invoice.total_amount?.toLocaleString()}</td>
                        <td className="py-3">
                          {isOverdue ? (
                            <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                          ) : isDueSoon ? (
                            <Badge className="bg-orange-100 text-orange-700">Due Soon</Badge>
                          ) : (
                            <Badge variant="secondary">Scheduled</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">
              No upcoming payments
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}