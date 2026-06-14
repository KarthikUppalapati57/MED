import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { History, Activity, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export function InvoiceAuditLog({ invoiceId }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ['invoice-audit-events', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      return await supabase
        .from('invoice_audit_events')
        .select(`
          *,
          user:user_id (
            email,
            raw_user_meta_data
          )
        `)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
    },
    enabled: !!invoiceId
  });

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading audit history...</div>;
  }

  if (!events?.data || events.data.length === 0) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center">
        <Activity className="w-12 h-12 text-slate-200 mb-4" />
        <h3 className="text-lg font-medium text-slate-900">No Audit History</h3>
        <p className="text-slate-500 text-sm mt-1">
          No tracked events exist for this invoice yet. Future lifecycle changes will be logged here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <History className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Audit History</h2>
      </div>

      <div className="relative border-l border-slate-200 ml-3 space-y-8 pb-4">
        {events.data.map((event, idx) => (
          <div key={event.id} className="relative pl-6">
            <div className="absolute -left-1.5 top-1 w-3 h-3 bg-white border-2 border-slate-300 rounded-full" />
            
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-1">
              <span className="font-semibold text-slate-900 text-sm">
                {event.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
              <span className="text-xs text-slate-500">
                {format(new Date(event.created_at), 'MMM d, yyyy h:mm a')}
              </span>
            </div>

            <p className="text-sm text-slate-700">
              {event.description || 'System state changed'}
            </p>

            {event.user && (
              <p className="text-xs text-slate-500 mt-1">
                By: {event.user.raw_user_meta_data?.full_name || event.user.email}
              </p>
            )}

            {(event.old_value || event.new_value) && (
              <div className="mt-2 bg-slate-50 p-3 rounded text-xs font-mono text-slate-600 overflow-x-auto">
                {event.old_value && (
                  <div className="mb-1">
                    <span className="text-red-600 mr-2">-</span>
                    {JSON.stringify(event.old_value)}
                  </div>
                )}
                {event.new_value && (
                  <div>
                    <span className="text-green-600 mr-2">+</span>
                    {JSON.stringify(event.new_value)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
