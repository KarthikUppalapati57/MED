import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // This cron job fetches all franchise agreements, aggregates sales for the week, and creates invoices
    console.log("Starting weekly franchise royalty calculation job...");

    const { data: agreements, error } = await supabaseClient
      .from('franchise_agreements')
      .select('id, parent_org_id, child_org_id, royalty_percentage, marketing_fee_percentage')
      .eq('status', 'active');
      
    if (error) throw error;

    let invoicesCreated = 0;

    for (const agreement of agreements || []) {
      // MOCK: In production, we'd query the `sales_data` table for the child_org_id
      const mockWeeklySales = Math.random() * 50000 + 10000; 
      
      const royaltyFee = mockWeeklySales * (agreement.royalty_percentage / 100);
      const marketingFee = mockWeeklySales * (agreement.marketing_fee_percentage / 100);
      
      const { error: invoiceError } = await supabaseClient
        .from('royalty_invoices')
        .insert({
          agreement_id: agreement.id,
          period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          period_end: new Date().toISOString().split('T')[0],
          gross_sales: Number(mockWeeklySales.toFixed(2)),
          royalty_fee: Number(royaltyFee.toFixed(2)),
          marketing_fee: Number(marketingFee.toFixed(2)),
          total_due: Number((royaltyFee + marketingFee).toFixed(2)),
          status: 'pending_payment'
        });
        
      if (!invoiceError) invoicesCreated++;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Royalty calculation completed',
      invoices_created: invoicesCreated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
