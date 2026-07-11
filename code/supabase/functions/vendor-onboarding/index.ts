import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import crypto from "node:crypto";

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

      const otp = "123456";
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

      console.log(`[DEV ONLY] OTP for vendor ${vendor_id} is ${otp}`);
      return jsonResponse({ message: "OTP generated", devOtp: otp });
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
      const baseUrl = Deno.env.get("PUBLIC_APP_URL") || "http://localhost:5173";
      const magicLinkUrl = `${baseUrl}/vendor-onboarding/${routeType}/${token}`;
      console.log(`[DEV ONLY] Magic Link for ${type}: ${magicLinkUrl}`);

      return jsonResponse({ message: "Magic link sent", magicLinkUrl, token, link: linkResult });
    }

    if (action === "submit-tax-info") {
      const { token, tax_id, w9_document_path, legal_name, tax_classification, tax_id_type } = payload;
      if (!token || !tax_id || !w9_document_path) {
        return jsonResponse({ error: "Missing token, tax_id, or W9 document" }, 400);
      }

      const { data: link, error: linkError } = await supabase
        .from("vendor_link_tokens")
        .select("id, vendor_id, organization_id, brand_id, location_id, status, expires_at")
        .eq("token", token)
        .eq("link_type", "tax")
        .eq("status", "pending")
        .is("deleted_at", null)
        .maybeSingle();

      if (linkError) throw linkError;
      if (!link || new Date(link.expires_at) < new Date()) {
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

      const { error: linkUpdateError } = await supabase
        .from("vendor_link_tokens")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", link.id);
      if (linkUpdateError) throw linkUpdateError;

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

      return jsonResponse({ success: true, ...data });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Function error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});