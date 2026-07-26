import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Check, Trash2, ShieldAlert, Sparkles, AlertCircle, Info, Clock, CheckCircle2, Mail, MessageSquare, MonitorCheck, SlidersHorizontal } from "lucide-react";
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { formatDistanceToNow } from 'date-fns';
import { cn } from "@/lib/utils";
import { getNotificationAction } from '@/lib/notificationActions';
import { MODULE_DEFINITIONS, isPageInEnabledModules } from '@/lib/moduleConfig';
import { usePermissions } from '@/hooks/usePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Groups the notifications.type check-constraint values (see 106_schema_hardening) into the
// app's actual modules, so the Notifications page can offer per-module tabs alongside "All".
const NOTIFICATION_MODULES = [
  { key: 'invoices', label: 'Invoices', types: ['invoice', 'approval', 'invoice_approved'] },
  { key: 'payments', label: 'Payments', types: ['payment', 'payment_failed', 'billing'] },
  { key: 'inventory', label: 'Inventory', types: ['inventory', 'low_inventory', 'order'] },
  { key: 'vendors', label: 'Vendors', types: ['vendor_update'] },
  { key: 'labor', label: 'Labor', types: ['labor_alert'] },
  { key: 'system', label: 'System', types: ['system', 'alert', 'warning', 'error', 'AI_alert'] },
];

export function resolveNotificationModuleKey(notif) {
  const metadataModuleKey = notif?.metadata?.module_key;
  if (metadataModuleKey && NOTIFICATION_MODULES.some((module) => module.key === metadataModuleKey)) {
    return metadataModuleKey;
  }
  return NOTIFICATION_MODULES.find((module) => module.types.includes(notif?.type))?.key || 'system';
}

const MODULE_LABEL_OVERRIDES = {
  dashboard: 'Dashboard & System',
};

const DELIVERY_CHANNELS = [
  { key: 'in_app_enabled', label: 'App', icon: MonitorCheck },
  { key: 'email_enabled', label: 'Email', icon: Mail },
  { key: 'phone_enabled', label: 'SMS', icon: MessageSquare },
];

const MODULE_SETTING_ALIAS_KEYS = new Set(['inventory_management', 'recipe_management', 'vendor_management']);

const isMissingPreferenceTable = (error) => {
  const message = String(error?.message || '');
  return error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('notification_delivery_preferences');
};

const defaultPreferenceFor = (moduleKey, user, organization, userProfile) => ({
  user_id: user?.id,
  organization_id: organization?.id || userProfile?.organization_id || null,
  module_key: moduleKey,
  in_app_enabled: true,
  email_enabled: false,
  phone_enabled: false,
  critical_only: false,
});

export default function Notifications() {
  const { user, userProfile, organization } = useAuth();
  const { hasMinRole, isPlatformAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeView, setActiveView] = React.useState('notifications');
  const [activeModule, setActiveModule] = React.useState('all');
  const invalidateNotifications = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications_page', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
  }, [queryClient, user?.id]);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications_page', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: notificationPreferences = [], isLoading: isPreferencesLoading, error: preferencesError } = useQuery({
    queryKey: ['notification_delivery_preferences', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_delivery_preferences')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        if (isMissingPreferenceTable(error)) return [];
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id,
  });

  const preferenceByModule = React.useMemo(() => {
    return new Map(notificationPreferences.map((preference) => [preference.module_key, preference]));
  }, [notificationPreferences]);

  const accessibleModules = React.useMemo(() => {
    const enabledModules = organization?.enabled_modules;
    const userRole = userProfile?.role;
    const seenLabels = new Set();

    return Object.entries(MODULE_DEFINITIONS)
      .map(([moduleKey, definition]) => {
        if (!definition || MODULE_SETTING_ALIAS_KEYS.has(moduleKey)) return null;
        if (!hasMinRole(definition.minRole)) return null;
        const primaryPage = definition.pages?.[0] || moduleKey;
        if (!isPlatformAdmin && !isPageInEnabledModules(primaryPage, enabledModules, userRole)) return null;

        const label = MODULE_LABEL_OVERRIDES[moduleKey] || definition.label;
        const labelKey = label.toLowerCase();
        if (seenLabels.has(labelKey)) return null;
        seenLabels.add(labelKey);

        return {
          key: moduleKey,
          label,
          minRole: definition.minRole,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hasMinRole, isPlatformAdmin, organization?.enabled_modules, userProfile?.role]);

  const getPreference = React.useCallback((moduleKey) => ({
    ...defaultPreferenceFor(moduleKey, user, organization, userProfile),
    ...(preferenceByModule.get(moduleKey) || {}),
  }), [organization, preferenceByModule, user, userProfile]);

  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ moduleKey, changes }) => {
      const current = getPreference(moduleKey);
      const payload = {
        user_id: user.id,
        organization_id: organization?.id || userProfile?.organization_id || null,
        module_key: moduleKey,
        in_app_enabled: current.in_app_enabled,
        email_enabled: current.email_enabled,
        phone_enabled: current.phone_enabled,
        critical_only: current.critical_only,
        ...changes,
      };

      const { error } = await supabase
        .from('notification_delivery_preferences')
        .upsert(payload, { onConflict: 'user_id,module_key' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification_delivery_preferences', user?.id] });
    },
    onError: (error) => {
      const message = isMissingPreferenceTable(error)
        ? 'Notification settings need the latest database migration.'
        : error?.message || 'Unable to save notification setting.';
      toast.error(message);
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateNotifications();
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('All notifications marked as read');
      invalidateNotifications();
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateNotifications();
    }
  });

  React.useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        invalidateNotifications
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateNotifications, user?.id]);

  const getIcon = (type) => {
    switch (type) {
      case 'AI_alert': return <Sparkles className="w-5 h-5 text-resend-purple" />;
      case 'system': return <Info className="w-5 h-5 text-resend-blue" />;
      case 'approval': return <CheckCircle2 className="w-5 h-5 text-resend-green" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-resend-orange" />;
      case 'error': return <ShieldAlert className="w-5 h-5 text-resend-red" />;
      default: return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getBgColor = (type, isRead) => {
    if (isRead) return 'bg-secondary/20 border-transparent';
    switch (type) {
      case 'AI_alert': return 'bg-resend-purple/5 border-resend-purple/20';
      case 'system': return 'bg-resend-blue/5 border-resend-blue/20';
      case 'approval': return 'bg-resend-green/5 border-resend-green/20';
      case 'warning': return 'bg-resend-orange/5 border-resend-orange/20';
      case 'error': return 'bg-resend-red/5 border-resend-red/20';
      default: return 'bg-secondary/50 border-border/50';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const notificationsByModule = React.useMemo(() => {
    const map = new Map(NOTIFICATION_MODULES.map(m => [m.key, []]));
    notifications.forEach(n => map.get(resolveNotificationModuleKey(n)).push(n));
    return map;
  }, [notifications]);

  const visibleNotifications = activeModule === 'all' ? notifications : (notificationsByModule.get(activeModule) || []);

  const handleOpenAction = async (notif) => {
    const action = getNotificationAction(notif);
    if (!action) return;
    if (!notif.is_read) {
      await markAsReadMutation.mutateAsync(notif.id);
    }
    navigate(action.path);
  };

  const handlePreferenceToggle = (moduleKey, field, checked) => {
    updatePreferenceMutation.mutate({ moduleKey, changes: { [field]: checked } });
  };

  const renderNotificationList = () => (
    <>
      <Tabs value={activeModule} onValueChange={setActiveModule}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All {notifications.length > 0 && `(${notifications.length})`}</TabsTrigger>
          {NOTIFICATION_MODULES.map(m => {
            const count = notificationsByModule.get(m.key)?.length || 0;
            if (count === 0) return null;
            return <TabsTrigger key={m.key} value={m.key}>{m.label} ({count})</TabsTrigger>;
          })}
        </TabsList>
      </Tabs>

      <Card className="border-0 shadow-sm glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-border border-t-brand rounded-full animate-spin mb-4" />
              Loading your notifications...
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="p-24 text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                <Bell className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {activeModule === 'all' ? "You're all caught up!" : 'Nothing here'}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                {activeModule === 'all'
                  ? 'There are no notifications or pending approvals at this time.'
                  : 'No notifications in this module right now.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {visibleNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-6 flex items-start gap-4 transition-colors duration-200 group relative border-l-4",
                    getBgColor(notif.type, notif.is_read),
                    notif.is_read ? "border-l-transparent" : "border-l-brand"
                  )}
                >
                  <div className="mt-1 shrink-0 p-2 rounded-full bg-background border border-border/50 shadow-sm">
                    {getIcon(notif.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className={cn("text-base font-bold", notif.is_read ? "text-foreground/80" : "text-foreground")}>
                          {notif.title}
                        </h4>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </span>
                          {notif.type && (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 px-1.5 font-bold">
                              {notif.type.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        {!notif.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markAsReadMutation.mutate(notif.id)}
                            title="Mark as read"
                            className="h-8 w-8 text-muted-foreground hover:text-brand hover:bg-brand/10"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteNotificationMutation.mutate(notif.id)}
                          title="Delete"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <p className={cn("mt-3 text-sm leading-relaxed", notif.is_read ? "text-muted-foreground" : "text-foreground/90")}>
                      {notif.message || notif.body}
                    </p>

                    {getNotificationAction(notif) && (
                      <div className="mt-4 flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={() => handleOpenAction(notif)}
                          className="bg-resend-green hover:bg-resend-green/90 text-white shadow-glow-sm font-bold text-xs h-8"
                        >
                          {getNotificationAction(notif).label}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderSettings = () => (
    <Card className="border-0 shadow-sm glass-card">
      <CardContent className="p-0">
        <div className="flex flex-col gap-2 border-b border-border/50 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Notification Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">App, email, SMS, and priority filtering for every module this user can access.</p>
          </div>
          {preferencesError && !isMissingPreferenceTable(preferencesError) && (
            <Badge variant="destructive">Settings unavailable</Badge>
          )}
        </div>

        {isPreferencesLoading ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="w-8 h-8 border-4 border-border border-t-brand rounded-full animate-spin mb-4" />
            Loading notification settings...
          </div>
        ) : accessibleModules.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">No notification settings are available for this role.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {accessibleModules.map((module) => {
              const preference = getPreference(module.key);
              const isSaving = updatePreferenceMutation.isPending;

              return (
                <div key={module.key} className="grid gap-4 p-5 md:grid-cols-[minmax(180px,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">{module.label}</p>
                      {preference.critical_only && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Priority</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">Minimum role: {module.minRole.replace('_', ' ')}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {DELIVERY_CHANNELS.map((channel) => {
                      const Icon = channel.icon;
                      return (
                        <label key={`${module.key}-${channel.key}`} className="flex h-10 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="min-w-10 text-sm font-medium text-foreground">{channel.label}</span>
                          <Switch
                            checked={Boolean(preference[channel.key])}
                            disabled={isSaving}
                            onCheckedChange={(checked) => handlePreferenceToggle(module.key, channel.key, checked)}
                            aria-label={`${module.label} ${channel.label} notifications`}
                          />
                        </label>
                      );
                    })}

                    <label className="flex h-10 items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3">
                      <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Priority only</span>
                      <Switch
                        checked={Boolean(preference.critical_only)}
                        disabled={isSaving}
                        onCheckedChange={(checked) => handlePreferenceToggle(module.key, 'critical_only', checked)}
                        aria-label={`${module.label} priority-only notifications`}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-8 w-full max-w-[2400px] mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-brand text-primary-foreground border-0 px-2 py-0.5 text-sm rounded-full">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-2">Manage your notifications, alerts, approvals, and delivery settings.</p>
        </div>

        {activeView === 'notifications' && unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
            className="font-bold gap-2 shadow-sm border-brand/20 text-brand hover:bg-brand/10 hover:text-brand"
          >
            <Check className="w-4 h-4" />
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications" className="space-y-6">
          {renderNotificationList()}
        </TabsContent>
        <TabsContent value="settings" className="space-y-6">
          {renderSettings()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

