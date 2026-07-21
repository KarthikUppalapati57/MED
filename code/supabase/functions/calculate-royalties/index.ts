import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function toDateString(value: unknown, field: string) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must be YYYY-MM-DD`)
  return text
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const payload = await req.json()
    const periodStart = toDateString(payload.period_start, 'period_start')
    const periodEnd = toDateString(payload.period_end, 'period_end')
    if (periodEnd < periodStart) throw new Error('period_end must be on or after period_start')

    const { data: agreements, error: agreementError } = await supabaseClient
      .from('franchise_agreements')
      .select('*')
      .eq('status', 'active')

    if (agreementError) throw agreementError

    const results = []
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    for (const agreement of agreements || []) {
      const { data: salesRows, error: salesError } = await supabaseClient
        .from('pos_orders')
        .select('total_amount')
        .eq('organization_id', agreement.organization_id)
        .gte('order_date', `${periodStart}T00:00:00.000Z`)
        .lt('order_date', `${periodEnd}T23:59:59.999Z`)
        .in('status', ['logged', 'synced'])

      if (salesError) throw salesError

      const grossSales = (salesRows || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
      const royaltyFee = Number((grossSales * (Number(agreement.royalty_percentage || 0) / 100)).toFixed(2))
      const marketingFee = Number((grossSales * (Number(agreement.marketing_fee_percentage || 0) / 100)).toFixed(2))
      const totalDue = Number((royaltyFee + marketingFee).toFixed(2))

      const { data: existingInvoice, error: existingError } = await supabaseClient
        .from('franchise_invoices')
        .select('id, status')
        .eq('agreement_id', agreement.id)
        .eq('billing_period_start', periodStart)
        .eq('billing_period_end', periodEnd)
        .maybeSingle()

      if (existingError) throw existingError

      const invoicePayload = {
        agreement_id: agreement.id,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        gross_sales: grossSales,
        royalty_fee_amount: royaltyFee,
        marketing_fee_amount: marketingFee,
        total_amount_due: totalDue,
        due_date: dueDate,
        status: existingInvoice?.status === 'paid' ? 'paid' : 'issued',
      }

      const invoiceQuery = existingInvoice
        ? supabaseClient.from('franchise_invoices').update(invoicePayload).eq('id', existingInvoice.id).select().single()
        : supabaseClient.from('franchise_invoices').insert(invoicePayload).select().single()

      const { data: invoice, error: invoiceError } = await invoiceQuery
      if (invoiceError) throw invoiceError
      results.push(invoice)
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, invoices: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Calculate royalties error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})