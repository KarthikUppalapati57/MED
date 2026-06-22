import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const { action, recipe_id, location_id } = payload;
    // action: '86' (out of stock) or '68' (back in stock) or 'price_update'

    if (!action || !recipe_id || !location_id) {
      throw new Error('Missing required fields: action, recipe_id, location_id');
    }

    console.log(`Syncing ${action} for recipe ${recipe_id} at location ${location_id}...`);

    // Lookup active delivery channels for this location
    const { data: channels, error } = await supabaseClient
      .from('delivery_channels')
      .select('id, provider')
      .eq('location_id', location_id)
      .eq('is_active', true);
      
    if (error) throw error;

    let syncedCount = 0;

    for (const channel of channels || []) {
      // MOCK: In production, we'd make fetch requests to UberEats / DoorDash APIs here
      console.log(`Pushing update to ${channel.provider}...`);
      
      const { error: logError } = await supabaseClient
        .from('menu_sync_logs')
        .insert({
          channel_id: channel.id,
          recipe_id: recipe_id,
          action: action,
          status: 'success'
        });
        
      if (!logError) syncedCount++;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Menu update synced to ${syncedCount} channels.`,
      synced_count: syncedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
