import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export function useRealtimeEvents() {
  const { activeOrg, role } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // If no activeOrg is present (e.g. platform admin viewing global dash),
    // we can either subscribe to all events (if platform_admin) or skip.
    // For this implementation, we focus on organization-scoped events.
    if (!activeOrg?.id) return;

    const channel = supabase
      .channel('global-realtime-events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_logs',
          filter: `organization_id=eq.${activeOrg.id}`
        },
        (payload) => {
          const newEvent = payload.new;
          if (!newEvent || !newEvent.event_name) return;

          const eventName = newEvent.event_name;
          
          const keysToInvalidate = [];
          if (eventName.startsWith('user.') || eventName.startsWith('invitation.') || eventName.startsWith('employee.')) {
            keysToInvalidate.push(['client-invites'], ['all-profiles'], ['dash-profiles'], ['labor']);
          } else if (eventName.startsWith('organization.')) {
            keysToInvalidate.push(['organizations'], ['dash-orgs']);
          } else if (eventName.startsWith('inventory.')) {
            keysToInvalidate.push(['inventory'], ['products']);
          } else if (eventName.startsWith('order.') || eventName.startsWith('payment.') || eventName.startsWith('invoice.')) {
            keysToInvalidate.push(['invoices'], ['payments']);
          } else if (eventName.startsWith('subscription.')) {
            keysToInvalidate.push(['dash-plans'], ['dash-orgs']);
          }

          // Debounce invalidations to prevent network spam and UI lag
          keysToInvalidate.forEach(key => {
            const keyStr = JSON.stringify(key);
            if (window.__realtimeTimeouts?.[keyStr]) {
              clearTimeout(window.__realtimeTimeouts[keyStr]);
            }
            window.__realtimeTimeouts = window.__realtimeTimeouts || {};
            window.__realtimeTimeouts[keyStr] = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: key });
              delete window.__realtimeTimeouts[keyStr];
            }, 800);
          });

          // Dispatch a custom window event so specific components can listen if needed
          window.dispatchEvent(new CustomEvent('domain-event', { detail: newEvent }));
        }
      )
      .subscribe();

    // Track C: Listen to partitioned logs for admins
    let logsChannel = null;
    if (role === 'platform_admin' || role === 'org_owner') {
      logsChannel = supabase
        .channel('admin-logs-channel')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'audit_logs' },
          (payload) => {
            queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
            window.dispatchEvent(new CustomEvent('audit-log-event', { detail: payload.new }));
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'error_logs' },
          (payload) => {
            queryClient.invalidateQueries({ queryKey: ['error-logs'] });
            window.dispatchEvent(new CustomEvent('error-log-event', { detail: payload.new }));
          }
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(channel);
      if (logsChannel) supabase.removeChannel(logsChannel);
    };
  }, [activeOrg?.id, queryClient, role]);
}
