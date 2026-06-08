// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serve as serveInngest } from "npm:inngest/deno";
import { inngest } from "../_shared/inngest.ts";
import { demoRequestedWorkflow } from "./functions/demoRequested.ts";
import { invoiceProcessedWorkflow } from "./functions/invoiceProcessed.ts";
import { corsHeaders } from "../_shared/cors.ts";

const handler = serveInngest({
  client: inngest,
  functions: [
    demoRequestedWorkflow,
    invoiceProcessedWorkflow,
  ],
  // By default, Inngest looks for a POST/PUT/GET. Supabase Edge Functions pass the req through.
});

serve(async (req) => {
  // Handle CORS for browser requests (though Inngest usually hits this directly)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const res = await handler(req);
    // Add CORS headers to the response
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.headers.set(key, value);
    }
    return res;
  } catch (err: any) {
    console.error("Inngest handler error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
