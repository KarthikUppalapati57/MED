import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
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
    
    // In production, this would use Deno.env.get('STRIPE_SECRET_KEY')
    // We are mocking the stripe token for MVP demonstration
    const stripe = new Stripe('sk_test_mock_token_for_mvp', {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { plan_id, org_id } = await req.json()

    if (!plan_id || !org_id) {
      throw new Error("Missing required parameters")
    }

    // 1. Fetch Plan Details
    const { data: plan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .single()

    if (planError || !plan) throw new Error("Invalid plan ID")

    // 2. Fetch Organization Details to get customer email
    const { data: org, error: orgError } = await supabaseClient
      .from('organizations')
      .select('name, stripe_customer_id')
      .eq('id', org_id)
      .single()

    if (orgError) throw orgError

    console.log(`Creating checkout session for Org: ${org.name}, Plan: ${plan.name}`)

    // 3. (Mock) Stripe Session Creation
    // In a real app, we would call:
    // const session = await stripe.checkout.sessions.create({ ... })
    // For this hardened demo, we return a simulated success URL
    const mockSessionUrl = `/Billing?success=true&session_id=cs_mock_${Math.floor(Math.random()*10000)}&plan=${plan_id}`;

    return new Response(JSON.stringify({ success: true, url: mockSessionUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Checkout error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
