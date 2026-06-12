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

const DEFAULT_EVENTS = [
  "profiles.insert",
  "profiles.update",
  "employees.insert",
  "employees.update",
  "inventory.update",
];

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

function validateWebhookUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Webhook endpoint must use HTTPS");
  }
  return parsed.toString();
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

    const { url, organization_id, events } = await req.json();
    if (!url) return json({ error: "Webhook URL is required" }, 400);
    if (!organization_id) return json({ error: "organization_id is required" }, 400);
    const webhookUrl = validateWebhookUrl(String(url).trim());

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

    const secret = `whsec_${randomToken(32)}`;
    const secretPrefix = secret.slice(0, 12);

    const { data: endpoint, error: endpointError } = await adminClient
      .from("webhook_endpoints")
      .insert({
        organization_id,
        url: webhookUrl,
        secret,
        secret_prefix: secretPrefix,
      })
      .select("id, organization_id, url, status, secret_prefix, created_at")
      .single();

    if (endpointError) throw endpointError;

    const selectedEvents = Array.isArray(events) && events.length > 0 ? events : DEFAULT_EVENTS;
    const subscriptions = selectedEvents.map((eventType) => ({
      endpoint_id: endpoint.id,
      event_type: String(eventType),
    }));

    const { error: subscriptionError } = await adminClient
      .from("webhook_subscriptions")
      .insert(subscriptions);

    if (subscriptionError) throw subscriptionError;

    await adminClient.from("audit_logs").insert({
      organization_id,
      user_id: authData.user.id,
      action: "webhook_endpoint.created",
      table_name: "webhook_endpoints",
      record_id: endpoint.id,
      new_data: { url: webhookUrl, events: selectedEvents, secret_prefix: secretPrefix },
    });

    return json({ endpoint, signingSecret: secret });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return json({ error: message }, message.includes("HTTPS") ? 400 : 500);
  }
});
