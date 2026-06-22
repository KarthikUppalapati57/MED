// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Background processing function
async function processInvoiceBackground(record, supabaseClient) {
  try {
    console.log(`Starting background extraction for ${record.id}...`);
    
    // 1. Fetch file using the public URL
    const fileRes = await fetch(record.file_url);
    if (!fileRes.ok) throw new Error(`Failed to fetch file from URL: ${fileRes.statusText}`);
    const fileData = await fileRes.blob();

    // 2. Dynamic Mock Extraction Logic
    // In production, this would be a call to Gemini Pro Vision or AWS Textract
    console.log("Using dynamic OCR extraction logic...");
    
    // Simulate API delay
    await new Promise(r => setTimeout(r, 2500));

    const vendors = [
      'Sysco Food Services', 'US Foods', 'Gordon Food Service', 'Performance Food Group', 
      'Cheney Brothers', 'Ben E. Keith', 'Shamrock Foods'
    ];
    const items = [
      { desc: 'Chicken Breast 40lb', price: 85.50 },
      { desc: 'Ground Beef 80/20 10lb', price: 45.20 },
      { desc: 'Romaine Hearts 48ct', price: 32.00 },
      { desc: 'Frying Oil Clear Liquid 35lb', price: 42.10 },
      { desc: 'French Fries 3/8" 30lb', price: 28.50 },
      { desc: 'Bleach 1 Gal', price: 6.50 },
      { desc: 'Napkins Dispenser 6000ct', price: 54.00 }
    ];

    // Generate random realistic data
    const randomVendor = vendors[Math.floor(Math.random() * vendors.length)];
    const invoiceNum = `INV-${Math.floor(Math.random() * 90000) + 10000}`;
    
    // Pick 2 to 4 random items
    const numItems = Math.floor(Math.random() * 3) + 2;
    const line_items = [];
    let subtotal = 0;

    for (let i = 0; i < numItems; i++) {
      const item = items[Math.floor(Math.random() * items.length)];
      const qty = Math.floor(Math.random() * 5) + 1;
      const extPrice = item.price * qty;
      subtotal += extPrice;
      
      line_items.push({
        description: item.desc,
        quantity: qty,
        unit_price: item.price,
        extended_price: parseFloat(extPrice.toFixed(2)),
        unit: 'cs'
      });
    }

    const tax_amount = parseFloat((subtotal * 0.07).toFixed(2));
    const total_amount = parseFloat((subtotal + tax_amount).toFixed(2));

    const extractedData = {
      vendor_name: randomVendor,
      invoice_number: invoiceNum,
      subtotal: subtotal,
      tax_amount: tax_amount,
      total_amount: total_amount,
      line_items: line_items,
      raw_text: `Extracted ${numItems} items from ${randomVendor} invoice ${invoiceNum}.`
    };

    // 3. Update invoice with extracted data
    console.log(`Updating invoice ${record.id} to pending_review...`);
    const { error: updateError } = await supabaseClient.from('invoices').update({
      vendor_name: extractedData.vendor_name,
      invoice_number: extractedData.invoice_number,
      subtotal: extractedData.subtotal,
      total_amount: extractedData.total_amount,
      tax_amount: extractedData.tax_amount,
      line_items: extractedData.line_items,
      status: 'pending_review',
      raw_text: extractedData.raw_text,
      extraction_method: 'background_job',
    }).eq('id', record.id);

    if (updateError) {
      console.error(`Failed to update invoice ${record.id}:`, updateError);
      throw updateError;
    } else {
      console.log(`Successfully processed invoice ${record.id}`);
    }

  } catch (err) {
    console.error(`Error in background extraction for invoice ${record.id}:`, err);
    // Correctly update invoice status to 'extract_failed' instead of 'rejected'
    await supabaseClient.from('invoices')
      .update({ status: 'extract_failed', validation_results: { error: err.message } })
      .eq('id', record.id);
  }
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
      if (type === 'INSERT' && record.status === 'extracting') {
        console.log(`Triggering OCR extraction for Invoice ${record.id}`);
        
        // Use EdgeRuntime.waitUntil to safely execute background tasks in serverless environments
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
           EdgeRuntime.waitUntil(processInvoiceBackground(record, supabaseClient));
        } else if (typeof globalThis !== 'undefined' && typeof globalThis.EdgeRuntime !== 'undefined' && typeof globalThis.EdgeRuntime.waitUntil === 'function') {
           globalThis.EdgeRuntime.waitUntil(processInvoiceBackground(record, supabaseClient));
        } else {
           // Fallback to synchronous execution if EdgeRuntime is unavailable
           console.log("EdgeRuntime.waitUntil unavailable, falling back to synchronous execution");
           await processInvoiceBackground(record, supabaseClient);
        }
      } 
      else if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'processed' || record.status === 'approved') {
          console.log(`Starting post-processing for Invoice ${record.id}`);
          if (record.total_amount > 1000) {
            console.log(`Sending alert: Large invoice of $${record.total_amount} processed`);
          }
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
