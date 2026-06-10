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
          
          // Pattern matching for event types to selectively invalidate queries
          if (eventName.startsWith('user.') || eventName.startsWith('invitation.') || eventName.startsWith('employee.')) {
            queryClient.invalidateQueries({ queryKey: ['client-invites'] });
            queryClient.invalidateQueries({ queryKey: ['all-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['dash-profiles'] });
            queryClient.invalidateQueries({ queryKey: ['labor'] });
          } else if (eventName.startsWith('organization.')) {
            queryClient.invalidateQueries({ queryKey: ['organizations'] });
            queryClient.invalidateQueries({ queryKey: ['dash-orgs'] });
          } else if (eventName.startsWith('inventory.')) {
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
          } else if (eventName.startsWith('order.') || eventName.startsWith('payment.') || eventName.startsWith('invoice.')) {
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
          } else if (eventName.startsWith('subscription.')) {
            queryClient.invalidateQueries({ queryKey: ['dash-plans'] });
            queryClient.invalidateQueries({ queryKey: ['dash-orgs'] });
          }

          // Dispatch a custom window event so specific components can listen if needed
          window.dispatchEvent(new CustomEvent('domain-event', { detail: newEvent }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrg?.id, queryClient]);
}
