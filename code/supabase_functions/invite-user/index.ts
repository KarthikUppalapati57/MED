import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authorization = req.headers.get("Authorization");

  try {
    console.log("[invite-user] Function started");

    if (!authorization) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify caller
    const token = authorization.replace("Bearer ", "");
    const { data: { user: caller }, error: callerErr } = await adminClient.auth.getUser(token);
    if (callerErr || !caller) {
      console.error("[invite-user] Caller verification failed:", callerErr);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller role
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role, organization_id")
      .eq("id", caller.id)
      .single();

    if (profileErr || !callerProfile) {
      console.error("[invite-user] Caller profile not found:", profileErr);
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_ROLES = ["org_owner", "branch_manager", "location_manager", "platform_admin"];
    if (!ALLOWED_ROLES.includes(callerProfile.role)) {
      console.warn(`[invite-user] Role ${callerProfile.role} not in allowed list`);
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, full_name, role, org_id, resend } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[invite-user] Inviting ${email} as ${role} (resend: ${resend})`);

    const targetRole = role || "ground_staff";
    const targetOrgId = org_id || callerProfile.organization_id;

    const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("SITE_URL") || "http://localhost:5173";
    // We want them to go to a special signup or login URL if possible
    // Supabase invite automatically redirects to emailRedirectTo
    const loginLink = `${frontendUrl}/login`;

    // 1. Check if user already exists in Auth
    let userId: string | null = null;
    let isNewUser = false;

    try {
      const { data: userData, error: getUserErr } = await adminClient.auth.admin.listUsers();
      const existing = userData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (existing) {
        userId = existing.id;
        console.log(`[invite-user] Found existing auth user: ${userId}`);
      } else {
        isNewUser = true;
      }
    } catch (e) {
      console.warn("[invite-user] Error checking existing user, assuming new:", e);
      isNewUser = true;
    }

    if (isNewUser) {
      console.log(`[invite-user] Sending Supabase invite for new user: ${email}`);
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: loginLink,
        data: {
          full_name: full_name || '',
          role: targetRole,
        }
      });

      if (inviteError) {
        if (inviteError.message?.toLowerCase().includes("already registered")) {
          console.log("[invite-user] User actually exists (race condition), fetching again...");
          const { data: allUsers } = await adminClient.auth.admin.listUsers();
          const found = allUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (found) {
             userId = found.id;
             isNewUser = false;
          } else {
             throw inviteError;
          }
        } else {
          throw inviteError;
        }
      } else {
        userId = inviteData.user.id;
        console.log(`[invite-user] Invited new user successfully: ${userId}`);
      }
    } else if (resend) {
      // If resend is requested for an existing user but they haven't set a password or accepted:
      // Since inviteUserByEmail fails for existing users, we can try to send a password reset link
      // instead, or use generateLink to send an email manually if needed.
      console.log(`[invite-user] Resending invite for existing user: ${email} via reset password`);
      const { error: resetErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: email,
        password: crypto.randomUUID().slice(0, 12) + "X1!" // provide a temp password if required
      });
      if (resetErr) {
        console.log("[invite-user] Generating invite link failed, trying magiclink...", resetErr.message);
        await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: email
        });
      }
    }

    if (!userId) throw new Error("Failed to resolve User ID");

    // 2. Upsert profile
    console.log(`[invite-user] Upserting profile for ${userId}`);
    const { error: upsertErr } = await adminClient.from("profiles").upsert({
      id: userId,
      email: email.toLowerCase(),
      full_name: full_name || null,
      role: targetRole,
      organization_id: targetOrgId || null,
      status: "invited",
    });
    if (upsertErr) console.error("[invite-user] Profile upsert error:", upsertErr);

    // 3. Log invitation in DB
    console.log(`[invite-user] Logging invitation in DB`);
    await adminClient.from("invitations").upsert({
      email: email.toLowerCase(),
      organization_id: targetOrgId || null,
      role: targetRole,
      token: isNewUser ? "temp-password" : "existing-user",
      invited_by: caller.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'email,organization_id' }).catch(e => console.error("[invite-user] Invitation log err:", e));

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[invite-user] Global error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
