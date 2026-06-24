import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Gavel, Truck, TrendingDown, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function VendorBidding() {
  const { currentOrganization } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bidsResolved, setBidsResolved] = useState(false);

  useEffect(() => {
    if (!currentOrganization) return;
    
    // Subscribe to realtime updates for vendor bids
    const channel = supabase.channel('vendor-bids-sync')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'vendor_bids' 
      }, (payload) => {
        // If a bid is updated or inserted, handle the status
        console.log('Real-time bid update:', payload);
        toast.info('Vendor bid statuses updated via real-time sync.');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Connected to vendor bids real-time channel');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('Real-time channel disconnected. Attempting to reconnect...');
          // Implement simple polling fallback on disconnect
          setTimeout(() => channel.subscribe(), 5000);
        }
      });

    const handleOnline = () => {
      toast.success('Connection restored. Syncing latest bids...');
      // Trigger a re-fetch of bids here if we had a data-fetching function
    };
    window.addEventListener('online', handleOnline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentOrganization]);

  const handleEvaluateBids = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-vendor-bids', {
        body: { 
          action: 'evaluate_bids', 
          organization_id: currentOrganization.id,
          // Hardcoding a demo item ID just to trigger the function
          global_item_id: '00000000-0000-0000-0000-000000000000' 
        }
      });
      
      if (error) throw error;
      setBidsResolved(true);
      toast.success('Bid evaluation complete! Lowest cost vendor selected.');
    } catch (err) {
      toast.error('Failed to evaluate bids: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Procurement & Logistics</h1>
          <p className="text-slate-500">Automated vendor bidding and commissary routing</p>
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
            <p className="text-sm text-slate-600">
              Broadcast your required inventory items to all registered vendors and let the system automatically select the lowest-cost supplier.
            </p>
            
            <div className="bg-slate-50 p-4 rounded-md border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-slate-800">Chicken Breast (40lb Case)</span>
                <span className="text-sm text-slate-500">3 Pending Bids</span>
              </div>
              {!bidsResolved ? (
                <Button onClick={handleEvaluateBids} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {loading ? 'Evaluating...' : 'Evaluate Bids'}
                </Button>
              ) : (
                <div className="flex items-center text-green-600 bg-green-50 p-2 rounded justify-center font-medium">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Winner: US Foods ($72.50)
                </div>
              )}
            </div>
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
            <div className="text-center py-8 text-slate-500">
              <Truck className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p>No active delivery routes today.</p>
              <Button variant="outline" className="mt-4">Build Manifest</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
