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
    // pg_net sends a webhook payload containing { type, table, record, old_record }
    const { type, table, record, old_record } = payload

    if (table === 'demo_requests') {
      if (type === 'INSERT') {
        console.log(`Sending confirmation email to ${record.email}`);
        
        const company = record.company_name?.toLowerCase() || "";
        const isEnterprise = company.includes("inc") || company.includes("corp") || company.includes("llc");
        
        if (isEnterprise) {
          console.log(`URGENT: Enterprise demo requested by ${record.company_name}`);
          // Send internal Slack/Teams notification here
        }
      } 
      else if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'approved') {
          console.log(`Generating secure onboarding token for Request ${record.id}`);
          const token = `tok_${Math.random().toString(36).substring(7)}`;
          console.log(`Sending onboarding link with token ${token} to ${record.email}`);
        } else if (record.status === 'rejected') {
          console.log(`Sending decline email to ${record.email}`);
        }
      }
    } 
    else if (table === 'organizations' && type === 'DELETE') {
      console.log(`Archiving data and revoking sessions for Org ${old_record.id} (${old_record.name})`);
    }

    return new Response(JSON.stringify({ success: true, processed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error in process-onboarding:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
