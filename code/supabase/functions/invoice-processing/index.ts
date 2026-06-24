// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const paidDetectionInput = data.paid_status_detection || {};
  const explicitPaymentStatus = cleanString(data.payment_status)?.toLowerCase();
  const confidence = firstNumber(paidDetectionInput.confidence, paidDetectionInput.ai_confidence);
  const paidDetection = {
    detected: Boolean(paidDetectionInput.detected || explicitPaymentStatus === 'paid'),
    confidence: confidence ?? null,
    evidence: firstValue(paidDetectionInput.evidence, paidDetectionInput.reason, data.payment_status_evidence),
    should_mark_paid: Boolean(
      paidDetectionInput.should_mark_paid ||
      explicitPaymentStatus === 'paid' ||
      (paidDetectionInput.detected && confidence !== null && confidence >= 0.85)
    ),
  };

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
    payment_status: paidDetection.should_mark_paid ? 'paid' : 'unpaid',
    paid_status_detection: paidDetection.detected ? paidDetection : null,
  };
}
function getDoclingBackendUrl() {
  const configuredUrl = Deno.env.get('PYTHON_BACKEND_URL')?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const isLocalSupabase = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
  if (isLocalSupabase) return 'http://127.0.0.1:8000';

  throw new Error('PYTHON_BACKEND_URL is required for deployed invoice extraction.');
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

    // 2. Route extraction to Python Docling backend
    console.log("Routing file to Python Docling backend for extraction...");
    
    const backendUrl = getDoclingBackendUrl();
    const formData = new FormData();
    formData.append('file', fileBlob, filePath.split('/').pop() || 'invoice.pdf');

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'invoking_docling_backend', url: `${backendUrl}/extract-invoice` }
    });

    const extractionResponse = await fetch(`${backendUrl}/extract-invoice`, {
      method: 'POST',
      body: formData,
    });

    if (!extractionResponse.ok) {
      const errText = await extractionResponse.text();
      throw new Error(`Python backend failed: ${extractionResponse.status} ${errText}`);
    }

    const extractedData = await extractionResponse.json();

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'docling_response_success' }
    });

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
      payment_status: normalized.payment_status,
      status: 'pending_review',
      ap_status: 'processing',
      raw_text: extractedData.raw_text || '',
      validation_results: normalized.paid_status_detection
        ? { ...(record.validation_results || {}), paid_status_detection: normalized.paid_status_detection }
        : record.validation_results,
      extraction_method: 'docling+gemini',
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

    const failPayload = { status: 'extract_failed', ap_status: 'action_required', validation_results: { error: err.message } };
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
          
          if (record.status === 'approved') {
            const vendorMatch = record.vendor_id ? `id=eq.${record.vendor_id}` : `name=eq.${record.vendor_name}`;
            const { data: vendors } = await supabaseClient
               .from('vendors')
               .select('id, autopay_enabled, default_payment_method')
               .eq('organization_id', record.organization_id)
               .or(vendorMatch)
               .limit(1);
               
            const vendor = vendors?.[0];
            
            if (vendor?.autopay_enabled) {
               console.log(`AutoPay enabled for vendor ${vendor.id}, scheduling payment...`);
               const { error: paymentError } = await supabaseClient
                  .from('payments')
                  .insert({
                     organization_id: record.organization_id,
                     location_id: record.location_id,
                     vendor_id: vendor.id,
                     invoice_id: record.id,
                     amount: record.total_amount,
                     status: 'scheduled',
                     payment_method: vendor.default_payment_method || 'ach',
                     payment_date: record.due_date || new Date().toISOString().split('T')[0]
                  });
               
               if (!paymentError) {
                  await supabaseClient.from('invoices')
                     .update({ payment_status: 'scheduled' })
                     .eq('id', record.id);
               } else {
                  console.error('Failed to create AutoPay payment:', paymentError);
               }
            }
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
