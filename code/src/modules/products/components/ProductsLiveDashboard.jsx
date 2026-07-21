import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, TrendingUp, AlertTriangle, ChefHat } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const getProductName = (row) => row?.name || row?.product_name || row?.display_name || 'Updated Product';
const getCogs = (row, fallback) => Number(row?.cogs_percent ?? row?.plate_cost_percent ?? row?.cost_percent ?? fallback);

export default function ProductsLiveDashboard({ targetCogs = 30 }) {
  const { organization } = useAuth();
  const [liveEvents, setLiveEvents] = useState([]);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (!organization?.id) return;

    const channel = supabase.channel(`live-costing-dashboard-${organization.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload) => {
        const oldCogs = getCogs(payload.old, targetCogs);
        const newCogs = getCogs(payload.new, targetCogs);
        const delta = newCogs - oldCogs;
        const impact = newCogs > targetCogs ? (delta > 0 ? 'critical' : 'warning') : 'positive';

        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 2000);

        const newEvent = {
          id: `${payload.commit_timestamp || Date.now()}-${payload.new?.id || crypto.randomUUID()}`,
          product: getProductName(payload.new),
          variance: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
          impact,
          recipe_impacted: 'Review linked recipes',
          new_cogs: Number.isFinite(newCogs) ? Number(newCogs.toFixed(1)) : targetCogs,
          time: new Date(payload.commit_timestamp || Date.now()),
        };

        setLiveEvents(prev => [newEvent, ...prev].slice(0, 5));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, targetCogs]);

  return (
    <Card className={`border-0 shadow-sm transition-colors duration-500 ${isFlashing ? 'bg-resend-red/5 border-resend-red/20' : 'bg-card'}`}>
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative flex h-3 w-3 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-resend-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-resend-green"></span>
            </div>
            Live Costing & Margin Engine
          </CardTitle>
          <div className="flex items-center gap-2 text-xs font-medium bg-secondary/50 px-3 py-1 rounded-full">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            Target COGS: {targetCogs}%
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {liveEvents.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Waiting for live product cost updates...
            </div>
          ) : (
            liveEvents.map(event => {
              const isDanger = event.new_cogs > targetCogs;

              return (
                <div key={event.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${event.impact === 'positive' ? 'bg-resend-green/10 text-resend-green' : event.impact === 'critical' ? 'bg-resend-red/10 text-resend-red' : 'bg-resend-yellow/10 text-resend-yellow'}`}>
                      {event.impact === 'positive' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                        {event.product}
                        <Badge variant="outline" className={`font-mono text-[10px] ${event.impact === 'positive' ? 'text-resend-green border-resend-green/30' : 'text-resend-red border-resend-red/30'}`}>
                          {event.variance}
                        </Badge>
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <ChefHat className="h-3 w-3" />
                        Impacts: <span className="font-medium text-foreground">{event.recipe_impacted}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={`text-sm font-bold ${isDanger ? 'text-resend-red' : 'text-resend-green'}`}>
                        {event.new_cogs}% COGS
                      </span>
                      {isDanger && <AlertTriangle className="h-3.5 w-3.5 text-resend-red" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                      {event.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
