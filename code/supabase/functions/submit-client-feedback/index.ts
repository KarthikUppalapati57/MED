// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeFeedbackType = (value: string) => {
  const type = String(value || "").trim().toLowerCase();
  if (type !== "issue" && type !== "suggestion") throw new Error("type must be issue or suggestion");
  return type;
};

const formatList = (value: string[] = []) => value.filter(Boolean).join(", ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Missing Supabase function configuration");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult?.user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json();
    const type = normalizeFeedbackType(payload.type);
    const subject = String(payload.subject || "").trim();
    const message = String(payload.message || "").trim();
    const priority = String(payload.priority || "").trim() || null;

    if (!subject || subject.length < 4) return json({ error: "Subject is required" }, 400);
    if (!message || message.length < 10) return json({ error: "Message must include at least 10 characters" }, 400);

    const { data: settings, error: settingsError } = await adminClient
      .from("platform_feedback_settings")
      .select("issue_to, issue_cc, suggestion_to, suggestion_cc")
      .eq("id", true)
      .single();
    if (settingsError) throw settingsError;

    const to = type === "issue" ? settings.issue_to : settings.suggestion_to;
    const cc = type === "issue" ? settings.issue_cc : settings.suggestion_cc;
    if (!Array.isArray(to) || to.length === 0) throw new Error(`${type} recipient settings are not configured`);

    const user = userResult.user;
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, email, organization_id, organizations:organization_id(name)")
      .eq("id", user.id)
      .maybeSingle();

    const userEmail = profile?.email || user.email || "";
    const userName = profile?.full_name || userEmail.split("@")[0] || "Client";
    const organizationName = profile?.organizations?.name || null;

    const { data: submission, error: insertError } = await adminClient
      .from("client_feedback_submissions")
      .insert({
        type,
        subject,
        message,
        priority,
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        organization_id: profile?.organization_id || null,
        organization_name: organizationName,
        email_to: to,
        email_cc: cc || [],
      })
      .select("id, created_at")
      .single();
    if (insertError) throw insertError;

    const label = type === "issue" ? "Issue" : "Suggestion";
    const text = `
New ${label} submitted from Restops

Subject: ${subject}
Priority: ${priority || "Not specified"}

Client
Name: ${userName}
Email: ${userEmail || "Not available"}
Organization: ${organizationName || "Not available"}

Message
${message}

Submission ID: ${submission.id}
Submitted at: ${submission.created_at}
Recipients
To: ${formatList(to)}
CC: ${formatList(cc)}
    `.trim();

    try {
      await sendTransactionalEmail({
        to,
        cc,
        subject: `[Restops ${label}] ${subject}`,
        text,
      });

      await adminClient
        .from("client_feedback_submissions")
        .update({ status: "emailed", email_sent: true, email_error: null })
        .eq("id", submission.id);
    } catch (emailError) {
      await adminClient
        .from("client_feedback_submissions")
        .update({ status: "email_failed", email_sent: false, email_error: emailError.message })
        .eq("id", submission.id);
      throw emailError;
    }

    return json({ success: true, id: submission.id });
  } catch (error) {
    console.error("submit-client-feedback error:", error);
    return json({ error: error.message || "Failed to submit feedback" }, 500);
  }
});
