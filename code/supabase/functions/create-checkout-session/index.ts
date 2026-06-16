import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe } from '../_shared/stripe.ts';
import { getSupabaseClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { priceId, successUrl, cancelUrl } = await req.json();

    if (!priceId) {
       throw new Error('priceId is required');
    }

    // Get organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      throw new Error('User does not belong to an organization');
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_customer_id, primary_contact_email')
      .eq('id', profile.organization_id)
      .single();

    let customerId = org?.stripe_customer_id;

    // Create a new customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org?.primary_contact_email || user.email,
        metadata: {
          organization_id: profile.organization_id
        }
      });
      customerId = customer.id;

      // Note: we update the organizations table here to save the new customer ID
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', profile.organization_id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || req.headers.get('origin'),
      cancel_url: cancelUrl || req.headers.get('origin'),
      client_reference_id: profile.organization_id, // Important: binds session to org
    });

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
