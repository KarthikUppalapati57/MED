import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Gavel, Truck, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function VendorBidding() {
  const { currentOrganization } = useAuth();
  const [evaluatingItemId, setEvaluatingItemId] = useState(null);
  const [winners, setWinners] = useState({});

  const { data: pendingGroups = [], isLoading, refetch } = useQuery({
    queryKey: ['pending-procurement-bids', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procurement_bids')
        .select('global_item_id, vendor_id, bid_price, vendors(name), global_vendor_items(item_name)')
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'pending');
      if (error) throw error;

      const grouped = {};
      for (const bid of data || []) {
        if (!grouped[bid.global_item_id]) {
          grouped[bid.global_item_id] = {
            global_item_id: bid.global_item_id,
            item_name: bid.global_vendor_items?.item_name || 'Unknown item',
            bids: [],
          };
        }
        grouped[bid.global_item_id].bids.push({ vendor_name: bid.vendors?.name, bid_price: bid.bid_price });
      }
      return Object.values(grouped);
    },
    enabled: !!currentOrganization?.id,
  });

  useEffect(() => {
    if (!currentOrganization) return;

    const channel = supabase.channel('vendor-bids-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'procurement_bids'
      }, () => {
        refetch();
      })
      .subscribe();

    const handleOnline = () => {
      toast.success('Connection restored. Syncing latest bids...');
      refetch();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentOrganization, refetch]);

  const handleEvaluateBids = async (globalItemId) => {
    if (!currentOrganization) return;
    setEvaluatingItemId(globalItemId);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-vendor-bids', {
        body: {
          action: 'evaluate_bids',
          organization_id: currentOrganization.id,
          global_item_id: globalItemId
        }
      });

      if (error) throw error;
      if (data?.winning_bid) {
        setWinners(prev => ({ ...prev, [globalItemId]: data.winning_bid }));
        toast.success('Bid evaluation complete! Lowest cost vendor selected.');
      } else {
        toast.info(data?.message || 'No pending bids to evaluate.');
      }
      refetch();
    } catch (err) {
      toast.error('Failed to evaluate bids: ' + err.message);
    } finally {
      setEvaluatingItemId(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Procurement & Logistics</h1>
          <p className="text-muted-foreground">Automated vendor bidding and commissary routing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Gavel className="w-5 h-5 mr-2 text-indigo-600" />
              Vendor Bid Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vendors with pending bids on the same item are shown below. Evaluating selects the lowest-cost bid.
            </p>

            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading pending bids...</p>
            ) : pendingGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pending bids to evaluate.</p>
            ) : (
              pendingGroups.map(group => {
                const winner = winners[group.global_item_id];
                return (
                  <div key={group.global_item_id} className="bg-muted/40 p-4 rounded-md border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-foreground">{group.item_name}</span>
                      <span className="text-sm text-muted-foreground">{group.bids.length} Pending Bid{group.bids.length === 1 ? '' : 's'}</span>
                    </div>
                    {!winner ? (
                      <Button
                        onClick={() => handleEvaluateBids(group.global_item_id)}
                        disabled={evaluatingItemId === group.global_item_id}
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                      >
                        {evaluatingItemId === group.global_item_id ? 'Evaluating...' : 'Evaluate Bids'}
                      </Button>
                    ) : (
                      <div className="flex items-center text-green-600 bg-green-50 p-2 rounded justify-center font-medium">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Winner: {group.bids.find(b => Number(b.bid_price) === Number(winner.bid_price))?.vendor_name || 'Vendor'} (${Number(winner.bid_price).toFixed(2)})
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="w-5 h-5 mr-2 text-indigo-600" />
              Commissary Logistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto text-muted-foreground/60 mb-4" />
              <p>No active delivery routes today.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
