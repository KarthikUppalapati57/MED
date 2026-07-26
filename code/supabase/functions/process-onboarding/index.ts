// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendTransactionalEmail } from '../_shared/email.ts'

function isProduction() {
  return ["production", "prod"].includes((Deno.env.get("APP_ENV") || Deno.env.get("ENVIRONMENT") || "").toLowerCase())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    // pg_net sends a webhook payload containing { type, table, record, old_record }
    const { type, table, record, old_record } = payload

    if (table === 'demo_requests') {
      if (type === 'INSERT') {
        const company = record.company_name?.toLowerCase() || "";
        const isEnterprise = company.includes("inc") || company.includes("corp") || company.includes("llc");

        try {
          await sendTransactionalEmail({
            to: record.email,
            subject: 'Your Restops System Demo Request is Received!',
            text: `Hi ${record.full_name || 'there'},\n\nThank you for your interest in the Restops platform! We have received your request for a live system walkthrough demo. An administrator will contact you shortly at this email address.\n\nIf you have any questions in the meantime, feel free to reply directly to this email.\n\n— The Restops Onboarding Team`,
          })
        } catch (emailErr) {
          // Never let a notification failure mask the real demo-request flow.
          console.error('Failed to send demo confirmation email (non-fatal):', emailErr)
        }

        try {
          const { data: admins } = await supabaseClient
            .from('profiles')
            .select('email')
            .eq('role', 'platform_admin')

          const adminEmails = (admins || []).map((a) => a.email).filter(Boolean)
          if (adminEmails.length > 0) {
            const subjectPrefix = isEnterprise ? 'URGENT: Enterprise demo request' : 'New demo request'
            await sendTransactionalEmail({
              to: adminEmails,
              subject: `${subjectPrefix} from ${record.company_name || record.full_name}`,
              text: `${record.full_name} (${record.company_name || 'no company given'}) requested a demo.\n\nEmail: ${record.email}\nPhone: ${record.phone || 'n/a'}\nPlan: ${record.plan || 'n/a'}\n\nReview it in the platform admin panel.`,
            })
          }
        } catch (adminErr) {
          console.error('Failed to notify platform admins of demo request (non-fatal):', adminErr)
        }
      }
      else if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'approved') {
          try {
            // Reuse the same invitations table + /signup/:token flow the manual "invite a
            // client" action in PlatformAdmin.jsx already uses, instead of a bespoke token --
            // the token column already defaults to a random 32-byte hex value.
            const baseUrl = Deno.env.get('PUBLIC_APP_URL')
            if (!baseUrl && isProduction()) {
              throw new Error("PUBLIC_APP_URL is not configured in this environment's Supabase secrets.")
            }

            const { data: invite, error: inviteError } = await supabaseClient
              .from('invitations')
              .insert({
                email: record.email,
                role: 'tenant_super_admin',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                organization_id: null,
                brand_id: null,
                location_id: null,
                metadata: { source: 'demo_request', demo_request_id: record.id, company_name: record.company_name },
              })
              .select('token')
              .single()

            if (inviteError) throw inviteError

            const link = `${baseUrl || 'http://localhost:5173'}/signup/${invite.token}`
            await sendTransactionalEmail({
              to: record.email,
              subject: 'Your Restops Live Demo Environment is Ready!',
              text: `Hi ${record.full_name || 'there'},\n\nYour private demo environment is ready. Use the secure link below to create your administrator account:\n\n${link}\n\nFor security reasons, this link is only active for 7 days.\n\n— The Restops Administrative Team`,
            })
          } catch (approveErr) {
            console.error('Failed to send demo approval invite (non-fatal):', approveErr)
          }
        } else if (record.status === 'rejected') {
          try {
            await sendTransactionalEmail({
              to: record.email,
              subject: 'Your Restops Demo Request',
              text: `Hi ${record.full_name || 'there'},\n\nThank you for your interest in Restops. We're unable to move forward with a demo at this time.\n\n— The Restops Team`,
            })
          } catch (declineErr) {
            console.error('Failed to send demo decline email (non-fatal):', declineErr)
          }
        }
      }
    }
    else if (table === 'organizations' && type === 'DELETE') {
      console.log(`Archiving data and revoking sessions for Org ${old_record.id} (${old_record.name})`);
    }

    return new Response(JSON.stringify({ success: true, processed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error in process-onboarding:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
