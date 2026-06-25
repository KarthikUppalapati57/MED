import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { stripe } from "../_shared/stripe.ts"
import { createOrRetrieveCustomer } from "../_shared/supabase-admin.ts"
import { getSupabaseClient } from "../_shared/supabase.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseClient = getSupabaseClient(authHeader)

    // Auth validation

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) throw new Error('Unauthorized')

    // Check if platform_admin
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    
    if (profile?.role !== 'platform_admin') {
      throw new Error('Only platform admins can trigger invoices')
    }

    const { org_id, description } = await req.json()
    if (!org_id) throw new Error('Missing org_id')

    // Get organization details
    const { data: org, error: orgError } = await supabaseClient
      .from('organizations')
      .select('name, primary_contact_email, plan_id, stripe_customer_id')
      .eq('id', org_id)
      .single()

    if (orgError || !org) throw new Error('Organization not found')

    let customerId = org.stripe_customer_id
    if (!customerId) {
      customerId = await createOrRetrieveCustomer({
        email: org.primary_contact_email || '',
        uuid: org_id
      })
    }

    // Get plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('plans')
      .select('name, price_monthly, stripe_price_id')
      .eq('id', org.plan_id)
      .single()
    
    if (planError || !plan) throw new Error('Organization has no active plan assigned')

    // 1. Create an invoice item for the customer
    await stripe.invoiceItems.create({
      customer: customerId,
      price: plan.stripe_price_id || undefined, // If using existing price
      amount: plan.stripe_price_id ? undefined : Math.round(plan.price_monthly * 100), // Fallback to custom amount
      currency: plan.stripe_price_id ? undefined : 'usd',
      description: description || `Platform Invoice for ${plan.name} Plan`
    });

    // 2. Draft and finalize the invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: true, // Auto finalize and send
      collection_method: 'send_invoice',
      days_until_due: 7,
    });

    // We finalize it so it is sent
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    return new Response(
      JSON.stringify({ 
        message: 'Invoice created and sent successfully', 
        invoiceUrl: finalizedInvoice.hosted_invoice_url,
        invoiceId: finalizedInvoice.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
