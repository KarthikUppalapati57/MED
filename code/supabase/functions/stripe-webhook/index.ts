import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { stripe } from '../_shared/stripe.ts';
import { getSupabaseServiceRoleClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Server-side PostHog capture
async function capturePostHogEvent(eventName: string, properties: any) {
  const posthogKey = Deno.env.get('VITE_POSTHOG_KEY') || 'phc_RkH0WqQ3A6v7P4mE0lV9iO5jD7zY0kQ8wZ9mK4lP5n'; // Use a default or read from env
  const posthogHost = Deno.env.get('VITE_POSTHOG_HOST') || 'https://us.i.posthog.com';

  try {
    await fetch(`${posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: posthogKey,
        event: eventName,
        properties: {
          distinct_id: properties.org_id || properties.customer_id || 'stripe_webhook',
          ...properties,
        },
      }),
    });
  } catch (err) {
    console.error('Failed to capture PostHog event:', err);
  }
}

// Webhook handling logic
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('No signature', { status: 400, headers: corsHeaders });
    }

    const body = await req.text();
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!endpointSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(`Webhook Error: ${err.message}`, { status: 400, headers: corsHeaders });
    }

    const supabase = getSupabaseServiceRoleClient();
    console.log(`Processing event type: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.client_reference_id; // Passed when creating the session
        if (orgId && session.customer && session.subscription) {
          // Link customer and subscription to the org
          await supabase
            .from('organizations')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              subscription_status: 'active'
            })
            .eq('id', orgId);
            
          await capturePostHogEvent('billing_subscription_created', {
            org_id: orgId,
            customer_id: session.customer,
            subscription_id: session.subscription
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        
        // Find org by customer ID and update status
        await supabase
          .from('organizations')
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            plan_id: subscription.items.data[0]?.price.id
          })
          .eq('stripe_customer_id', customerId);
          
        await capturePostHogEvent('billing_subscription_updated', {
          customer_id: customerId,
          subscription_id: subscription.id,
          status: subscription.status,
          plan_id: subscription.items.data[0]?.price.id
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        
        await supabase
          .from('organizations')
          .update({
            subscription_status: 'canceled',
            plan_id: null
          })
          .eq('stripe_customer_id', customerId);
          
        await capturePostHogEvent('billing_subscription_canceled', {
          customer_id: customerId,
          subscription_id: subscription.id
        });
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
           // Optionally record the payment in your payments table
           await capturePostHogEvent('billing_payment_succeeded', {
             customer_id: invoice.customer,
             invoice_id: invoice.id,
             amount_paid: invoice.amount_paid
           });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;
        
        await supabase
          .from('organizations')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId);
          
        await capturePostHogEvent('billing_payment_failed', {
          customer_id: customerId,
          invoice_id: invoice.id,
          amount_due: invoice.amount_due
        });
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error(`Webhook error: ${err.message}`);
    return new Response(`Internal Server Error: ${err.message}`, { 
      status: 500,
      headers: corsHeaders 
    });
  }
});
