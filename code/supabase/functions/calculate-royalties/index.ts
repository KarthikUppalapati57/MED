import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
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

    // This function is meant to be triggered by a pg_cron job or manual webhook
    const { period_start, period_end } = await req.json()

    if (!period_start || !period_end) {
      throw new Error("Missing billing period dates");
    }

    console.log(`Calculating royalties for period: ${period_start} to ${period_end}`);

    // 1. Fetch all active franchise agreements
    const { data: agreements, error: agError } = await supabaseClient
      .from('franchise_agreements')
      .select('*')
      .eq('status', 'active');

    if (agError) throw agError;

    const results = [];

    // 2. Loop through agreements and calculate fees
    for (const agreement of agreements || []) {
      // Mocking the gross sales aggregate from accounting/ledger tables
      const mockGrossSales = Math.floor(Math.random() * 50000) + 10000; // Between $10k and $60k
      
      const royaltyFee = (mockGrossSales * (agreement.royalty_percentage / 100));
      const marketingFee = (mockGrossSales * (agreement.marketing_fee_percentage / 100));
      const totalDue = royaltyFee + marketingFee;

      // 3. Insert Invoice Record
      const { data: invoice, error: invError } = await supabaseClient
        .from('franchise_invoices')
        .insert({
          agreement_id: agreement.id,
          billing_period_start: period_start,
          billing_period_end: period_end,
          gross_sales: mockGrossSales,
          royalty_fee_amount: royaltyFee,
          marketing_fee_amount: marketingFee,
          total_amount_due: totalDue,
          due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Net 15
          status: 'issued'
        })
        .select()
        .single();

      if (invError) throw invError;
      results.push(invoice);
      
      // Note: In production, we would use the Stripe SDK here to issue a real invoice to the franchisee's connected account.
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, invoices: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Calculate royalties error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
