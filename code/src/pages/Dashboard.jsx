import React from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  FileText,
  CreditCard,
  Warehouse,
  TrendingUp,
  ArrowRight,
  DollarSign,
  Users,
  Building2,
  Package,
  ShoppingCart,
  ChefHat,
  Activity,
  Upload,
  Eye,
  Shield,
  AlertTriangle,
  Clock,
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

// ── Stat Card Component ──────────────────────────────────────
function StatCard({ label, value, icon: Icon, iconBg, iconColor, linkTo, linkText, subtext }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          </div>
          <div className={`h-12 w-12 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
        {linkTo && (
          <Link to={createPageUrl(linkTo)} className="text-sm text-teal-600 hover:text-teal-700 mt-3 inline-flex items-center gap-1">
            {linkText} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {subtext && (
          <div className="text-sm text-slate-500 mt-3 flex items-center gap-1">
            {subtext}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Platform Admin Dashboard — Global platform-wide metrics
// ═══════════════════════════════════════════════════════════════
function PlatformDashboard() {
  const { data: allOrgs = [] } = useAuthQuery({
    queryKey: ['dash-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('id, name, subscription_plan, subscription_status, plan_id, enabled_modules');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allProfiles = [] } = useAuthQuery({
    queryKey: ['dash-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, role, organization_id');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allPlans = [] } = useAuthQuery({
    queryKey: ['dash-plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentLogs = [] } = useAuthQuery({
    queryKey: ['dash-recent-logs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_logs').select('id, action, table_name, created_at, user_id').order('created_at', { ascending: false }).limit(8);
      if (error) throw error;
      return data || [];
    },
  });

  // Removed tenant invoices query to enforce data siloing

  const activeOrgs = allOrgs.filter(o => o.subscription_status === 'active');
  const trialOrgs = allOrgs.filter(o => !o.subscription_status || o.subscription_status === 'trialing' || o.subscription_status === 'trial');

  // Compute MRR from plans
  const planPriceMap = {};
  allPlans.forEach(p => { planPriceMap[p.id] = p.price_monthly || 0; });
  const mrr = allOrgs.reduce((sum, org) => sum + (planPriceMap[org.plan_id] || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
        </div>
        <p className="text-slate-500 mt-1">Global platform metrics across all organizations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organizations" value={allOrgs.length} icon={Building2} iconBg="bg-blue-100" iconColor="text-blue-600" linkTo="PlatformAdmin" linkText="Manage" />
        <StatCard label="Active Users" value={allProfiles.length} icon={Users} iconBg="bg-purple-100" iconColor="text-purple-600" linkTo="UserManagement" linkText="View users" />
        <StatCard label="Monthly Revenue" value={`$${mrr.toLocaleString()}`} icon={DollarSign} iconBg="bg-emerald-100" iconColor="text-emerald-600" linkTo="PlatformAdmin" linkText="Accounting" />
        <StatCard label="Active Subscriptions" value={activeOrgs.length} icon={Activity} iconBg="bg-teal-100" iconColor="text-teal-600" subtext={<><span className="text-amber-500 font-medium">{trialOrgs.length}</span> trials</>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Distribution */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Organization Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Active', count: activeOrgs.length, color: 'bg-emerald-500' },
                { label: 'Trial', count: trialOrgs.length, color: 'bg-amber-500' },
                { label: 'Total', count: allOrgs.length, color: 'bg-blue-500' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="text-sm text-slate-600">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Audit Logs */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <Link to={createPageUrl('AuditLogs')}>
              <Button variant="ghost" size="sm" className="text-teal-600">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentLogs.length > 0 ? (
              <div className="space-y-2">
                {recentLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium text-slate-700 capitalize">{log.action}</span>
                      <Badge variant="secondary" className="text-[10px]">{log.table_name}</Badge>
                    </div>
                    <span className="text-[10px] text-slate-400">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-sm">No recent activity</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Org Owner Dashboard — Org-level metrics
// ═══════════════════════════════════════════════════════════════
function OrgOwnerDashboard() {
  const { organization } = useAuth();

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
  const { data: orgUsers = [] } = useAuthQuery({
    queryKey: ['org-users', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase.from('profiles').select('id, role').eq('organization_id', organization.id);
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const totalUnpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
  const activeModules = organization?.enabled_modules?.length || 0;

  const spendByCategory = invoices.reduce((acc, inv) => {
    inv.line_items?.forEach(item => {
      const cat = item.category || 'Other';
      acc[cat] = (acc[cat] || 0) + (item.extended_price || 0);
    });
    return acc;
  }, {});
  const pieData = Object.entries(spendByCategory).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{organization?.name || 'Organization'} Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your organization's operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Users" value={orgUsers.length} icon={Users} iconBg="bg-purple-100" iconColor="text-purple-600" linkTo="UserManagement" linkText="Manage users" />
        <StatCard label="Active Modules" value={activeModules || 'All'} icon={Package} iconBg="bg-teal-100" iconColor="text-teal-600" linkTo="OrgManagement" linkText="View plan" />
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-orange-100" iconColor="text-orange-600" linkTo="Invoices" linkText="View all" />
        <StatCard label="Unpaid Amount" value={`$${totalUnpaid.toLocaleString()}`} icon={CreditCard} iconBg="bg-red-100" iconColor="text-red-600" linkTo="Payments" linkText="View payments" />
      </div>

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
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400">No data yet</div>
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

        {/* Quick Stats */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Operations Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Invoices', value: invoices.length, icon: FileText },
                { label: 'Total Payments', value: payments.length, icon: CreditCard },
                { label: 'Products', value: products.length, icon: Package },
                { label: 'Inventory Items', value: inventory.length, icon: Warehouse },
                { label: 'Low Stock Alerts', value: lowStockItems, icon: AlertTriangle },
                { label: 'Team Members', value: orgUsers.length, icon: Users },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <item.icon className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-lg font-bold text-slate-900">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Branch Manager Dashboard — Branch-level metrics
// ═══════════════════════════════════════════════════════════════
function BranchManagerDashboard() {
  const { brand, location } = useAuth();

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['invoices', 'brand', brand?.id],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (brand?.id) q = q.eq('brand_id', brand.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!brand?.id
  });
  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['inventory', 'brand', brand?.id],
    queryFn: async () => {
      let q = supabase.from('inventory').select('*');
      if (brand?.id) q = q.eq('brand_id', brand.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!brand?.id
  });
  const { data: products = [] } = useAuthQuery({
    queryKey: ['products', 'brand', brand?.id],
    queryFn: async () => {
      let q = supabase.from('products').select('*');
      if (brand?.id) q = q.eq('brand_id', brand.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!brand?.id
  });

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const totalUnpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
  const thisMonthSpend = invoices
    .filter(i => new Date(i.invoice_date) >= new Date(new Date().setDate(1)))
    .reduce((sum, i) => sum + (i.total_amount || 0), 0);

  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {brand?.name || location?.name || 'Branch'} Dashboard
        </h1>
        <p className="text-slate-500 mt-1">Branch-level operations overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-orange-100" iconColor="text-orange-600" linkTo="Invoices" linkText="View all" />
        <StatCard label="Unpaid Amount" value={`$${totalUnpaid.toLocaleString()}`} icon={CreditCard} iconBg="bg-red-100" iconColor="text-red-600" linkTo="Payments" linkText="View payments" />
        <StatCard label="Low Stock Items" value={lowStockItems} icon={Warehouse} iconBg="bg-yellow-100" iconColor="text-yellow-600" linkTo="Inventory" linkText="View inventory" />
        <StatCard label="This Month Spend" value={`$${thisMonthSpend.toLocaleString()}`} icon={DollarSign} iconBg="bg-teal-100" iconColor="text-teal-600" subtext={<><TrendingUp className="h-4 w-4 text-green-500" /><span>{products.length} products tracked</span></>} />
      </div>

      {/* Recent Invoices */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
          <Link to={createPageUrl('Invoices')}>
            <Button variant="ghost" size="sm" className="text-teal-600">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentInvoices.length > 0 ? (
            <div className="space-y-3">
              {recentInvoices.map(invoice => (
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
                    <Badge variant="secondary" className={`text-xs ${
                      invoice.status === 'pending_review' ? 'bg-orange-100 text-orange-700' :
                      invoice.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {invoice.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">No invoices yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Location Manager Dashboard — Location-level metrics
// ═══════════════════════════════════════════════════════════════
function LocationManagerDashboard() {
  const { location } = useAuth();

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['invoices', 'location', location?.id],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (location?.id) q = q.eq('location_id', location.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!location?.id
  });
  const { data: inventory = [] } = useAuthQuery({
    queryKey: ['inventory', 'location', location?.id],
    queryFn: async () => {
      let q = supabase.from('inventory').select('*');
      if (location?.id) q = q.eq('location_id', location.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!location?.id
  });
  const { data: products = [] } = useAuthQuery({
    queryKey: ['products', 'location', location?.id],
    queryFn: async () => {
      let q = supabase.from('products').select('*');
      if (location?.id) q = q.eq('location_id', location.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!location?.id
  });

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review').length;
  const lowStockItems = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;

  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {location?.name || 'Location'} Dashboard
        </h1>
        <p className="text-slate-500 mt-1">Location operations overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-orange-100" iconColor="text-orange-600" linkTo="Invoices" linkText="View invoices" />
        <StatCard label="Low Stock Items" value={lowStockItems} icon={Warehouse} iconBg="bg-yellow-100" iconColor="text-yellow-600" linkTo="Inventory" linkText="View inventory" />
        <StatCard label="Products" value={products.length} icon={Package} iconBg="bg-teal-100" iconColor="text-teal-600" linkTo="Products" linkText="View products" />
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl('Invoices')}>
              <Button className="gap-2 bg-teal-600 hover:bg-teal-700">
                <Upload className="h-4 w-4" />
                Upload Invoice
              </Button>
            </Link>
            <Link to={createPageUrl('AutoOrdering')}>
              <Button variant="outline" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Auto-Order
              </Button>
            </Link>
            <Link to={createPageUrl('Recipes')}>
              <Button variant="outline" className="gap-2">
                <ChefHat className="h-4 w-4" />
                Recipes
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Ground Level Dashboard — Minimal view
// ═══════════════════════════════════════════════════════════════
function GroundLevelDashboard() {
  const { location } = useAuth();

  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['invoices', 'location', location?.id],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      if (location?.id) q = q.eq('location_id', location.id);
      const { data } = await q;
      return data || [];
    },
    enabled: !!location?.id
  });

  const pendingInvoices = invoices.filter(i => i.status === 'pending_review');
  const myUploads = invoices.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Dashboard</h1>
        <p className="text-slate-500 mt-1">
          {location?.name ? `Assigned to: ${location.name}` : 'Quick overview of your tasks'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices.length} icon={Clock} iconBg="bg-orange-100" iconColor="text-orange-600" linkTo="Invoices" linkText="View invoices" />
        <StatCard label="My Uploads" value={myUploads} icon={Upload} iconBg="bg-blue-100" iconColor="text-blue-600" linkTo="Invoices" linkText="Upload invoice" />
        <StatCard label="Products" value="—" icon={Eye} iconBg="bg-teal-100" iconColor="text-teal-600" linkTo="Products" linkText="View products" />
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl('Invoices')}>
              <Button className="gap-2 bg-teal-600 hover:bg-teal-700">
                <Upload className="h-4 w-4" />
                Upload Invoice
              </Button>
            </Link>
            <Link to={createPageUrl('Products')}>
              <Button variant="outline" className="gap-2">
                <Package className="h-4 w-4" />
                View Products
              </Button>
            </Link>
            <Link to={createPageUrl('Inventory')}>
              <Button variant="outline" className="gap-2">
                <Warehouse className="h-4 w-4" />
                Check Inventory
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Pending for Review */}
      {pendingInvoices.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvoices.slice(0, 5).map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="font-medium text-slate-900">{invoice.vendor_name}</p>
                      <p className="text-sm text-slate-500">#{invoice.invoice_number}</p>
                    </div>
                  </div>
                  <Badge className="bg-orange-100 text-orange-700">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Dashboard — Routes to the correct role-specific view
// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { isPlatformAdmin, isOrgOwner, isBranchManager, isLocationManager } = usePermissions();

  if (isPlatformAdmin) return <PlatformDashboard />;
  if (isOrgOwner)      return <OrgOwnerDashboard />;
  if (isBranchManager) return <BranchManagerDashboard />;
  if (isLocationManager) return <LocationManagerDashboard />;
  return <GroundLevelDashboard />;
}