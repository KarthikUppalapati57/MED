import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    // Support webhook invocation when marketing_campaigns row changes to 'sending'
    const { record } = payload

    if (record && record.status === 'sending') {
      console.log(`Processing marketing campaign: ${record.id} - ${record.name}`)
      
      // 1. Fetch target audience
      let query = supabaseClient.from('customers').select('id, email, phone_number').eq('organization_id', record.organization_id)
      
      if (record.target_segment === 'vip') {
        const { data: vipIds } = await supabaseClient.from('loyalty_memberships').select('customer_id').eq('tier', 'gold')
        query = query.in('id', vipIds?.map(v => v.customer_id) || [])
      }

      const { data: audience, error: audienceError } = await query;
      if (audienceError) throw audienceError;

      console.log(`Found ${audience?.length || 0} customers for campaign ${record.id}`);

      // 2. Simulate dispatch (Twilio/SendGrid would go here)
      const dispatchCount = audience?.length || 0;
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Update campaign to completed
      const { error: updateError } = await supabaseClient
        .from('marketing_campaigns')
        .update({ 
          status: 'completed', 
          sent_count: dispatchCount 
        })
        .eq('id', record.id);

      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Marketing error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
