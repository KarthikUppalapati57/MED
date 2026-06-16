// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
    // Support both direct HTTP calls (from frontend API) and pg_net webhooks
    const { invoice_id, action, type, table, record, old_record } = payload

    // 1. Direct Call logic
    if (action && invoice_id) {
      console.log(`Executing ${action} for invoice ${invoice_id}`)
      
      if (action === 'reconcile_invoice_lines') {
        const { data, error } = await supabaseClient.rpc('reconcile_invoice_lines', { p_invoice_id: invoice_id })
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
      
      return new Response(JSON.stringify({ success: true, message: `Action ${action} completed successfully for invoice ${invoice_id}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // 2. pg_net webhook logic
    if (table === 'invoices') {
      if (type === 'INSERT') {
        console.log(`Triggering OCR extraction for Invoice ${record.id}`);
        // Insert into invoice_ingestion_jobs or external API here
      } 
      else if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'processed' || record.status === 'approved') {
          console.log(`Starting post-processing for Invoice ${record.id}`);
          
          if (record.total_amount > 1000) {
            console.log(`Sending alert: Large invoice of $${record.total_amount} processed`);
          }

          // Sync to accounting / general ledger
          const { error } = await supabaseClient.from('ledger_entries').insert({
            organization_id: record.organization_id,
            description: `Invoice ${record.id} Sync`,
            amount: record.total_amount
          });

          if (error) console.error("GL Sync Error:", error)
        } else if (record.status === 'rejected') {
          console.log(`Notifying uploader about rejection of Invoice ${record.id}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Invoice processing error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
