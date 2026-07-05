import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isNonEmptyDigits(value: unknown) {
  return typeof value === "string" && /\d/.test(value.replace(/\D/g, ""));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { token, account, routing } = await req.json();

    if (typeof token !== "string" || token.trim() === "") {
      return json({ error: "Invalid banking submission" }, 400);
    }

    if (!isNonEmptyDigits(account) || !isNonEmptyDigits(routing)) {
      return json({ error: "Invalid banking submission" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    // Ponytail: public HTTPS endpoint, single-use 7-day crypto-random token,
    // but no per-IP rate limit or attempt cap yet. Upgrade path: add rate
    // limiting / max attempts like the onboarding OTP pattern if abuse appears.
    const { data, error } = await supabase.rpc("submit_vendor_banking_via_link", {
      p_token: token.trim(),
      p_account: account,
      p_routing: routing,
    });

    if (error) {
      console.warn("Vendor banking link submit failed", error.message);
      return json({ error: "Invalid or expired banking link" }, 400);
    }

    return json({
      success: true,
      banking_row_id: data?.banking_row_id,
      account_last4: data?.account_last4,
    });
  } catch (error) {
    console.warn("Vendor banking submit exception", error);
    return json({ error: "Invalid banking submission" }, 400);
  }
});
