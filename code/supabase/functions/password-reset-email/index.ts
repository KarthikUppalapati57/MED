import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function configuredAppUrl() {
  return Deno.env.get("PUBLIC_APP_URL")
    || Deno.env.get("APP_BASE_URL")
    || Deno.env.get("VITE_APP_BASE_URL")
    || Deno.env.get("VITE_APP_URL")
    || Deno.env.get("APP_URL")
    || Deno.env.get("SITE_URL")
    || Deno.env.get("PUBLIC_SITE_URL")
    || "";
}

function passwordRecoveryUrl(req: Request, requestedRedirectTo: unknown) {
  const fallbackOrigin = configuredAppUrl() || req.headers.get("Origin") || "";
  const fallback = fallbackOrigin
    ? `${fallbackOrigin.replace(/\/$/, "")}/update-password?type=recovery`
    : "";
  const candidate = String(requestedRedirectTo || fallback).trim();

  if (!candidate) return "";

  const candidateUrl = new URL(candidate);
  const allowedOrigin = configuredAppUrl()
    ? new URL(configuredAppUrl()).origin
    : new URL(fallback).origin;

  if (candidateUrl.origin !== allowedOrigin) {
    throw new Error("Password reset redirect origin is not allowed");
  }

  return candidateUrl.toString();
}

function resetEmailText(actionLink: string) {
  return [
    "We received a request to reset your RestOps password.",
    "",
    "Open this secure link to choose a new password:",
    actionLink,
    "",
    "This link expires shortly. If you did not request this reset, you can ignore this email.",
    "",
    "RestOps Security",
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { email: rawEmail, redirectTo: rawRedirectTo } = await req.json();
    const email = normalizeEmail(rawEmail);

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "A valid email address is required" }, 400);
    }

    const redirectTo = passwordRecoveryUrl(req, rawRedirectTo);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    const actionLink = data?.properties?.action_link;
    if (error || !actionLink) {
      console.warn("password-reset-email generateLink skipped:", {
        email,
        message: error?.message || "No recovery action link returned",
      });
      return jsonResponse({ success: true, provider: "resend" });
    }

    await sendTransactionalEmail({
      to: email,
      subject: "Reset your RestOps password",
      text: resetEmailText(actionLink),
    });

    return jsonResponse({ success: true, provider: "resend" });
  } catch (error) {
    console.error("password-reset-email error:", error);
    return jsonResponse({ error: error.message || "Password reset email failed" }, 500);
  }
});
