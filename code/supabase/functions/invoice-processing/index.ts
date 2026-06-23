// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'

async function resolveInvoiceWriteSchema(record, requestedSchema, supabaseClient) {
  const fallbackSchema = requestedSchema || 'public';
  const organizationId = record?.organization_id;

  if (!organizationId) return fallbackSchema;

  try {
    const { data, error } = await supabaseClient.rpc('get_tenant_data_route', {
      p_organization_id: organizationId,
      p_brand_id: record?.brand_id || null,
      p_location_id: record?.location_id || null,
    });

    if (error) throw error;

    return data?.write_target || fallbackSchema;
  } catch (error) {
    console.error('Failed to resolve tenant write schema, using payload schema fallback:', error);
    return fallbackSchema;
  }
}

function assertSafeSchemaName(schemaName) {
  if (schemaName === 'public' || /^tenant_[a-z0-9_]+$/.test(schemaName)) return;
  throw new Error(`Unsafe tenant schema name: ${schemaName}`);
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(value) {
  const parsed = parseMoney(value);
  return parsed === null ? null : parsed;
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function normalizeDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const us = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (us) {
    let [, m, d, y] = us;
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned !== null) return cleaned;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = parseMoney(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeLineItem(item = {}) {
  const quantity = firstNumber(
    item.quantity,
    item.qty,
    item.shipped_quantity,
    item.shipped_qty,
    item.invoice_quantity,
    item.invoice_qty,
    item.order_quantity,
    item.order_qty
  );
  const unitPrice = firstNumber(item.unit_price, item.price, item.pricing_unit_price, item.invoice_unit_price);
  const extendedPrice = firstNumber(item.extended_price, item.extended, item.total_price, item.line_total, item.amount);

  return {
    vendor_item_code: firstValue(item.vendor_item_code, item.product_number, item.item_number, item.item_code, item.product_id) || '',
    description: firstValue(item.description, item.item_description, item.vendor_item_description, item.product_description, item.name) || '',
    quantity: quantity ?? '',
    unit: firstValue(item.unit, item.pricing_unit, item.uom, item.unit_of_measure) || '',
    unit_price: unitPrice ?? '',
    discount: firstNumber(item.discount) ?? 0,
    adjustment: firstNumber(item.adjustment) ?? 0,
    extended_price: extendedPrice ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : 0),
    pack_size: firstValue(item.pack_size, item.pack, item.size) || '',
    label: firstValue(item.label, item.brand) || '',
    ai_confidence: firstNumber(item.ai_confidence, item.confidence) ?? null,
  };
}

function normalizeExtraction(data = {}) {
  const lineItems = Array.isArray(data.line_items) ? data.line_items.map(normalizeLineItem) : [];
  const subtotal = firstNumber(data.subtotal, data.invoice_subtotal, data.merchandise_total);
  const taxAmount = firstNumber(data.tax_amount, data.tax, data.sales_tax);
  const fuelSurcharge = firstNumber(data.fuel_surcharge, data.fuel_charge);
  const deliveryFee = firstNumber(data.delivery_fee, data.freight, data.freight_amount, data.delivery_charge);
  const otherCharges = firstNumber(data.other_charges, data.misc_charges, data.other_amount);
  const totalAmount = firstNumber(data.total_amount, data.invoice_total, data.grand_total, data.amount_due);

  return {
    vendor_name: firstValue(data.vendor_name, data.supplier_name, data.remit_to_name),
    invoice_number: firstValue(data.invoice_number, data.invoice_no, data.invoice_id),
    account_number: firstValue(data.account_number, data.customer_number, data.customer_id, data.customer_account_number),
    invoice_date: normalizeDate(data.invoice_date),
    due_date: normalizeDate(data.due_date),
    payment_terms: firstValue(data.payment_terms, data.terms),
    subtotal,
    tax_amount: taxAmount,
    fuel_surcharge: fuelSurcharge,
    delivery_fee: deliveryFee,
    other_charges: otherCharges,
    total_amount: totalAmount,
    line_items: lineItems,
  };
}
// Background processing function
async function processInvoiceBackground(record, schemaName, supabaseClient) {
  try {
    console.log(`Starting background extraction for ${record.id} in schema ${schemaName}...`);
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'start', invoice_id: record.id, schemaName, filePath: record.file_url }
    });

    // 1. Securely fetch file from private bucket using service role client
    let filePath = record.file_url;
    if (filePath.includes('invoices/')) {
        filePath = filePath.split('invoices/')[1];
    }
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'downloading', filePath }
    });
    
    // Create service role DB client for storage
    const storageDb = supabaseClient; 
    
    const { data: fileBlob, error: downloadError } = await storageDb.storage.from('invoices').download(filePath);
    if (downloadError) throw new Error(`Failed to download file from private bucket: ${downloadError.message}`);
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'download_success', size: fileBlob.size }
    });
    
    const fileBuffer = await fileBlob.arrayBuffer();
    const finalBase64Data = Buffer.from(fileBuffer).toString('base64');

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'base64_encoded', length: finalBase64Data.length }
    });

    // 2. Vertex / Gemini Extraction Logic
    console.log("Invoking Gemini Vision API...");
    
    // Get the API key from environment variables
    const apiKey = Deno.env.get('VITE_GEMINI_API_KEY') || Deno.env.get('vertex_api_key');
    if (!apiKey) throw new Error("Gemini API key is not configured in Edge Function environment.");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an expert AP invoice data extractor for restaurant supplier invoices.
      Extract every visible header field and every invoice line from the PDF. Preserve the values exactly as printed when possible.

      Return STRICT JSON only. No markdown fences. Use this exact shape:
      {
        "vendor_name": "string or null",
        "invoice_number": "string or null",
        "account_number": "string or null",
        "customer_number": "string or null",
        "invoice_date": "YYYY-MM-DD or MM/DD/YYYY or null",
        "due_date": "YYYY-MM-DD or MM/DD/YYYY or null",
        "payment_terms": "string or null",
        "subtotal": 0.0,
        "tax_amount": 0.0,
        "fuel_surcharge": 0.0,
        "delivery_fee": 0.0,
        "other_charges": 0.0,
        "total_amount": 0.0,
        "line_items": [
          {
            "vendor_item_code": "product/item number as printed",
            "description": "full item description",
            "quantity": 0,
            "unit": "CS/EA/LB/etc from pricing unit or UOM",
            "unit_price": 0.0,
            "extended_price": 0.0,
            "pack_size": "pack size if visible",
            "label": "brand/label if visible",
            "ai_confidence": 0.0
          }
        ]
      }

      For US Foods invoices, line item columns often include ORDER, SHP, ADJ, SALES UNIT, PRODUCT NUMBER,
      DESCRIPTION, LABEL, PACK SIZE, CODE, WEIGHT, PRICING UNIT, UNIT PRICE, and EXTENDED PRICE.
      Use the shipped quantity (SHP) for quantity when present. Use PRODUCT NUMBER for vendor_item_code.
      Use PRICING UNIT or SALES UNIT for unit. Use UNIT PRICE for unit_price and EXTENDED PRICE for extended_price.
      Do not leave quantity/unit/unit_price blank if those columns are visible. If a value is unreadable, use null.
      Include all line rows across all pages, excluding subtotal/summary/footer rows.
    `;

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'invoking_gemini' }
    });

    const result = await model.generateContent([
      {
        inlineData: {
          data: finalBase64Data,
          mimeType: "application/pdf"
        }
      },
      prompt
    ]);

    const responseText = result.response.text();
    console.log("Raw Gemini Response:", responseText);

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'gemini_response', responseText }
    });

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
    
    const normalized = normalizeExtraction(extractedData);
    const updatePayload = {
      vendor_name: normalized.vendor_name || record.vendor_name,
      invoice_number: normalized.invoice_number || record.invoice_number,
      account_number: normalized.account_number,
      invoice_date: normalized.invoice_date,
      due_date: normalized.due_date,
      payment_terms: normalized.payment_terms,
      subtotal: normalized.subtotal,
      total_amount: normalized.total_amount,
      tax_amount: normalized.tax_amount,
      fuel_surcharge: normalized.fuel_surcharge,
      delivery_fee: normalized.delivery_fee,
      other_charges: normalized.other_charges,
      line_items: normalized.line_items,
      status: 'pending_review',
      raw_text: responseText,
      extraction_method: 'gemini_vision_api',
    };

    let updateError = null;
    if (schemaName && schemaName !== 'public') {
      const { error } = await supabaseClient.rpc('tenant_update_row', {
        p_table_name: 'invoices',
        p_id: record.id,
        p_payload: { organization_id: record.organization_id, ...updatePayload }
      });
      updateError = error;
    } else {
      const { error } = await supabaseClient.from('invoices').update(updatePayload).eq('id', record.id);
      updateError = error;
    }

    if (updateError) {
      await supabaseClient.from('debug_logs').insert({
        log_data: { point: 'update_failed', error: updateError }
      });
      console.error(`Failed to update invoice ${record.id}:`, updateError);
      throw updateError;
    } else {
      console.log(`Successfully processed invoice ${record.id}`);
      await supabaseClient.from('debug_logs').insert({
        log_data: { point: 'success', invoice_id: record.id }
      });
    }

  } catch (err) {
    console.error(`Error in background extraction for invoice ${record.id}:`, err);
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'catch_block', error_message: err.message, error_stack: err.stack }
    });

    const failPayload = { status: 'extract_failed', validation_results: { error: err.message } };
    let failUpdateError = null;

    if (schemaName && schemaName !== 'public') {
      const { error } = await supabaseClient.rpc('tenant_update_row', {
        p_table_name: 'invoices',
        p_id: record.id,
        p_payload: { organization_id: record.organization_id, ...failPayload }
      });
      failUpdateError = error;
    } else {
      const { error } = await supabaseClient.from('invoices')
        .update(failPayload)
        .eq('id', record.id);
      failUpdateError = error;
    }
      
    // Log the failure to event log
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'catch_block_update', failUpdateError: failUpdateError || null }
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

    const targetSchema = await resolveInvoiceWriteSchema(record, schema || 'public', supabaseClient);
    assertSafeSchemaName(targetSchema);

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
    const shouldProcessExtraction = table === 'invoices'
      && record?.status === 'extracting'
      && (
        type === 'INSERT'
        || old_record?.status !== 'extracting'
        || old_record?.extraction_started_at !== record?.extraction_started_at
      );

    if (shouldProcessExtraction) {
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
