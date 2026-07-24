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

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function generateOtp() {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
}

async function hashOtp(otp: string) {
  const bytes = new TextEncoder().encode(otp);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isProduction() {
  return ["production", "prod"].includes((Deno.env.get("APP_ENV") || Deno.env.get("ENVIRONMENT") || "").toLowerCase());
}

function canEchoDevOtp() {
  if (!isProduction()) return true;
  return ["true", "1", "yes"].includes((Deno.env.get("ONBOARDING_CONTACT_DEV_OTP_ENABLED") || "").toLowerCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = bearerToken(req);
    if (!token) return jsonResponse({ error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return jsonResponse({ error: "Authentication required" }, 401);

    const { action, payload = {} } = await req.json();

    if (action === "send-email-otp") {
      const target = normalizeEmail(payload.target);
      if (!target || !target.includes("@")) {
        return jsonResponse({ error: "A valid email address is required" }, 400);
      }

      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from("onboarding_contact_otps")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("channel", "email")
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 5) {
        return jsonResponse({ error: "Too many OTP requests. Please wait before requesting another code" }, 429);
      }

      const otp = String(generateOtp()).padStart(6, "0");
      const otpHash = await hashOtp(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: expireError } = await supabase
        .from("onboarding_contact_otps")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("channel", "email")
        .eq("status", "pending");
      if (expireError) throw expireError;

      const { data: challenge, error: challengeError } = await supabase
        .from("onboarding_contact_otps")
        .insert({
          user_id: userId,
          channel: "email",
          target,
          code_hash: otpHash,
          expires_at: expiresAt,
          provider: "resend",
          metadata: { delivery_mode: "resend" },
        })
        .select("id")
        .single();
      if (challengeError) throw challengeError;

      await sendTransactionalEmail({
        to: target,
        subject: "Your RestOps business verification code",
        text: `Your RestOps business verification code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
      });

      const response: Record<string, unknown> = {
        success: true,
        otp_id: challenge.id,
        channel: "email",
        target,
        provider: "resend",
        expires_at: expiresAt,
      };
      if (canEchoDevOtp()) response.dev_code = otp;
      return jsonResponse(response);
    }

    if (action === "verify-email-otp") {
      const otpId = String(payload.otp_id || "");
      const code = String(payload.code || "").trim();
      if (!otpId || code.length !== 6) {
        return jsonResponse({ error: "A valid OTP request and 6-digit code are required" }, 400);
      }

      const { data: challenge, error: fetchError } = await supabase
        .from("onboarding_contact_otps")
        .select("id, channel, target, code_hash, expires_at, attempts, max_attempts, status")
        .eq("id", otpId)
        .eq("user_id", userId)
        .eq("channel", "email")
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!challenge) return jsonResponse({ error: "OTP request not found" }, 404);
      if (challenge.status === "verified") {
        return jsonResponse({ success: true, channel: "email", target: challenge.target, already_verified: true });
      }
      if (challenge.status !== "pending") {
        return jsonResponse({ error: "OTP request is no longer active" }, 400);
      }
      if (new Date(challenge.expires_at) < new Date()) {
        await supabase.from("onboarding_contact_otps").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", challenge.id);
        return jsonResponse({ error: "OTP code expired" }, 400);
      }
      if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || 5)) {
        await supabase.from("onboarding_contact_otps").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", challenge.id);
        return jsonResponse({ error: "Too many incorrect OTP attempts" }, 400);
      }

      const inputHash = await hashOtp(code);
      if (inputHash !== challenge.code_hash) {
        const attempts = Number(challenge.attempts || 0) + 1;
        await supabase
          .from("onboarding_contact_otps")
          .update({
            attempts,
            status: attempts >= Number(challenge.max_attempts || 5) ? "failed" : "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", challenge.id);
        return jsonResponse({ error: "Invalid OTP code" }, 400);
      }

      const verifiedAt = new Date().toISOString();
      const { error: challengeUpdateError } = await supabase
        .from("onboarding_contact_otps")
        .update({ status: "verified", verified_at: verifiedAt, updated_at: verifiedAt })
        .eq("id", challenge.id);
      if (challengeUpdateError) throw challengeUpdateError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ business_email: challenge.target, business_email_verified_at: verifiedAt, updated_at: verifiedAt })
        .eq("id", userId);
      if (profileError) throw profileError;

      return jsonResponse({
        success: true,
        channel: "email",
        target: challenge.target,
        verified_at: verifiedAt,
        provider: "resend",
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("onboarding-contact-otp error:", error);
    return jsonResponse({ error: error.message || "OTP request failed" }, 500);
  }
});
