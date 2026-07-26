import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendTransactionalEmail } from '../_shared/email.ts'
import { sendSms } from '../_shared/sms.ts'

// Invoked via net.http_post by the notifications table's BEFORE INSERT trigger
// (enforce_notification_delivery_preference -- see the
// notification_delivery_preference_enforcement migration), service-role only. Fans a single
// notification out to whichever channels the recipient has enabled for that module, on top of
// the in-app row the trigger already let through.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { user_id, title, message, send_email, send_sms } = await req.json()
    if (!user_id || (!send_email && !send_sms)) {
      return new Response(JSON.stringify({ dispatched: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, phone')
      .eq('id', user_id)
      .maybeSingle()

    const results = { email: false, sms: false }

    if (send_email && profile?.email) {
      try {
        await sendTransactionalEmail({ to: profile.email, subject: title || 'Restops notification', text: message || '' })
        results.email = true
      } catch (err) {
        // Non-fatal: the in-app notification already landed via the trigger that called us.
        console.error('notify-channel-dispatch email failed:', err)
      }
    }

    if (send_sms && profile?.phone) {
      try {
        await sendSms({ to: profile.phone, message: title ? `${title}: ${message || ''}` : (message || '') })
        results.sms = true
      } catch (err) {
        console.error('notify-channel-dispatch sms failed:', err)
      }
    }

    return new Response(JSON.stringify({ dispatched: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('notify-channel-dispatch error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
