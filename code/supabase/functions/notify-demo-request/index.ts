// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { full_name, email, company_name, phone, plan } = await req.json()

    // In a real app, you would integrate SendGrid or Resend here to notify admins.
    // For now, we rely on database triggers or insert into demo_requests to drive workflow natively.
    console.log(`New Demo Request: ${full_name} (${company_name}) - ${email}`);

    // Insert into demo_requests (so that the pg_net trigger can pick it up)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: insertError } = await supabaseClient
      .from('demo_requests')
      .insert({
        full_name,
        email,
        company_name,
        phone,
        plan
      })

    if (insertError) {
      console.error('Error inserting demo request:', insertError)
      throw insertError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
