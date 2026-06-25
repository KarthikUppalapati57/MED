import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getSupabaseClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, role, org_id, onboarding_type } = await req.json()

    if (!email || !org_id) {
      return new Response(JSON.stringify({ error: 'Missing email or org_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const authHeader = req.headers.get('Authorization')
    const supabase = getSupabaseClient(authHeader)

    // Insert invitation
    const { data: invite, error } = await supabase
      .from('invitations')
      .insert({
        email,
        role: role || 'ground_staff',
        organization_id: org_id,
        onboarding_type: onboarding_type || 'invited',
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // In a real production app, this would also trigger SendGrid/Resend via API.
    // The frontend currently falls back to EmailJS if this returns successfully.

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
