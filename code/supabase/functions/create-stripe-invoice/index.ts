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

    const { org_id, organization_id, description } = await req.json()
    const targetOrganizationId = organization_id || org_id
    if (!targetOrganizationId) throw new Error('Missing organization_id')

    // Get organization details
    const { data: org, error: orgError } = await supabaseClient
      .from('organizations')
      .select('name, primary_contact_email, plan_id, stripe_customer_id')
      .eq('id', targetOrganizationId)
      .single()

    if (orgError || !org) throw new Error('Organization not found')

    let customerId = org.stripe_customer_id
    if (!customerId) {
      customerId = await createOrRetrieveCustomer({
        email: org.primary_contact_email || '',
        uuid: targetOrganizationId
      })
    }

    // Get plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('plans')
      .select('name, price_monthly, stripe_price_id')
      .eq('id', org.plan_id)
      .single()
    
    if (planError || !plan) throw new Error('Organization has no active plan assigned')

    const { count: locationCount, error: locationCountError } = await supabaseClient
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', targetOrganizationId)

    if (locationCountError) throw locationCountError

    const billingLocationCount = Math.max(1, locationCount || 0)
    const unitAmountCents = Math.round(Number(plan.price_monthly) * 100)
    const invoiceDescriptionBase = description || `Platform Invoice for ${plan.name} Plan`
    const invoiceDescription = `${invoiceDescriptionBase} - ${billingLocationCount} location(s) at $${Number(plan.price_monthly).toFixed(2)}/location/mo`

    // 1. Create an invoice item for the customer
    await stripe.invoiceItems.create({
      customer: customerId,
      price: plan.stripe_price_id || undefined, // Price is the per-location monthly unit.
      quantity: plan.stripe_price_id ? billingLocationCount : undefined,
      amount: plan.stripe_price_id ? undefined : unitAmountCents * billingLocationCount,
      currency: plan.stripe_price_id ? undefined : 'usd',
      description: invoiceDescription,
      metadata: {
        organization_id: targetOrganizationId,
        plan_id: org.plan_id || '',
        billing_model: 'per_location',
        location_count: String(billingLocationCount),
      },
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
