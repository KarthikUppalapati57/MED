import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, clientName, planId, modules } = await req.json()

    if (!email || !clientName) {
      return new Response(JSON.stringify({ error: 'Missing email or clientName' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Insert invitation
    const { data: invite, error } = await supabaseAdmin
      .from('invitations')
      .insert({
        email,
        role: 'org_owner',
        onboarding_type: 'client_invite',
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return new Response(JSON.stringify({ success: true, invite }), {
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
