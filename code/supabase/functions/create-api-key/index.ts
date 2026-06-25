import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const ROLE_LEVEL: Record<string, number> = {
  ground_staff: 0,
  location_manager: 1,
  manager: 2,
  branch_manager: 2,
  org_owner: 3,
  owner: 3,
  platform_admin: 4,
  admin: 4,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { name, organization_id } = await req.json();
    const keyName = String(name || "").trim();
    if (!keyName) return json({ error: "API key name is required" }, 400);
    if (!organization_id) return json({ error: "organization_id is required" }, 400);

    const { data: membership, error: memberError } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", authData.user.id)
      .single();

    const appRole = String(authData.user.app_metadata?.role || "");
    const role = membership?.role || appRole;
    const isPlatformAdmin = ROLE_LEVEL[appRole] >= ROLE_LEVEL.platform_admin;

    if (memberError && !isPlatformAdmin) return json({ error: "You do not belong to this organization" }, 403);
    if (!isPlatformAdmin && (ROLE_LEVEL[role] ?? 0) < ROLE_LEVEL.branch_manager) {
      return json({ error: "Branch manager or higher role required" }, 403);
    }

    const rawKey = `sk_live_${randomToken(32)}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = await sha256(rawKey);

    const { data: record, error: insertError } = await adminClient
      .from("api_keys")
      .insert({
        organization_id,
        name: keyName,
        prefix,
        key_hash: keyHash,
      })
      .select("id, organization_id, name, prefix, last_used_at, created_at")
      .single();

    if (insertError) throw insertError;

    await adminClient.rpc("log_audit_event", { p_entry: {
      organization_id,
      user_id: authData.user.id,
      action: "api_key.created",
      table_name: "api_keys",
      record_id: record.id,
      new_data: { name: keyName, prefix },
    }});

    return json({ apiKey: rawKey, record });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
});

