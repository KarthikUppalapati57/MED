// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'

// Background processing function
async function processInvoiceBackground(record, schemaName, supabaseClient) {
  try {
    console.log(`Starting background extraction for ${record.id} in schema ${schemaName}...`);
    
    await supabaseClient.from('invoice_event_log').insert({
      invoice_id: record.id,
      event_type: 'extraction_started',
      event_data: { schemaName, filePath: record.file_url }
    });

    // 1. Securely fetch file from private bucket using service role client
    // We assume record.file_url now stores the exact filePath (e.g. 'auto-ingested/uuid.pdf') 
    // or a full url. We will extract the path if it's a URL.
    let filePath = record.file_url;
    if (filePath.includes('invoices/')) {
        filePath = filePath.split('invoices/')[1];
    }
    
    // Create service role DB client for storage
    const storageDb = supabaseClient; 
    
    const { data: fileBlob, error: downloadError } = await storageDb.storage.from('invoices').download(filePath);
    if (downloadError) throw new Error(`Failed to download file from private bucket: ${downloadError.message}`);
    
    const fileBuffer = await fileBlob.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    // 2. Vertex / Gemini Extraction Logic
    console.log("Invoking Gemini Vision API...");
    
    // Get the API key from environment variables
    const apiKey = Deno.env.get('VITE_GEMINI_API_KEY') || Deno.env.get('vertex_api_key');
    if (!apiKey) throw new Error("Gemini API key is not configured in Edge Function environment.");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      You are an expert invoice parser. Extract the following information from the provided invoice image:
      1. Vendor Name
      2. Invoice Number
      3. Subtotal
      4. Tax Amount
      5. Total Amount
      6. A list of all line items, where each line item has: description, quantity, unit_price, extended_price.
      
      Respond STRICTLY with a valid JSON object matching this schema:
      {
        "vendor_name": "string",
        "invoice_number": "string",
        "subtotal": 0.0,
        "tax_amount": 0.0,
        "total_amount": 0.0,
        "line_items": [
          {
            "description": "string",
            "quantity": 0,
            "unit_price": 0.0,
            "extended_price": 0.0,
            "unit": "cs"
          }
        ]
      }
      Do not include markdown tags like \`\`\`json. Just output the raw JSON object.
    `;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "application/pdf"
        }
      },
      prompt
    ]);

    const responseText = result.response.text();
    console.log("Raw Gemini Response:", responseText);

    let extractedData;
    try {
      // Clean potential markdown from response
      const cleanJsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      extractedData = JSON.parse(cleanJsonStr);
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON output:", parseError);
      throw new Error("AI returned invalid JSON format.");
    }

    // 3. Update invoice with extracted data securely inside the tenant schema
    console.log(`Updating invoice ${record.id} to pending_review in schema ${schemaName}...`);
    
    const db = schemaName && schemaName !== 'public' 
      ? supabaseClient.schema(schemaName) 
      : supabaseClient;

    const { error: updateError } = await db.from('invoices').update({
      vendor_name: extractedData.vendor_name,
      invoice_number: extractedData.invoice_number,
      subtotal: extractedData.subtotal,
      total_amount: extractedData.total_amount,
      tax_amount: extractedData.tax_amount,
      line_items: extractedData.line_items || [],
      status: 'pending_review',
      raw_text: responseText,
      extraction_method: 'gemini_vision_api',
    }).eq('id', record.id);

    if (updateError) {
      console.error(`Failed to update invoice ${record.id}:`, updateError);
      throw updateError;
    } else {
      console.log(`Successfully processed invoice ${record.id}`);
      await supabaseClient.from('invoice_event_log').insert({
        invoice_id: record.id,
        event_type: 'extraction_success',
        event_data: { schemaName }
      });
    }

  } catch (err) {
    console.error(`Error in background extraction for invoice ${record.id}:`, err);
    
    const db = schemaName && schemaName !== 'public' 
      ? supabaseClient.schema(schemaName) 
      : supabaseClient;

    // Correctly update invoice status to 'extract_failed' instead of 'rejected'
    const { error: failUpdateError } = await db.from('invoices')
      .update({ status: 'extract_failed', validation_results: { error: err.message } })
      .eq('id', record.id);
      
    // Log the failure to event log
    await supabaseClient.from('invoice_event_log').insert({
      invoice_id: record.id,
      event_type: 'extraction_failed',
      event_data: { error: err.message, stack: err.stack, failUpdateError }
    });
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
    const { invoice_id, action, type, table, record, old_record, schema } = payload

    const targetSchema = schema || 'public';

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
    if (type === 'INSERT' && table === 'invoices' && record.status === 'extracting') {
      // We must AWAIT this! Deno Edge Functions terminate when the response is sent.
      // pg_net handles the timeout asynchronously from the database side.
      await processInvoiceBackground(record, targetSchema, supabaseClient);
      
      return new Response(JSON.stringify({ success: true, message: 'Processing complete' }), { headers: corsHeaders, status: 200 })
    } 

    if (table === 'invoices') {
      if (type === 'UPDATE' && record.status !== old_record?.status) {
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
