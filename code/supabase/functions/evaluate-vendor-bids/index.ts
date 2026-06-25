import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseClient = getSupabaseClient(authHeader)

    const payload = await req.json()
    // Support webhook invocation or direct call
    const { action, organization_id, global_item_id } = payload

    if (action === 'evaluate_bids' && organization_id && global_item_id) {
      console.log(`Evaluating bids for Org: ${organization_id}, Item: ${global_item_id}`)
      
      // 1. Fetch all pending bids for this item
      const { data: bids, error: fetchError } = await supabaseClient
        .from('procurement_bids')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('global_item_id', global_item_id)
        .eq('status', 'pending');

      if (fetchError) throw fetchError;

      if (!bids || bids.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "No pending bids to evaluate." }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 2. Find the lowest bid
      let winningBid = bids[0];
      for (const bid of bids) {
        if (bid.bid_price < winningBid.bid_price) {
          winningBid = bid;
        }
      }

      console.log(`Winning bid selected: ${winningBid.id} with price ${winningBid.bid_price}`);

      // 3. Update bids
      for (const bid of bids) {
        const newStatus = bid.id === winningBid.id ? 'accepted' : 'rejected';
        await supabaseClient
          .from('procurement_bids')
          .update({ status: newStatus })
          .eq('id', bid.id);
      }

      return new Response(JSON.stringify({ success: true, winning_bid: winningBid }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Bid evaluation error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
