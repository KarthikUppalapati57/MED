import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, Trash2, ShieldAlert, Sparkles, AlertCircle, Info, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { formatDistanceToNow } from 'date-fns';
import { cn } from "@/lib/utils";

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const markAsReadMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications_page', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications_page', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications_page', user?.id] });
    }
  });

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

  const getNotificationAction = (notif) => {
    const invoiceId = notif.metadata?.invoice_id || notif.reference_id;
    if (invoiceId && (notif.type === 'invoice' || notif.type === 'approval' || notif.type === 'invoice_approved')) {
      return {
        label: 'Review Invoice',
        path: `/Invoices?invoice=${invoiceId}`,
      };
    }
    if (notif.type === 'payment' || notif.type === 'payment_failed') {
      return {
        label: 'Open Payments',
        path: '/Payments?tab=invoices',
      };
    }
    if (notif.type === 'inventory' || notif.type === 'low_inventory') {
      return {
        label: 'Open Inventory',
        path: '/Inventory',
      };
    }
    return null;
  };

  const handleOpenAction = async (notif) => {
    const action = getNotificationAction(notif);
    if (!action) return;
    if (!notif.is_read) {
      await markAsReadMutation.mutateAsync(notif.id);
    }
    navigate(action.path);
  };

  return (
    <div className="p-8 w-full max-w-[2400px] mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
            Inbox
            {unreadCount > 0 && (
              <Badge className="bg-brand text-primary-foreground border-0 px-2 py-0.5 text-sm rounded-full">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-2">Manage your notifications, alerts, and approvals.</p>
        </div>
        
        {unreadCount > 0 && (
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

      <Card className="border-0 shadow-sm glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <div className="w-8 h-8 border-4 border-border border-t-brand rounded-full animate-spin mb-4" />
              Loading your inbox...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-24 text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                <Bell className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold text-foreground">You're all caught up!</h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">There are no notifications or pending approvals at this time.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notif) => (
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
    </div>
  );
}
