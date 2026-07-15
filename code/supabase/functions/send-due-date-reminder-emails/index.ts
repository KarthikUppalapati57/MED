import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { sendTransactionalEmail } from '../_shared/email.ts'

// Triggered once daily by public.send_due_date_reminders() via net.http_post (service-role
// only -- see 20260717000001_payment_reminders_and_failure_notify.sql). Plain SQL can't call
// Resend, so the DB function does the matching/logging and this function does the email side,
// reading back today's invoice_reminder_log rows rather than recomputing who's due a reminder.
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

    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)

    const { data: logRows, error: logError } = await supabase
      .from('invoice_reminder_log')
      .select('id, invoice_id, user_id, reminder_day, sent_at')
      .gte('sent_at', startOfDay.toISOString())

    if (logError) throw logError
    if (!logRows || logRows.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    let sent = 0
    for (const row of logRows) {
      try {
        const [{ data: invoice }, { data: profile }] = await Promise.all([
          supabase.from('invoices').select('vendor_name, invoice_number, total_amount, due_date').eq('id', row.invoice_id).maybeSingle(),
          supabase.from('profiles').select('email, full_name').eq('id', row.user_id).maybeSingle(),
        ])

        if (!invoice || !profile?.email) continue

        const subject = row.reminder_day <= 0 ? 'Invoice overdue' : 'Invoice due soon'
        const text = row.reminder_day <= 0
          ? `Invoice ${invoice.invoice_number || ''} from ${invoice.vendor_name || 'a vendor'} for $${Number(invoice.total_amount || 0).toFixed(2)} was due on ${invoice.due_date} and is still unpaid.`
          : `Invoice ${invoice.invoice_number || ''} from ${invoice.vendor_name || 'a vendor'} for $${Number(invoice.total_amount || 0).toFixed(2)} is due in ${row.reminder_day} day${row.reminder_day === 1 ? '' : 's'} (${invoice.due_date}).`

        await sendTransactionalEmail({ to: profile.email, subject, text })
        sent += 1
      } catch (rowError) {
        console.error('Failed to email one reminder row:', row.id, rowError)
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('send-due-date-reminder-emails error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
