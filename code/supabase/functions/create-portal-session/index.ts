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

    const { returnUrl } = await req.json();

    // Get the user's organization to find their Stripe customer ID
    // We assume the user profile has an organization_id, and we fetch that org
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
      .select('stripe_customer_id, name')
      .eq('id', profile.organization_id)
      .single();

    let customerId = org?.stripe_customer_id;

    if (!customerId) {
      // Lazy creation of Stripe customer for legacy organizations
      const customer = await stripe.customers.create({
        email: user.email,
        name: org?.name || 'Organization Customer',
        metadata: {
          organization_id: profile.organization_id,
        }
      });
      customerId = customer.id;

      // Update the organization with the new Stripe customer ID
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', profile.organization_id);

      if (updateError) {
        console.error('Failed to update organization with new Stripe customer ID:', updateError);
        // Continue anyway so the user isn't blocked, but log the error
      }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || req.headers.get('origin'),
    });

    return new Response(JSON.stringify({ url: session.url }), {
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
