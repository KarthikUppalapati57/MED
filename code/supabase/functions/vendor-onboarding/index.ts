import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { headers: corsHeaders, status: 405 })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const { vendor_id } = await req.json()
    if (!vendor_id) return new Response('vendor_id is required', { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 1. Fetch vendor details
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('id, name, email, dwolla_onboarding_status, organization_id')
      .eq('id', vendor_id)
      .single()

    if (error || !vendor) {
      return new Response('Vendor not found', { status: 404 })
    }

    // 2. Generate Dwolla Customer Token or Secure Link
    // (Mocked for now)
    const secureLink = `https://platform.marginedge.mock/onboarding/dwolla?vendor=${vendor.id}&token=abc123mock`

    // 3. Send email to vendor (Mocked email service)
    console.log(`Sending Dwolla onboarding link to ${vendor.email || vendor.name}: ${secureLink}`)

    // 4. Update vendor status to document_required or pending
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await serviceSupabase
      .from('vendors')
      .update({ dwolla_onboarding_status: 'document_required' })
      .eq('id', vendor_id)

    return new Response(JSON.stringify({ success: true, link: secureLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
