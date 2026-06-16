// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
    const { type, table, record, old_record } = payload

    // Billing logic is based on 'subscriptions' or 'plans' table changes
    if (table === 'subscriptions' || table === 'organizations') {
      if (type === 'INSERT') {
        console.log(`Provisioning premium features for Org ${record.organization_id} (Plan: ${record.plan_id})`);
        console.log(`Sending premium welcome email to Customer`);
      } 
      else if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'canceled') {
          console.log(`Disabling premium features for Customer`);
          console.log(`Scheduling data archive job for Customer`);
          
          // Optionally update features table or app_metadata
        } else {
          console.log(`Adjusting platform quotas for Customer to status ${record.status}`);
        }
      }
    } 
    else if (table === 'payments' && type === 'UPDATE' && record.status === 'failed') {
      console.log(`Sending Dunning Email for Payment ${record.id}`);
      // In a real implementation, you would queue follow-up checks here using pg_cron or webhook_events_queue
    }

    return new Response(JSON.stringify({ success: true, processed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error in billing-worker:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
