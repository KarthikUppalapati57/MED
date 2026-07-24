import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import crypto from "node:crypto";
import { sendTransactionalEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function hashOtp(otp: string) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function isProduction() {
  return ["production", "prod"].includes((Deno.env.get("APP_ENV") || Deno.env.get("ENVIRONMENT") || "").toLowerCase());
}

function isDevOtpEchoEnabled() {
  if (!isProduction()) return true;
  return ["true", "1", "yes"].includes((Deno.env.get("VENDOR_ONBOARDING_DEV_OTP_ENABLED") || "").toLowerCase());
}

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

const DEV_OTP_ROLES = new Set(["platform_admin", "tenant_super_admin", "org_manager", "admin", "owner"]);

async function canEchoDevOtp(supabase: ReturnType<typeof createClient>, req: Request, vendorId: string) {
  if (!isDevOtpEchoEnabled()) return false;

  const token = bearerToken(req);
  if (!token) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return false;

  const { data: vendor } = await supabase
    .from("vendors")
    .select("organization_id")
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor?.organization_id) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role === "platform_admin") return true;
  if (profile?.organization_id === vendor.organization_id && DEV_OTP_ROLES.has(profile?.role)) return true;

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", vendor.organization_id)
    .maybeSingle();

  return DEV_OTP_ROLES.has(member?.role);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, payload = {} } = await req.json();

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    if (action === "send-otp") {
      const { vendor_id } = payload;
      if (!vendor_id) return jsonResponse({ error: "Missing vendor_id" }, 400);

      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: expireError } = await supabase
        .from("vendor_otp_challenges")
        .update({ status: "expired" })
        .eq("vendor_id", vendor_id)
        .eq("status", "pending");
      if (expireError) throw expireError;

      const { error: challengeError } = await supabase
        .from("vendor_otp_challenges")
        .insert({
          vendor_id,
          channel: "email",
          otp_hash: otpHash,
          expires_at: expiresAt,
        });
      if (challengeError) throw challengeError;

      const { data: vendorContact, error: contactError } = await supabase
        .from("vendors")
        .select("name, email, contact_name")
        .eq("id", vendor_id)
        .single();
      if (contactError) throw contactError;

      const { error: vendorError } = await supabase
        .from("vendors")
        .update({ onboarding_status: "pending_otp" })
        .eq("id", vendor_id);
      if (vendorError) throw vendorError;

      await supabase.from("vendor_onboarding_events").insert({
        vendor_id,
        event_type: "otp_sent",
        to_status: "pending_otp",
        actor_type: "system",
      });

      if (vendorContact?.email) {
        await sendTransactionalEmail({
          to: vendorContact.email,
          subject: "Your vendor onboarding verification code",
          text: `Hi ${vendorContact.contact_name || vendorContact.name || "there"},\n\nYour vendor onboarding verification code is ${otp}. It expires in 10 minutes.\n\nRestops Platform`,
        });
      }

      const response: Record<string, unknown> = { message: "OTP generated" };
      if (await canEchoDevOtp(supabase, req, vendor_id)) response.devOtp = otp;
      return jsonResponse(response);
    }

    if (action === "verify-otp") {
      const { vendor_id, otp } = payload;
      if (!vendor_id || !otp) return jsonResponse({ error: "Missing vendor_id or otp" }, 400);

      const { data: challenge, error: fetchError } = await supabase
        .from("vendor_otp_challenges")
        .select("id, otp_hash, expires_at, attempt_count, max_attempts")
        .eq("vendor_id", vendor_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!challenge) return jsonResponse({ error: "OTP not found" }, 400);

      if (new Date(challenge.expires_at) < new Date()) {
        await supabase.from("vendor_otp_challenges").update({ status: "expired" }).eq("id", challenge.id);
        return jsonResponse({ error: "OTP expired" }, 400);
      }

      const inputHash = hashOtp(String(otp));
      if (inputHash !== challenge.otp_hash) {
        const attempts = Number(challenge.attempt_count ?? 0) + 1;
        await supabase
          .from("vendor_otp_challenges")
          .update({
            attempt_count: attempts,
            status: attempts >= Number(challenge.max_attempts ?? 5) ? "failed_max_attempts" : "pending",
          })
          .eq("id", challenge.id);
        return jsonResponse({ error: "Invalid OTP" }, 400);
      }

      const { error: challengeUpdateError } = await supabase
        .from("vendor_otp_challenges")
        .update({ status: "verified", verified_at: new Date().toISOString() })
        .eq("id", challenge.id);
      if (challengeUpdateError) throw challengeUpdateError;

      const { error: vendorError } = await supabase
        .from("vendors")
        .update({ onboarding_status: "otp_verified" })
        .eq("id", vendor_id);
      if (vendorError) throw vendorError;

      await supabase.from("vendor_onboarding_events").insert({
        vendor_id,
        event_type: "otp_verified",
        to_status: "otp_verified",
        actor_type: "system",
      });

      return jsonResponse({ success: true });
    }

    if (action === "send-magic-link") {
      const { vendor_id, type } = payload;
      if (!vendor_id || !type) return jsonResponse({ error: "Missing vendor_id or type" }, 400);

      // Fail before issuing a token (which cancels any prior pending one) rather than silently
      // emailing a real vendor a link to someone's localhost -- PUBLIC_APP_URL is an edge
      // function secret (supabase secrets set), never inherited from the frontend's VITE_APP_URL.
      const baseUrl = Deno.env.get("PUBLIC_APP_URL");
      if (!baseUrl && isProduction()) {
        throw new Error("PUBLIC_APP_URL is not configured in this environment's Supabase secrets.");
      }

      let linkResult;
      if (type === "tax" || type === "documents") {
        const { data, error } = await supabase.rpc("issue_vendor_link_token", {
          p_vendor_id: vendor_id,
          p_link_type: type,
        });
        if (error) throw error;
        linkResult = data;
      } else if (type === "bank") {
        const { data, error } = await supabase.rpc("issue_vendor_banking_link", {
          p_vendor_id: vendor_id,
          p_intent: payload.intent ?? "add",
        });
        if (error) throw error;
        linkResult = data;
      } else {
        return jsonResponse({ error: "Invalid magic link type" }, 400);
      }

      const token = linkResult?.token;
      const routeType = type === "documents" ? "tax" : type;
      const magicLinkUrl = `${baseUrl || "http://localhost:5173"}/vendor-onboarding/${routeType}/${token}`;

      const { data: vendorContact, error: contactError } = await supabase
        .from("vendors")
        .select("name, email, contact_name")
        .eq("id", vendor_id)
        .single();
      if (contactError) throw contactError;

      if (vendorContact?.email) {
        const label = type === "bank" ? "banking details" : type === "documents" ? "documents" : "tax information and W-9";
        await sendTransactionalEmail({
          to: vendorContact.email,
          subject: `Secure vendor onboarding request: ${label}`,
          text: `Hi ${vendorContact.contact_name || vendorContact.name || "there"},\n\nPlease use this secure link to submit your ${label}:\n${magicLinkUrl}\n\nThis link expires automatically.\n\nRestops Platform`,
        });
      }

      const response: Record<string, unknown> = { message: "Magic link sent", link: linkResult };
      if (!isProduction()) {
        response.magicLinkUrl = magicLinkUrl;
        response.token = token;
      }
      return jsonResponse(response);
    }

    if (action === "submit-tax-info") {
      const { token, tax_id, w9_document_path, legal_name, tax_classification, tax_id_type } = payload;
      if (!token || !tax_id || !w9_document_path) {
        return jsonResponse({ error: "Missing token, tax_id, or W9 document" }, 400);
      }

      // Atomically claim the token before doing any work: a plain SELECT-then-update lets two
      // concurrent submits both pass the pending-check and both insert documents/tax rows before
      // either marks it used (unlike submit_vendor_banking_via_link, which locks the row). This
      // UPDATE...WHERE status='pending' can only ever match once across concurrent callers, so
      // only one request proceeds past this point -- any later failure requires a re-issued link,
      // same as an already-used token today.
      const { data: link, error: linkError } = await supabase
        .from("vendor_link_tokens")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("token", token)
        .eq("link_type", "tax")
        .eq("status", "pending")
        .is("deleted_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id, vendor_id, organization_id, brand_id, location_id")
        .maybeSingle();

      if (linkError) throw linkError;
      if (!link) {
        return jsonResponse({ error: "Invalid or expired token" }, 400);
      }

      const digits = String(tax_id).replace(/\D/g, "");
      const inferredType = tax_id_type || (digits.length === 9 && String(tax_id).includes("-") && String(tax_id).indexOf("-") === 2 ? "ein" : "ssn");
      const fileName = String(w9_document_path).split("/").pop() || "w9.pdf";

      const { data: documentRow, error: docError } = await supabase
        .from("vendor_documents")
        .insert({
          vendor_id: link.vendor_id,
          document_type: "w9",
          file_name: fileName,
          storage_path: w9_document_path,
          mime_type: "application/pdf",
          status: "pending_review",
          uploaded_via: "vendor_magic_link",
        })
        .select("id")
        .single();
      if (docError) throw docError;

      const { data: taxRow, error: taxError } = await supabase
        .from("vendor_tax_information")
        .insert({
          vendor_id: link.vendor_id,
          legal_name: legal_name ?? null,
          tax_classification: tax_classification ?? null,
          tax_id_type: inferredType,
          verification_status: "pending",
          w9_status: "received",
          w9_document_id: documentRow.id,
        })
        .select("id")
        .single();
      if (taxError) throw taxError;

      const { error: secretError } = await supabase.rpc("store_vendor_tax_secret", {
        p_tax_row_id: taxRow.id,
        p_tax_id: tax_id,
      });
      if (secretError) throw secretError;

      const { error: vendorError } = await supabase
        .from("vendors")
        .update({ onboarding_status: "tax_submitted" })
        .eq("id", link.vendor_id);
      if (vendorError) throw vendorError;

      await supabase.from("vendor_onboarding_events").insert({
        vendor_id: link.vendor_id,
        event_type: "tax_submitted",
        to_status: "tax_submitted",
        actor_type: "vendor",
        metadata: { tax_row_id: taxRow.id, document_id: documentRow.id, token_id: link.id },
      });

      return jsonResponse({ success: true, tax_row_id: taxRow.id, document_id: documentRow.id });
    }

    if (action === "submit-bank-info") {
      const { token, bank_details } = payload;
      if (!token || !bank_details?.accountNumber || !bank_details?.routingNumber) {
        return jsonResponse({ error: "Missing token or bank details" }, 400);
      }

      const { data, error } = await supabase.rpc("submit_vendor_banking_via_link", {
        p_token: token,
        p_account: bank_details.accountNumber,
        p_routing: bank_details.routingNumber,
      });
      if (error) throw error;

      // Also store the vendor receiving account in the provider-neutral bank vault.
      // This keeps Restops as the source of truth even when the active ACH provider changes.
      try {
        const { data: vendor } = await supabase
          .from("vendors")
          .select("id, organization_id, brand_id, location_id, name, contact_name")
          .eq("id", data.vendor_id)
          .maybeSingle();

        if (vendor) {
          const accountNumber = String(bank_details.accountNumber).replace(/\D/g, "");
          const routingNumber = String(bank_details.routingNumber).replace(/\D/g, "");
          const fingerprintHash = crypto
            .createHash("sha256")
            .update(`${routingNumber}:${accountNumber}`)
            .digest("hex");

          const { data: bankAccount, error: bankAccountError } = await supabase
            .from("bank_accounts")
            .insert({
              organization_id: vendor.organization_id,
              brand_id: vendor.brand_id ?? null,
              location_id: vendor.location_id ?? null,
              owner_type: "vendor",
              owner_id: vendor.id,
              purpose: "vendor_receiving",
              nickname: `${vendor.name || "Vendor"} receiving account`,
              account_holder_name: vendor.contact_name || vendor.name,
              bank_name: bank_details.bankName || null,
              account_type: bank_details.accountType || "checking",
              routing_last4: routingNumber.slice(-4),
              account_last4: accountNumber.slice(-4),
              fingerprint_hash: fingerprintHash,
              default_for_owner: true,
              verification_status: "pending",
              metadata: { source: "vendor_magic_link", legacy_vendor_banking_row_id: data.banking_row_id },
            })
            .select("id")
            .single();

          if (bankAccountError) throw bankAccountError;

          const { error: secretError } = await supabase.rpc("store_bank_account_secret", {
            p_bank_account_id: bankAccount.id,
            p_account_number: accountNumber,
            p_routing_number: routingNumber,
            p_fingerprint_hash: fingerprintHash,
          });
          if (secretError) throw secretError;
        }
      } catch (vaultError) {
        console.error("Non-fatal: provider-neutral vendor bank vault write failed:", vaultError);
      }

      return jsonResponse({ success: true, ...data });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Function error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

