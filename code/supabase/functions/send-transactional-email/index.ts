import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";

// Generic authenticated relay for the frontend's emailService.js. Any Resend-backed template
// email (invitations, invoice status, business verification decisions, the AI email drafter,
// etc.) funnels through here instead of talking to Resend directly, since a browser can't hold
// the Resend API key. Requires a real logged-in user (manual check, not the config.toml
// verify_jwt gate -- every function in this project does its own check, since verify_jwt=true
// would also block the service-role/pg_net callers other functions need).
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = bearerToken(req);
    if (!token) return jsonResponse({ success: false, error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return jsonResponse({ success: false, error: "Authentication required" }, 401);
    }

    const { to_email, cc, subject, message } = await req.json();

    if (!to_email || typeof to_email !== "string") {
      return jsonResponse({ success: false, error: "to_email is required" }, 400);
    }
    if (!subject || !message) {
      return jsonResponse({ success: false, error: "subject and message are required" }, 400);
    }

    await sendTransactionalEmail({ to: to_email, cc, subject, text: message });

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("send-transactional-email error:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
