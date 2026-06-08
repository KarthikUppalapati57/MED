// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serve as serveInngest } from "npm:inngest/deno";
import { inngest } from "../_shared/inngest.ts";

// Import all functions
import * as billing from "./functions/billing.ts";
import * as onboarding from "./functions/onboarding.ts";
import * as invoices from "./functions/invoices.ts";
import * as team from "./functions/team.ts";

const functions = [
  ...Object.values(billing),
  ...Object.values(onboarding),
  ...Object.values(invoices),
  ...Object.values(team),
];

const handler = serveInngest({
  client: inngest,
  functions,
});

serve(async (req) => {
  const url = new URL(req.url);
  
  if (url.pathname === '/functions/v1/inngest') {
    return await handler(req);
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { 
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
});
