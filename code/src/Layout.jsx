import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Package,
  Warehouse,
  ShoppingCart,
  ChefHat,
  Store,
  Users,
  Bell,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Settings,
  User,
  Shield,
  Check,
  Building2,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Sparkles,
  Activity,
  DollarSign,
  History,
  ArrowRightLeft,
  Trash2,
  Plus,
  Receipt,
  ArrowLeft,
  Bot
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabaseClient';
import { isPageInEnabledModules } from '@/lib/moduleConfig';
import ContextSwitcher from '@/components/ContextSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import RestopsLogo from '@/components/RestopsLogo';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';

const navigation = [
  { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard, minRole: 'ground_staff' },
  { name: 'Performance', href: 'Performance', icon: Activity, minRole: 'manager' },
  { name: 'Inbox', href: 'Notifications', icon: Bell, minRole: 'ground_staff' },
  { name: 'AI Insights', href: 'AiInsights', icon: Sparkles, minRole: 'manager' },
  { name: 'Ask Tom', href: 'AskTom', icon: Bot, minRole: 'manager' },
  { 
    name: 'Platform Admin', 
    icon: Shield, 
    minRole: 'platform_admin',
    subItems: [
      { name: 'Requests', href: 'PlatformAdmin?tab=requests', icon: ShieldAlert },
      { name: 'Invite Clients', href: 'PlatformAdmin?tab=invite', icon: UserPlus },
      { name: 'Accounting', href: 'PlatformAdmin?tab=accounting', icon: DollarSign }
    ]
  },
  { name: 'Platform Users', href: 'PlatformUsers', icon: Users, minRole: 'platform_admin' },
  { name: 'Platform Organizations', href: 'PlatformOrganizations', icon: Building2, minRole: 'platform_admin' },
  { name: 'Platform Plans', href: 'PlatformPlans', icon: Sparkles, minRole: 'platform_admin' },
  { name: 'Platform Invoices', href: 'PlatformInvoices', icon: Receipt, minRole: 'platform_admin' },
  { name: 'Admin Management', href: 'PlatformUserManagement', icon: ShieldAlert, minRole: 'platform_admin' },
  { name: 'Audit Logs', href: 'PlatformAuditLogs', icon: FileText, minRole: 'platform_admin' },
  { name: 'Invoices', href: 'Invoices', icon: FileText, minRole: 'ground_staff' },
  { 
    name: 'Payments', 
    icon: CreditCard, 
    minRole: 'location_manager',
    subItems: [
      { name: 'Invoices', href: 'Payments?tab=invoices', icon: FileText },
      { name: 'Payment History', href: 'Payments?tab=history', icon: History },
      { name: 'Reconciliation', href: 'Payments?tab=reconciliation', icon: ArrowRightLeft },
      { name: 'Gateway Setup', href: 'Payments?tab=setup', icon: Settings }
    ]
  },
  { name: 'Purchase Card', href: 'PurchaseCard', icon: CreditCard, minRole: 'branch_manager' },
  { 
    name: 'Products', 
    icon: Package, 
    minRole: 'ground_staff',
    subItems: [
      { name: 'All Products', href: 'Products?tab=all-products', icon: Package },
      { name: 'Product Review', href: 'Products?tab=new-review', icon: Check },
      { name: 'Purchase Report', href: 'Products?tab=purchase-report', icon: FileText }
    ]
  },
  { 
    name: 'Inventory', 
    icon: Warehouse, 
    minRole: 'location_manager',
    subItems: [
      { name: 'Inventory List', href: 'Inventory?tab=inventory', icon: Warehouse },
      { name: 'Summary', href: 'Inventory?tab=summary', icon: FileText },
      { name: 'Wastage Log', href: 'Inventory?tab=wastage', icon: Trash2 },
      { name: 'Stock Counts', href: 'Inventory?tab=counts', icon: Check },
      { name: 'Count Sheets', href: 'Inventory?tab=count-sheets', icon: FileText },
      { name: 'AvT Costing', href: 'AvTCosting', icon: Activity }
    ]
  },
  { 
    name: 'Orders', 
    pageKey: 'AutoOrdering',
    icon: ShoppingCart, 
    minRole: 'location_manager',
    subItems: [
      { name: 'All Orders', href: 'AutoOrdering?tab=all-orders', icon: ShoppingCart },
      { name: 'Place Order', href: 'AutoOrdering?tab=place-order', icon: Plus },
      { name: 'Invoice Approval', href: 'AutoOrdering?tab=invoice-approval', icon: FileText },
      { name: 'Transfers', href: 'AutoOrdering?tab=transfers', icon: ArrowRightLeft },
      { name: 'Receiving', href: 'AutoOrdering?tab=receiving', icon: Package },
      { name: 'Order Setup', href: 'AutoOrdering?tab=order-setup', icon: Settings }
    ]
  },
  { name: 'SmartPrep', href: 'SmartPrep', icon: ChefHat, minRole: 'location_manager' },
  { 
    name: 'Recipes', 
    pageKey: 'Recipes',
    icon: ChefHat, 
    minRole: 'location_manager',
    subItems: [
      { name: 'Recipes List', href: 'Recipes?tab=recipes', icon: ChefHat },
      { name: 'Prepared Items', href: 'Recipes?tab=prepared-items', icon: Plus },
      { name: 'Menu Engineering', href: 'MenuEngineering', icon: Activity },
      { name: 'Setup', href: 'Recipes?tab=setup', icon: Settings }
    ]
  },
  { 
    name: 'Vendors', 
    pageKey: 'Vendors',
    icon: Store, 
    minRole: 'location_manager',
    subItems: [
      { name: 'Vendors List', href: 'Vendors?tab=vendors', icon: Store },
      { name: 'Vendor Items', href: 'Vendors?tab=vendor-items', icon: Package }
    ]
  },
  { 
    name: 'Labor', 
    pageKey: 'Labor',
    icon: Users, 
    minRole: 'location_manager',
    subItems: [
      { name: 'Labor Summary', href: 'Labor?tab=summary', icon: FileText },
      { name: 'Shifts & Scheduling', href: 'Labor?tab=shifts', icon: Check },
      { name: 'Employees', href: 'Labor?tab=employees', icon: Users },
      { name: 'Setup', href: 'Labor?tab=setup', icon: Settings }
    ]
  },
  { 
    name: 'Accounting', 
    pageKey: 'Accounting',
    icon: DollarSign, 
    minRole: 'manager',
    subItems: [
      { name: 'Dashboard', href: 'Accounting?tab=dashboard', icon: LayoutDashboard },
      { name: 'Export & Sync', href: 'Accounting?tab=export', icon: ArrowRightLeft },
      { name: 'Reconciliation', href: 'Accounting?tab=reconciliation', icon: FileText },
      { name: 'GL Mapping', href: 'Accounting?tab=gl-mapping', icon: Settings },
      { name: 'Close Books', href: 'Accounting?tab=close-books', icon: Check }
    ]
  },
  { 
    name: 'My Organization', 
    icon: Building2, 
    minRole: 'org_owner',
    subItems: [
      { name: 'Hierarchy', href: 'OrgManagement?tab=hierarchy', icon: Building2 },
      { name: 'Security & MFA', href: 'OrgManagement?tab=security', icon: ShieldCheck }
    ]
  },
  { name: 'Users', href: 'UserManagement', icon: Users, minRole: 'org_owner' },
  { name: 'Restaurant Setup', href: 'RestaurantSetup', icon: Settings, minRole: 'location_manager' },
  { name: 'Integrations', href: 'Integrations', icon: Settings, minRole: 'org_owner' },
  { name: 'Audit Logs', href: 'AuditLogs', icon: FileText, minRole: 'org_owner' },
];

const roleBadgeColors = {
  ground_staff: 'bg-secondary text-muted-foreground',
  location_manager: 'bg-blue-500/10 text-blue-400 dark:bg-blue-500/20 dark:text-blue-300',
  manager: 'bg-blue-500/10 text-blue-400 dark:bg-blue-500/20 dark:text-blue-300',
  branch_manager: 'bg-cyan-500/10 text-cyan-500 dark:bg-cyan-500/20 dark:text-cyan-300',
  org_owner: 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-300',
  owner: 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-300',
  admin: 'bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-300',
  platform_admin: 'bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-300',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Accordion: only one menu can be expanded at a time (null = none)
  const [expandedMenu, setExpandedMenu] = useState(null);
  const { user, userProfile, logout, role, organization } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useRealtimeEvents();

  // Accordion toggle: clicking an open menu closes it; clicking a different menu opens it and closes the previous
  const toggleMenu = (name) => setExpandedMenu(prev => prev === name ? null : name);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_read', false)
          .order('created_at', { ascending: false });
        
        if (error) {
          // If table doesn't exist (42P01) or cache is stale (PGRST205), just return empty
          if (error.code === '42P01' || error.code === 'PGRST205') return [];
          throw error;
        }
        return data ?? [];
      } catch (err) {
        console.warn('Notifications fetch error:', err);
        return [];
      }
    },
    enabled: !!user?.id,
  });

  // Real-time notification subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Real-time organization update subscription
  useEffect(() => {
    if (!organization?.id) return;
    const orgChannel = supabase
      .channel('org-realtime-layout')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${organization.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['organizations'] });
          queryClient.invalidateQueries({ queryKey: ['platform-orgs-lookup'] });
          // Force refetch of current user context if needed
          queryClient.invalidateQueries({ queryKey: ['auth-user'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orgChannel);
    };
  }, [organization?.id, queryClient]);

  const markAsRead = async (notifId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read: true })
      .eq('id', notifId);
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read: true })
      .eq('user_id', user?.id)
      .eq('is_read', false);
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Filter navigation based on user role, explicit permissions, AND enabled modules (FAIL-CLOSED)
  const enabledModules = organization?.enabled_modules;
  const userPermissions = userProfile?.permissions || {};
  const userRole = userProfile?.role;

  const filteredNavigation = navigation.reduce((acc, item) => {
    // Platform admins should ONLY see Dashboard and platform_admin specific items
    if (isPlatformAdmin) {
      if (item.minRole === 'platform_admin' || item.name === 'Dashboard') {
        acc.push(item);
      }
      return acc;
    }

    const isParentRoleValid = hasMinRole(item.minRole);

    if (item.subItems) {
      const filteredSubItems = item.subItems.filter(sub => {
        const pageKey = sub.href.split('?')[0];
        const explicitPerm = userPermissions[pageKey];
        
        // If explicitly granted
        if (explicitPerm === 'read' || explicitPerm === 'full') return true;
        // If explicitly denied
        if (explicitPerm === 'none') return false;
        
        // Fallback to role + module
        if (!isParentRoleValid) return false;
        return isPageInEnabledModules(pageKey, enabledModules, userRole);
      });

      if (filteredSubItems.length > 0) {
        acc.push({ ...item, subItems: filteredSubItems });
      }
    } else {
      const pageKey = item.href?.split('?')[0];
      const explicitPerm = userPermissions[pageKey];
      
      let isVisible = false;
      if (explicitPerm === 'read' || explicitPerm === 'full') {
        isVisible = true;
      } else if (explicitPerm === 'none') {
        isVisible = false;
      } else {
        isVisible = isParentRoleValid && isPageInEnabledModules(pageKey, enabledModules, userRole);
      }
      
      if (isVisible) acc.push(item);
    }
    
    return acc;
  }, []);

  // Auto-expand the correct accordion on initial load based on active path
  useEffect(() => {
    const activeParent = filteredNavigation.find(item =>
      item.subItems?.some(sub => {
        const [base, query] = sub.href.split('?');
        if (currentPageName !== base) return false;
        if (query) return location.search.includes(query.split('=')[1] || query);
        return true;
      })
    );
    if (activeParent) setExpandedMenu(activeParent.name);
  // Only run on page/path changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageName, location.search]);

  const displayName = userProfile?.full_name || user?.email?.split('@')[0] || 'User';
  const displayRole = role || 'loading';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

 {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col h-screen",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-border shrink-0 relative overflow-visible z-10">
          <div className="absolute bottom-0 left-6 right-6 h-[1.5px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-80 animate-pulse" />
          <Link to="/" className="flex items-center gap-2.5 group hover:opacity-80 transition-opacity">
            <RestopsLogo className="h-16 w-40" />
          </Link>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-grow overflow-y-auto sidebar-nav p-4 space-y-1">
          {filteredNavigation.map((item) => {
            if (item.subItems) {
              const isActive = item.subItems.some(sub => {
                const [base, query] = sub.href.split('?');
                if (currentPageName !== base) return false;
                if (query) return location.search.includes(query.split('=')[1] || query);
                return true;
              });
              const isExpanded = expandedMenu === item.name || (expandedMenu === null && isActive);
              return (
                <div 
                  key={item.name} 
                  className="space-y-0.5"
                >
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "border-l-2 border-brand pl-2 text-brand bg-brand/5 shadow-[0_0_12px_rgba(20,198,203,0.06)]"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:translate-x-1 duration-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-[18px] w-[18px]" />
                      {item.name}
                    </div>
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isExpanded ? "rotate-180" : "")} />
                  </button>
                  {isExpanded && (
                    <div className="pl-6 pr-2 space-y-0.5 mt-0.5 border-l border-border/40 ml-5 animate-fade-in-up">
                      {item.subItems.map(sub => {
                        const isSubActive = (() => {
                          const [base, query] = sub.href.split('?');
                          if (currentPageName !== base) return false;
                          if (query) return location.search.includes(query.split('=')[1] || query);
                          return true;
                        })();
                        return (
                          <Link
                            key={sub.name}
                            to={createPageUrl(sub.href)}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                              isSubActive
                                ? "bg-brand/10 text-brand shadow-[0_0_8px_rgba(20,198,203,0.1)] border-l-2 border-brand pl-2"
                                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground hover:translate-x-1 duration-200"
                            )}
                          >
                            <sub.icon className="h-4 w-4" />
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = currentPageName === item.href;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.href)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-brand/10 text-brand shadow-[0_0_12px_rgba(20,198,203,0.15)] border-l-2 border-brand pl-2"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:translate-x-1 duration-200"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info at bottom of sidebar */}
        <div className="p-4 border-t border-border shrink-0 mt-auto bg-secondary/10 hover:bg-secondary/20 transition-colors duration-300">
          <div className="flex items-center gap-3 px-3 py-2.5 glass-card rounded-lg border border-border/40 hover:border-brand/30 shadow-sm transition-all duration-300 hover:shadow-glow-sm">
            <div className="h-8 w-8 rounded-full bg-brand flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(20,198,203,0.2)]">
              <span className="text-primary-foreground text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate leading-none mb-1">{displayName}</p>
              <Badge className={cn("text-[9px] px-1.5 py-0 border-0 shadow-none font-medium truncate max-w-full leading-none", roleBadgeColors[displayRole] || roleBadgeColors.ground_staff)}>
                {(displayRole || '').replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </aside>

 {/* Main content */}
      <div className="lg:pl-64">
 {/* Top header glass effect */}
        <header className="sticky top-0 z-30 h-16 glass-header border-b border-border flex items-center justify-between px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 flex items-center px-4">
            {!isPlatformAdmin && <ContextSwitcher />}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                  <Bell className="h-5 w-5" />
                  {notifications.length > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-resend-red text-white text-xs border-0 animate-pulse">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between p-2">
                  <span className="font-medium text-sm text-foreground">Notifications</span>
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-primary hover:opacity-80 font-medium transition-opacity"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No new notifications
                  </div>
                ) : (
                  notifications.slice(0, 5).map((notif) => (
                    <DropdownMenuItem
                      key={notif.id}
                      className="p-3 cursor-pointer"
                      onClick={() => markAsRead(notif.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{notif.title}</p>
                          {notif.type === 'AI_alert' && (
                            <Badge className="bg-resend-purple/10 text-resend-purple text-[10px] px-1 border-0">AI Insight</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message || notif.body}</p>
                      </div>
                      <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 hover:bg-secondary/70">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center border border-border">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="hidden md:block text-left">
                    <span className="block text-sm font-medium text-foreground">
                      {displayName}
                    </span>
                    <span className="block text-[10px] text-muted-foreground capitalize">
                      {(displayRole || '').replace('_', ' ')}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/Profile')} className="cursor-pointer">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/Profile?tab=settings')} className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="cursor-default">
                  <Shield className="h-4 w-4 mr-2" />
                  <span className="capitalize">{(displayRole || '').replace('_', ' ')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {currentPageName !== 'Dashboard' && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mb-4 text-muted-foreground hover:text-foreground group -ml-2"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back
            </Button>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
