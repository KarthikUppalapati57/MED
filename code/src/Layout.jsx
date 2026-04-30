import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Building2
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

const navigation = [
  { name: 'Dashboard', href: 'Dashboard', icon: LayoutDashboard, minRole: 'ground_staff' },
  { name: 'Platform Admin', href: 'PlatformAdmin', icon: Shield, minRole: 'platform_admin' },
  { name: 'Invoices', href: 'Invoices', icon: FileText, minRole: 'ground_staff' },
  { name: 'Payments', href: 'Payments', icon: CreditCard, minRole: 'branch_manager' },
  { name: 'Products', href: 'Products', icon: Package, minRole: 'ground_staff' },
  { name: 'Inventory', href: 'Inventory', icon: Warehouse, minRole: 'location_manager' },
  { name: 'Orders', href: 'AutoOrdering', icon: ShoppingCart, minRole: 'location_manager' },
  { name: 'Recipes', href: 'Recipes', icon: ChefHat, minRole: 'location_manager' },
  { name: 'Vendors', href: 'Vendors', icon: Store, minRole: 'branch_manager' },
  { name: 'My Organization', href: 'OrgManagement', icon: Building2, minRole: 'org_owner' },
  { name: 'Users', href: 'UserManagement', icon: Users, minRole: 'org_owner' },
  { name: 'Audit Logs', href: 'AuditLogs', icon: FileText, minRole: 'org_owner' },
];

const roleBadgeColors = {
  ground_staff: 'bg-slate-100 text-slate-700',
  location_manager: 'bg-blue-100 text-blue-700',
  manager: 'bg-blue-100 text-blue-700',           // alias
  branch_manager: 'bg-cyan-100 text-cyan-700',
  org_owner: 'bg-purple-100 text-purple-700',
  owner: 'bg-purple-100 text-purple-700',          // alias
  admin: 'bg-purple-100 text-purple-700',          // alias
  platform_admin: 'bg-indigo-100 text-indigo-700',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, userProfile, logout, role } = useAuth();
  const { hasMinRole } = usePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const markAsRead = async (notifId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId);
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user?.id)
      .eq('is_read', false);
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Filter navigation based on user role
  const filteredNavigation = navigation.filter(item => hasMinRole(item.minRole));

  const displayName = userProfile?.full_name || user?.email?.split('@')[0] || 'User';
  const displayRole = role || 'loading';

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        :root {
          --primary: 210 100% 35%;
          --primary-foreground: 0 0% 100%;
        }
      `}</style>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-500 flex items-center justify-center">
              <Package className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-white">EdgeOps</span>
          </Link>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {filteredNavigation.map((item) => {
            const isActive = currentPageName === item.href;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.href)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-teal-500/10 text-teal-400 shadow-sm"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info at bottom of sidebar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3">
            <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <Badge className={cn("text-[10px] px-1.5 py-0", roleBadgeColors[displayRole] || roleBadgeColors.ground_staff)}>
                {(displayRole || '').replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-slate-600" />
                  {notifications.length > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs animate-pulse">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between p-2">
                  <span className="font-medium text-sm text-slate-900">Notifications</span>
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">
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
                          {notif.priority === 'high' && (
                            <Badge className="bg-red-100 text-red-700 text-[10px] px-1">urgent</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{notif.message}</p>
                      </div>
                      <Check className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-teal-600" />
                  </div>
                  <div className="hidden md:block text-left">
                    <span className="block text-sm font-medium text-slate-700">
                      {displayName}
                    </span>
                    <span className="block text-[10px] text-slate-400 capitalize">
                      {(displayRole || '').replace('_', ' ')}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="cursor-pointer">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Shield className="h-4 w-4 mr-2" />
                  <span className="capitalize">{(displayRole || '').replace('_', ' ')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}