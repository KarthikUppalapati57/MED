import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import crypto from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple encryption using a secret key
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || crypto.randomBytes(32).toString('hex'); // 32 bytes for AES-256
const IV_LENGTH = 16;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
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

    const { action, payload } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), { status: 400, headers: corsHeaders });
    }

    if (action === "send-otp") {
      const { vendor_id } = payload;
      // Generate OTP: Dev mode uses "123456" or random 6-digit
      const otp = "123456"; // DEV OTP
      
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      const { error } = await supabase
        .from('vendors')
        .update({ 
          otp_hash: otpHash, 
          otp_expires_at: expiresAt.toISOString(),
          onboarding_status: 'pending_otp'
        })
        .eq('id', vendor_id);

      if (error) throw error;
      
      console.log(`[DEV ONLY] OTP for vendor ${vendor_id} is ${otp}`);
      
      return new Response(JSON.stringify({ message: "OTP generated", devOtp: otp }), { headers: corsHeaders, status: 200 });
    }

    if (action === "verify-otp") {
      const { vendor_id, otp } = payload;
      
      const { data: vendor, error: fetchError } = await supabase
        .from('vendors')
        .select('otp_hash, otp_expires_at')
        .eq('id', vendor_id)
        .single();

      if (fetchError || !vendor) throw fetchError || new Error("Vendor not found");

      if (new Date(vendor.otp_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "OTP expired" }), { status: 400, headers: corsHeaders });
      }

      const inputHash = crypto.createHash('sha256').update(otp).digest('hex');
      if (inputHash !== vendor.otp_hash) {
        return new Response(JSON.stringify({ error: "Invalid OTP" }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await supabase
        .from('vendors')
        .update({ 
          otp_hash: null, 
          otp_expires_at: null,
          onboarding_status: 'pending_tax'
        })
        .eq('id', vendor_id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders, status: 200 });
    }

    if (action === "send-magic-link") {
      const { vendor_id, type } = payload; // type = 'tax' or 'bank'
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hr expiry

      const updates: any = {};
      if (type === 'tax') {
        updates.tax_magic_link_token = token;
        updates.tax_magic_link_expires_at = expiresAt.toISOString();
      } else if (type === 'bank') {
        updates.bank_magic_link_token = token;
        updates.bank_magic_link_expires_at = expiresAt.toISOString();
      } else {
        return new Response(JSON.stringify({ error: "Invalid magic link type" }), { status: 400, headers: corsHeaders });
      }

      const { error } = await supabase.from('vendors').update(updates).eq('id', vendor_id);
      if (error) throw error;

      // In a real app, send email with the token. Here we just log it.
      const baseUrl = Deno.env.get("PUBLIC_APP_URL") || "http://localhost:5173";
      const magicLinkUrl = `${baseUrl}/vendor-onboarding/${type}/${token}`;
      console.log(`[DEV ONLY] Magic Link for ${type}: ${magicLinkUrl}`);

      return new Response(JSON.stringify({ message: "Magic link sent", magicLinkUrl }), { headers: corsHeaders, status: 200 });
    }

    if (action === "submit-tax-info") {
      const { token, tax_id, w9_document_path } = payload;

      const { data: vendor, error: fetchError } = await supabase
        .from('vendors')
        .select('id, tax_magic_link_expires_at')
        .eq('tax_magic_link_token', token)
        .single();

      if (fetchError || !vendor) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: corsHeaders });
      }

      if (new Date(vendor.tax_magic_link_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Token expired" }), { status: 400, headers: corsHeaders });
      }

      const encryptedTaxId = tax_id ? encrypt(tax_id) : null;

      const { error: taxError } = await supabase
        .from('vendor_tax_details')
        .insert({
          vendor_id: vendor.id,
          encrypted_tax_id: encryptedTaxId,
          w9_document_path: w9_document_path
        });

      if (taxError) throw taxError;

      await supabase
        .from('vendors')
        .update({ 
          tax_magic_link_token: null, 
          tax_magic_link_expires_at: null,
          onboarding_status: 'pending_bank'
        })
        .eq('id', vendor.id);

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders, status: 200 });
    }

    if (action === "submit-bank-info") {
      const { token, bank_details } = payload;

      const { data: vendor, error: fetchError } = await supabase
        .from('vendors')
        .select('id, bank_magic_link_expires_at')
        .eq('bank_magic_link_token', token)
        .single();

      if (fetchError || !vendor) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: corsHeaders });
      }

      if (new Date(vendor.bank_magic_link_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Token expired" }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await supabase
        .from('vendors')
        .update({ 
          bank_details,
          bank_magic_link_token: null,
          bank_magic_link_expires_at: null,
          onboarding_status: 'completed'
        })
        .eq('id', vendor.id);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders, status: 200 });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
