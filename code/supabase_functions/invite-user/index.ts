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
    const { email, full_name, role, org_id, resend, page_permissions, signing_privileges } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[invite-user] Inviting ${email} as ${role} (resend: ${resend})`);

    const targetRole = role || "ground_staff";
    const targetOrgId = org_id || callerProfile.organization_id;

    const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("SITE_URL") || "http://localhost:5173";
    const loginLink = `${frontendUrl}/login`;

    // ── Safety check: was this user previously deleted/archived? ──────────
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, status, role, organization_id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingProfile && ["inactive", "archived"].includes(existingProfile.status)) {
      console.warn(`[invite-user] User ${email} was previously ${existingProfile.status}`);
      return new Response(JSON.stringify({
        error: `This user (${email}) was previously ${existingProfile.status}. Please contact a platform admin to reinstate them before re-inviting.`,
        code: "USER_PREVIOUSLY_REMOVED",
        previous_status: existingProfile.status,
        previous_org: existingProfile.organization_id,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check if user already exists in Auth
    let userId: string | null = null;
    let isNewUser = false;

    try {
      const { data: userData } = await adminClient.auth.admin.listUsers();
      const existing = userData?.users?.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

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
          const found = allUsers?.users?.find(
            (u: any) => u.email?.toLowerCase() === email.toLowerCase()
          );
          if (found) {
            userId = found.id;
            isNewUser = false;
          } else {
            throw inviteError;
          }
        } else {
          throw inviteError;
        }
      } else if (inviteData?.user) {
        userId = inviteData.user.id;
        console.log(`[invite-user] Invited new user successfully: ${userId}`);
      }
    } else if (resend) {
      // For existing users, generate a recovery/magic link to re-invite them
      console.log(`[invite-user] Resending invite for existing user: ${email}`);
      try {
        const { error: linkErr } = await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: email,
        });
        if (linkErr) {
          console.warn("[invite-user] Magic link generation failed:", linkErr.message);
        }
      } catch (e: any) {
        console.warn("[invite-user] Re-invite fallback error:", e.message);
      }
    }

    if (!userId) throw new Error("Failed to resolve User ID");

    // 2. Upsert profile
    console.log(`[invite-user] Upserting profile for ${userId}`);
    const profilePayload: Record<string, any> = {
      id: userId,
      email: email.toLowerCase(),
      full_name: full_name || null,
      role: targetRole,
      organization_id: targetOrgId || null,
      status: "invited",
    };
    // Attach page permissions & signing privileges if provided
    if (page_permissions && Object.keys(page_permissions).length > 0) {
      profilePayload.permissions = page_permissions;
    }
    if (signing_privileges && Object.keys(signing_privileges).length > 0) {
      profilePayload.signing_privileges = signing_privileges;
    }

    const { error: upsertErr } = await adminClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (upsertErr) console.error("[invite-user] Profile upsert error:", upsertErr);

    // 3. Log invitation in DB — generate a proper token for the frontend
    console.log(`[invite-user] Logging invitation in DB`);
    const invitationToken = crypto.randomUUID();
    const { error: invInsertErr } = await adminClient.from("invitations").insert({
      email: email.toLowerCase(),
      organization_id: targetOrgId || null,
      role: targetRole,
      token: invitationToken,
      invited_by: caller.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        page_permissions: page_permissions || {},
        signing_privileges: signing_privileges || {},
      },
    });
    if (invInsertErr) {
      console.error("[invite-user] Invitation insert error:", invInsertErr);
      // If duplicate, try to fetch existing token
      if (invInsertErr.code === "23505") {
        const { data: existingInv } = await adminClient
          .from("invitations")
          .select("token")
          .eq("email", email.toLowerCase())
          .eq("organization_id", targetOrgId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingInv?.token) {
          return new Response(JSON.stringify({
            success: true,
            userId,
            token: existingInv.token,
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      userId,
      token: invitationToken,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[invite-user] Global error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
