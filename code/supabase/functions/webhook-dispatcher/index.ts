import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { corsHeaders } from "../_shared/cors.ts"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function generateHmacSha256(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { data: events, error: fetchError } = await supabase
      .from('webhook_events_queue')
      .select('*, webhook_endpoints(*)')
      .in('status', ['pending', 'failed'])
      .lte('next_retry_at', new Date().toISOString())
      .limit(50);

    if (fetchError) throw fetchError;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ message: "No events to process" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const results = [];

    for (const event of events) {
      const endpoint = event.webhook_endpoints;
      if (!endpoint || endpoint.status !== 'active') {
        await supabase.from('webhook_events_queue').update({ status: 'failed' }).eq('id', event.id);
        continue;
      }

      const payloadString = JSON.stringify(event.payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      const signaturePayload = `${event.id}.${timestamp}.${payloadString}`;
      let signature = '';
      try {
        signature = await generateHmacSha256(endpoint.secret, signaturePayload);
      } catch (err) {
        console.error("HMAC Error:", err);
      }

      let responseCode = null;
      let responseBody = '';
      let isSuccess = false;

      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-ID': event.id,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
            'User-Agent': 'Restops-Webhook-Dispatcher/1.0'
          },
          body: payloadString,
          signal: AbortSignal.timeout(10000)
        });
        
        responseCode = res.status;
        responseBody = await res.text().catch(() => '');
        isSuccess = res.ok;
      } catch (err: any) {
        responseBody = err.message || 'Connection failed';
      }

      await supabase.from('webhook_delivery_logs').insert({
        event_id: event.id,
        endpoint_id: endpoint.id,
        status: isSuccess ? 'success' : 'failed',
        response_code: responseCode,
        response_body: responseBody.substring(0, 1000)
      });

      if (isSuccess) {
        await supabase.from('webhook_events_queue').update({ status: 'success' }).eq('id', event.id);
      } else {
        const newRetryCount = event.retry_count + 1;
        if (newRetryCount >= 6) {
          await supabase.from('webhook_events_queue').update({ status: 'failed', retry_count: newRetryCount }).eq('id', event.id);
        } else {
          const delaysMinutes = [1, 5, 15, 60, 360];
          const delay = delaysMinutes[newRetryCount - 1] || 360;
          const nextRetryAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
          
          await supabase.from('webhook_events_queue').update({ 
            status: 'failed', 
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt
          }).eq('id', event.id);
        }
      }

      results.push({ id: event.id, success: isSuccess });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
