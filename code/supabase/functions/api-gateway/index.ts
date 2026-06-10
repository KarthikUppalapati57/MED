import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { encodeHex } from "https://deno.land/std@0.168.0/encoding/hex.ts"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Basic CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    const apiKey = authHeader.replace('Bearer ', '').trim();
    const keyHash = await hashKey(apiKey);

    // Validate key
    const { data: keyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('id, organization_id')
      .eq('key_hash', keyHash)
      .single();

    if (keyError || !keyRecord) {
      return new Response(JSON.stringify({ error: 'Invalid API Key' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // Update last_used_at
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRecord.id);

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Expected path: /api/v1/orders -> ['api', 'v1', 'orders']
    // Or in edge functions, the path might be just /orders if it's mounted at api-gateway
    // Supabase edge functions usually have path like /functions/v1/api-gateway/orders
    
    // Find the resource after 'api-gateway'
    const gatewayIndex = pathParts.indexOf('api-gateway');
    const resource = gatewayIndex >= 0 && pathParts.length > gatewayIndex + 1 ? pathParts[gatewayIndex + 1] : null;
    const resourceId = gatewayIndex >= 0 && pathParts.length > gatewayIndex + 2 ? pathParts[gatewayIndex + 2] : null;

    if (!resource) {
      return new Response(JSON.stringify({ error: 'Resource not specified' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // List of allowed resources
    const allowedResources = ['orders', 'customers', 'reservations', 'inventory', 'profiles', 'employees', 'invoices'];
    if (!allowedResources.includes(resource)) {
      return new Response(JSON.stringify({ error: 'Resource not found or not permitted' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // Only GET requests supported in V1 for data access
    if (req.method === 'GET') {
      let query = supabase.from(resource).select('*').eq('organization_id', keyRecord.organization_id);
      
      if (resourceId) {
        query = query.eq('id', resourceId).single();
      } else {
        // Handle pagination
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error } = await query;
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }

      return new Response(JSON.stringify({ data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});
