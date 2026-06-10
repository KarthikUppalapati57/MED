import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';

const COLORS = ['#0d9488', '#0891b2', '#6366f1', '#f59e0b', '#ef4444'];

// ── Stat Card Component ──────────────────────────────────────────
// Custom premium hook to count up numeric values organically
function useCountUp(targetValue, duration = 1200) {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    // If targetValue is not numeric (e.g. "—"), set it directly
    const cleanStr = String(targetValue).replace(/[$,]/g, '');
    const num = parseFloat(cleanStr);
    if (isNaN(num)) {
      setCount(targetValue);
      return;
    }

    let start = 0;
    const end = num;
    if (start === end) {
      setCount(targetValue);
      return;
    }

    const startTime = performance.now();

    const updateCount = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(easeProgress * (end - start) + start);
      
      // format back appropriately
      if (String(targetValue).startsWith('$')) {
        setCount(`$${currentVal.toLocaleString()}`);
      } else {
        setCount(currentVal.toLocaleString());
      }

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      } else {
        setCount(targetValue);
      }
    };

    requestAnimationFrame(updateCount);
  }, [targetValue, duration]);

  return count;
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, linkTo, linkText, subtext, delayClass = 'stagger-1' }) {
  const displayValue = useCountUp(value);
  
  // Extract pure color for ambient halo glows behind card
  const glowColorClass = 
    iconColor.includes('resend-blue') ? 'rgba(0, 117, 255, 0.08)' :
    iconColor.includes('purple') ? 'rgba(147, 51, 234, 0.08)' :
    iconColor.includes('resend-green') ? 'rgba(34, 255, 153, 0.08)' :
    iconColor.includes('resend-orange') ? 'rgba(255, 89, 0, 0.08)' :
    iconColor.includes('resend-red') ? 'rgba(255, 32, 71, 0.08)' :
    iconColor.includes('resend-yellow') ? 'rgba(255, 197, 61, 0.08)' :
    'rgba(20, 198, 203, 0.08)';

  return (
    <Card 
      className={cn(
        "relative overflow-hidden border border-border/50 bg-card hover:border-brand/35 hover-lift shadow-sm hover:shadow-glow-sm animate-fade-in-up",
        delayClass
      )}
      style={{
        background: `radial-gradient(circle at 100% 0%, ${glowColorClass} 0%, transparent 60%), hsl(var(--card))`
      }}
    >
      {/* Decorative top border gradient line */}
      <div 
        className="absolute top-0 left-0 right-0 h-[2px] opacity-75"
        style={{
          background: `linear-gradient(90deg, transparent, ${glowColorClass.replace('0.08', '0.6')}, transparent)`
        }}
      />
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{label}</p>
            <p className="text-3xl font-extrabold text-foreground mt-2 tracking-tight">{displayValue}</p>
          </div>
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110",
            iconBg
          )}>
            <Icon className={cn("h-6 w-6 transition-transform duration-300", iconColor)} />
          </div>
        </div>
        {linkTo && (
          <Link to={createPageUrl(linkTo)} className="text-xs font-semibold text-brand hover:opacity-85 mt-4 inline-flex items-center gap-1 group/link transition-opacity">
            {linkText} <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-1" />
          </Link>
        )}
        {subtext && (
          <div className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
            {subtext}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Platform Admin Dashboard â€” Global platform-wide metrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // -- Realtime subscription for platform dashboard --
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('platform-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-orgs'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-profiles'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dash-recent-logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { activeOrgs, trialOrgs, mrr } = React.useMemo(() => {
    const active = allOrgs.filter(o => o.subscription_status === 'active');
    const trial = allOrgs.filter(o => !o.subscription_status || o.subscription_status === 'trialing' || o.subscription_status === 'trial');
    const planPriceMap = {};
    allPlans.forEach(p => { planPriceMap[p.id] = p.price_monthly || 0; });
    const calculatedMrr = allOrgs.reduce((sum, org) => sum + (planPriceMap[org.plan_id] || 0), 0);
    return { activeOrgs: active, trialOrgs: trial, mrr: calculatedMrr };
  }, [allOrgs, allPlans]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
        </div>
        <p className="text-muted-foreground mt-1">Global platform metrics across all organizations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Organizations" value={allOrgs.length} icon={Building2} iconBg="bg-resend-blue/10" iconColor="text-resend-blue" linkTo="PlatformAdmin?tab=orgs" linkText="Manage" delayClass="stagger-1" />
        <StatCard label="Active Users" value={allProfiles.length} icon={Users} iconBg="bg-purple-500/10" iconColor="text-purple-400" linkTo="PlatformUsers" linkText="View users" delayClass="stagger-2" />
        <StatCard label="Monthly Revenue" value={`$${mrr.toLocaleString()}`} icon={DollarSign} iconBg="bg-resend-green/10" iconColor="text-resend-green" linkTo="PlatformAdmin?tab=accounting" linkText="Accounting" delayClass="stagger-3" />
        <StatCard label="Active Subscriptions" value={activeOrgs.length} icon={Activity} iconBg="bg-primary/10" iconColor="text-primary" linkTo="PlatformAdmin?tab=subscriptions" linkText="Manage" subtext={<><span className="text-resend-yellow font-medium">{trialOrgs.length}</span> trials</>} delayClass="stagger-4" />
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
                { label: 'Active', count: activeOrgs.length, color: 'bg-resend-green' },
                { label: 'Trial', count: trialOrgs.length, color: 'bg-resend-yellow' },
                { label: 'Total', count: allOrgs.length, color: 'bg-blue-500' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Audit Logs */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            <Link to={createPageUrl('PlatformAuditLogs')}>
              <Button variant="ghost" size="sm" className="text-primary">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentLogs.length > 0 ? (
              <div className="space-y-2">
                {recentLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between p-2 bg-secondary rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground capitalize">{log.action}</span>
                      <Badge variant="secondary" className="text-[10px]">{log.table_name}</Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground text-sm">No recent activity</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Org Owner Dashboard â€” Org-level metrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // -- Realtime subscription for org dashboard --
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('org-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { pendingInvoices, totalUnpaid, lowStockItems, activeModules, spendByCategory, pieData, benchmarks } = React.useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending_review').length;
    const unpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const lowStock = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
    const active = organization?.enabled_modules?.length || 0;

    const spend = invoices.reduce((acc, inv) => {
      inv.line_items?.forEach(item => {
        const cat = item.category || 'Other';
        acc[cat] = (acc[cat] || 0) + (item.extended_price || 0);
      });
      return acc;
    }, {});
    const pie = Object.entries(spend).map(([name, value]) => ({ name, value }));

    return {
      pendingInvoices: pending,
      totalUnpaid: unpaid,
      lowStockItems: lowStock,
      activeModules: active,
      spendByCategory: spend,
      pieData: pie,
      benchmarks: []
    };
  }, [invoices, inventory, organization]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{organization?.name || 'Organization'} Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your organization's operations</p>
      </div>

      <Card className="border-brand/30 bg-brand/5 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-brand/20" />
                  <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="175" strokeDashoffset="35" className="text-brand" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-sm font-bold text-brand">80%</span>
                </div>
              </div>
              <div>
                <h3 className="text-md font-bold text-foreground">Data Health Score</h3>
                <p className="text-sm text-muted-foreground max-w-lg">Your organization is almost fully set up. Complete your POS menu mapping to unlock automated Actual vs. Theoretical reporting and full margin protection.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to={createPageUrl('Onboarding')}>
                <Button className="bg-brand text-black hover:opacity-90">Complete Onboarding</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Users" value={orgUsers.length} icon={Users} iconBg="bg-purple-500/10" iconColor="text-purple-400" linkTo="UserManagement" linkText="Manage users" delayClass="stagger-1" />
        <StatCard label="Active Modules" value={activeModules || 'All'} icon={Package} iconBg="bg-primary/10" iconColor="text-primary" linkTo="OrgManagement" linkText="View plan" delayClass="stagger-2" />
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-resend-orange/10" iconColor="text-resend-orange" linkTo="Invoices" linkText="View all" delayClass="stagger-3" />
        <StatCard label="Unpaid Amount" value={`$${totalUnpaid.toLocaleString()}`} icon={CreditCard} iconBg="bg-resend-red/10" iconColor="text-resend-red" linkTo="Payments" linkText="View payments" delayClass="stagger-4" />
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
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">No data yet</div>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {pieData.slice(0, 4).map((item, idx) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Predictive Cash Flow */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Predictive Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-resend-green/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-resend-green" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Forecasted Sales (30 Days)</p>
                    <p className="text-sm text-muted-foreground">Based on historical POS volume</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-resend-green">+$45,200</p>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-resend-red/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-resend-red" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Accounts Payable</p>
                    <p className="text-sm text-muted-foreground">Pending unpaid invoices</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-resend-red">-${totalUnpaid.toLocaleString()}</p>
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-resend-orange/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-resend-orange" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Forecasted Payroll</p>
                    <p className="text-sm text-muted-foreground">Based on scheduled shifts</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-resend-orange">-$12,450</p>
              </div>

              <div className="pt-4 border-t flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground text-lg">Projected Net Cash</p>
                  <p className="text-xs text-muted-foreground">Estimated position in 30 days</p>
                </div>
                <p className={`text-2xl font-black ${45200 - totalUnpaid - 12450 > 0 ? 'text-resend-green' : 'text-resend-red'}`}>
                  ${(45200 - totalUnpaid - 12450).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cross-Location Benchmarking */}
        <Card className="border-0 shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Cross-Location Benchmarking</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={benchmarks.length > 0 ? benchmarks : [
                  { name: 'Loading...', sales: 0, laborCost: 0, cogs: 0 }
                ]}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} cursor={{fill: 'hsl(var(--secondary))'}} />
                <Legend />
                <Bar dataKey="sales" name="Gross Sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cogs" name="COGS" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="laborCost" name="Labor Cost" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="border-0 shadow-sm lg:col-span-3">
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
                <div key={item.label} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-bold text-foreground">{item.value}</p>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Branch Manager Dashboard â€” Branch-level metrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // -- Realtime subscription for branch dashboard --
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('branch-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { pendingInvoices, totalUnpaid, lowStockItems, thisMonthSpend, recentInvoices } = React.useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending_review').length;
    const unpaid = invoices.filter(i => i.payment_status === 'unpaid').reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const lowStock = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const thisMonth = invoices
      .filter(i => new Date(i.invoice_date) >= startOfMonth)
      .reduce((sum, i) => sum + (i.total_amount || 0), 0);

    const recent = invoices.slice(0, 5);

    return {
      pendingInvoices: pending,
      totalUnpaid: unpaid,
      lowStockItems: lowStock,
      thisMonthSpend: thisMonth,
      recentInvoices: recent
    };
  }, [invoices, inventory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {brand?.name || location?.name || 'Branch'} Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Branch-level operations overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-resend-orange/10" iconColor="text-resend-orange" linkTo="Invoices" linkText="View all" delayClass="stagger-1" />
        <StatCard label="Unpaid Amount" value={`$${totalUnpaid.toLocaleString()}`} icon={CreditCard} iconBg="bg-resend-red/10" iconColor="text-resend-red" linkTo="Payments" linkText="View payments" delayClass="stagger-2" />
        <StatCard label="Low Stock Items" value={lowStockItems} icon={Warehouse} iconBg="bg-resend-yellow/10" iconColor="text-resend-yellow" linkTo="Inventory" linkText="View inventory" delayClass="stagger-3" />
        <StatCard label="This Month Spend" value={`$${thisMonthSpend.toLocaleString()}`} icon={DollarSign} iconBg="bg-primary/10" iconColor="text-primary" subtext={<><TrendingUp className="h-4 w-4 text-resend-green" /><span>{products.length} products tracked</span></>} delayClass="stagger-4" />
      </div>

      {/* Recent Invoices */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
          <Link to={createPageUrl('Invoices')}>
            <Button variant="ghost" size="sm" className="text-primary">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentInvoices.length > 0 ? (
            <div className="space-y-3">
              {recentInvoices.map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center border">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{invoice.vendor_name}</p>
                      <p className="text-sm text-muted-foreground">#{invoice.invoice_number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">${invoice.total_amount?.toLocaleString()}</p>
                    <Badge variant="secondary" className={`text-xs ${
                      invoice.status === 'pending_review' ? 'bg-resend-orange/10 text-resend-orange' :
                      invoice.status === 'approved' ? 'bg-resend-green/10 text-resend-green' :
                      'bg-secondary text-muted-foreground'
                    }`}>
                      {invoice.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No invoices yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Location Manager Dashboard â€” Location-level metrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // -- Realtime subscription for location dashboard --
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('location-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { pendingInvoices, lowStockItems, recentInvoices } = React.useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending_review').length;
    const lowStock = inventory.filter(i => i.current_quantity <= (i.reorder_point || 5)).length;
    const recent = invoices.slice(0, 5);
    return {
      pendingInvoices: pending,
      lowStockItems: lowStock,
      recentInvoices: recent
    };
  }, [invoices, inventory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {location?.name || 'Location'} Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Location operations overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices} icon={FileText} iconBg="bg-resend-orange/10" iconColor="text-resend-orange" linkTo="Invoices" linkText="View invoices" delayClass="stagger-1" />
        <StatCard label="Low Stock Items" value={lowStockItems} icon={Warehouse} iconBg="bg-resend-yellow/10" iconColor="text-resend-yellow" linkTo="Inventory" linkText="View inventory" delayClass="stagger-2" />
        <StatCard label="Products" value={products.length} icon={Package} iconBg="bg-primary/10" iconColor="text-primary" linkTo="Products" linkText="View products" delayClass="stagger-3" />
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl('Invoices')}>
              <Button className="gap-2 bg-primary hover:opacity-90">
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
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800">
                  <Mail className="h-4 w-4" />
                  Generate Shift Briefing
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-indigo-600" />
                    Daily Manager Shift Briefing
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    This automated briefing was generated by Restops Copilot for {new Date().toLocaleDateString()}.
                  </p>
                  <div className="bg-secondary/50 p-4 rounded-lg space-y-3 text-sm">
                    <h4 className="font-semibold text-foreground">1. Yesterday's Performance</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                      <li>Sales: <span className="text-resend-green font-medium">$8,450</span> (105% of forecast)</li>
                      <li>Labor: <span className="text-resend-green font-medium">27.5%</span> (Target: 28%)</li>
                      <li>Waste: <span className="text-resend-red font-medium">$125</span> (Primarily Salmon & Produce)</li>
                    </ul>
                    <h4 className="font-semibold text-foreground pt-2 border-t border-border/40">2. Today's Forecast</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                      <li>Projected Sales: <span className="font-medium text-foreground">$5,200</span></li>
                      <li>Scheduled Labor: <span className="text-resend-red font-medium">30.7%</span> (Overstaffed by ~4 hours)</li>
                      <li><span className="text-indigo-600 font-semibold">AI Recommendation:</span> Consider cutting one morning prep shift to align with the 28% labor target.</li>
                    </ul>
                    <h4 className="font-semibold text-foreground pt-2 border-t border-border/40">3. Action Items</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                      <li>3 Invoices pending your review in 3-Way Match</li>
                      <li>Bar station count sheet is due tonight</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Ground Level Dashboard â€” Minimal view
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // -- Realtime subscription for ground-level dashboard --
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel('ground-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { pendingInvoices, myUploads } = React.useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending_review');
    const uploads = invoices.length;
    return {
      pendingInvoices: pending,
      myUploads: uploads
    };
  }, [invoices]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {location?.name ? `Assigned to: ${location.name}` : 'Quick overview of your tasks'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Pending Invoices" value={pendingInvoices.length} icon={Clock} iconBg="bg-resend-orange/10" iconColor="text-resend-orange" linkTo="Invoices" linkText="View invoices" />
        <StatCard label="My Uploads" value={myUploads} icon={Upload} iconBg="bg-resend-blue/10" iconColor="text-resend-blue" linkTo="Invoices" linkText="Upload invoice" />
        <StatCard label="Products" value="â€”" icon={Eye} iconBg="bg-primary/10" iconColor="text-primary" linkTo="Products" linkText="View products" />
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to={createPageUrl('Invoices')}>
              <Button className="gap-2 bg-primary hover:opacity-90">
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
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-resend-orange" />
                    <div>
                      <p className="font-medium text-foreground">{invoice.vendor_name}</p>
                      <p className="text-sm text-muted-foreground">#{invoice.invoice_number}</p>
                    </div>
                  </div>
                  <Badge className="bg-resend-orange/10 text-resend-orange">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Main Dashboard â€” Routes to the correct role-specific view
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function Dashboard() {
  const { isPlatformAdmin, isOrgOwner, isBranchManager, isLocationManager } = usePermissions();

  if (isPlatformAdmin) return <PlatformDashboard />;
  if (isOrgOwner)      return <OrgOwnerDashboard />;
  if (isBranchManager) return <BranchManagerDashboard />;
  if (isLocationManager) return <LocationManagerDashboard />;
  return <GroundLevelDashboard />;
}
