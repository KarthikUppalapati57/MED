import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { CheckCircle2, Clock, Flame } from 'lucide-react';
import { toast } from 'sonner';

export default function KDS() {
  const { location } = useAuth();
  const queryClient = useQueryClient();
  const [tickets, setTickets] = useState([]);

  // Fetch initial active tickets
  const { data: initialTickets } = useQuery({
    queryKey: ['kds-tickets', location?.id],
    queryFn: () => api.entities.SalesTicket.list('created_at', {
      select: '*, sales_ticket_items(*)',
      match: { location_id: location.id, status: 'open' }
    }),
    enabled: !!location?.id,
  });

  useEffect(() => {
    if (initialTickets) {
      setTickets(initialTickets);
    }
  }, [initialTickets]);

  // Realtime subscription
  useEffect(() => {
    if (!location?.id) return;

    const channel = supabase.channel(`kds-${location.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'sales_tickets',
        filter: `location_id=eq.${location.id}`
      }, (payload) => {
        // Refetch tickets to ensure we have the nested items
        queryClient.invalidateQueries(['kds-tickets', location.id]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location?.id, queryClient]);

  const bumpMutation = useMutation({
    mutationFn: (ticketId) => api.entities.SalesTicket.update(ticketId, { status: 'fulfilled' }),
    onSuccess: (data, ticketId) => {
      toast.success(`Order ${ticketId.substring(0, 8)} bumped`);
      setTickets(t => t.filter(x => x.id !== ticketId));
    }
  });

  if (!location) {
    return <div className="p-8 text-center bg-black text-white min-h-screen">Please select a location to view KDS</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans">
      <header className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
        <h1 className="text-3xl font-black text-emerald-400">RESTOPS KDS</h1>
        <div className="text-xl font-bold">{tickets.length} Active Orders</div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tickets.map(ticket => {
          const ageMinutes = Math.floor((new Date() - new Date(ticket.created_at)) / 60000);
          const isUrgent = ageMinutes > 15;

          return (
            <div 
              key={ticket.id} 
              className={`flex flex-col border-2 rounded-xl overflow-hidden shadow-xl ${isUrgent ? 'border-red-500 bg-red-950/20' : 'border-slate-700 bg-slate-800'}`}
            >
              <div className={`p-3 border-b flex justify-between items-center ${isUrgent ? 'bg-red-500 text-white' : 'bg-slate-700'}`}>
                <div className="font-bold text-lg">#{ticket.id.substring(0, 6).toUpperCase()}</div>
                <div className="flex items-center gap-1 font-mono font-bold">
                  {isUrgent && <Flame className="w-4 h-4 animate-pulse" />}
                  <Clock className="w-4 h-4" /> {ageMinutes}m
                </div>
              </div>

              <div className="p-4 flex-1 space-y-3 overflow-y-auto min-h-[200px]">
                {(ticket.sales_ticket_items || []).map(item => (
                  <div key={item.id} className="text-xl border-b border-slate-600/50 pb-2">
                    <span className="font-black text-emerald-400 mr-2">{item.quantity}x</span>
                    <span className="font-semibold">{item.item_name}</span>
                    {item.notes && (
                      <div className="text-sm text-yellow-400 mt-1 pl-6">** {item.notes} **</div>
                    )}
                  </div>
                ))}
              </div>

              <button 
                onClick={() => bumpMutation.mutate(ticket.id)}
                className="p-4 text-center font-black text-2xl uppercase tracking-widest transition-colors bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
              >
                Bump
              </button>
            </div>
          );
        })}
      </div>

      {tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[60vh] opacity-50">
          <CheckCircle2 className="w-32 h-32 mb-4 text-emerald-500" />
          <h2 className="text-4xl font-bold">Kitchen is clear!</h2>
        </div>
      )}
    </div>
  );
}
