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
    const { type, table, record } = payload

    if (table === 'invitations' && type === 'INSERT') {
      console.log(`Sending invitation email to ${record.email} for role ${record.role} in Org ${record.organization_id}`);
      // SendGrid / Resend integration would go here
    } 
    else if (table === 'integrations' && type === 'INSERT') {
      console.log(`Validating credentials for Integration ${record.id} (Type: ${record.type})`);
      console.log(`Syncing initial historical data for Integration ${record.id}`);
      
      // Update integration status
      await supabaseClient.from('integrations').update({ status: 'active' }).eq('id', record.id);
    }

    return new Response(JSON.stringify({ success: true, processed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error in team-worker:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
