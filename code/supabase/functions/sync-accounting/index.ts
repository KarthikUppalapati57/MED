import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadEntity(supabaseClient: ReturnType<typeof createClient>, queueRow: Record<string, unknown>) {
  const entityType = String(queueRow.entity_type || '');
  const entityId = String(queueRow.entity_id || '');

  if (entityType === 'invoice') {
    const { data, error } = await supabaseClient
      .from('invoices')
      .select('*, vendors(id, name, accounting_vendor_id, accounting_vendor_name), invoice_line_items(*)')
      .eq('id', entityId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  if (entityType === 'payment') {
    const { data, error } = await supabaseClient
      .from('payments')
      .select('*, vendors(id, name, accounting_vendor_id, accounting_vendor_name), invoices(id, invoice_number, total_amount)')
      .eq('id', entityId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  if (entityType === 'journal_entry') {
    const { data, error } = await supabaseClient
      .from('general_ledger_entries')
      .select('*')
      .eq('id', entityId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  throw new Error(`Unsupported accounting export entity type: ${entityType}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('ACCOUNTING_SYNC_WEBHOOK_URL')?.trim();
    if (!webhookUrl) {
      return jsonResponse({
        success: false,
        error: 'Accounting sync provider is not configured. Set ACCOUNTING_SYNC_WEBHOOK_URL to enable exports.',
      }, 501);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service configuration');

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => ({}));
    const organizationId = String(payload.organization_id || '').trim() || null;
    const limit = Math.min(Math.max(Number(payload.limit || 25), 1), 100);

    let query = supabaseClient
      .from('accounting_export_queue')
      .select('*')
      .eq('status', 'ready')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (organizationId) query = query.eq('organization_id', organizationId);

    const { data: rows, error: queueError } = await query;
    if (queueError) throw queueError;

    const results = [];
    const secret = Deno.env.get('ACCOUNTING_SYNC_WEBHOOK_SECRET')?.trim();

    for (const row of rows || []) {
      try {
        const entity = await loadEntity(supabaseClient, row);
        if (!entity) throw new Error(`Entity ${row.entity_type}:${row.entity_id} was not found`);

        const outbound = {
          event: 'accounting.export.ready',
          queue_id: row.id,
          organization_id: row.organization_id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          entity,
          exported_at: new Date().toISOString(),
        };
        const body = JSON.stringify(outbound);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (secret) headers['x-restops-signature-sha256'] = await hmacSha256Hex(secret, body);

        const response = await fetch(webhookUrl, { method: 'POST', headers, body });
        const responseText = await response.text();
        if (!response.ok) throw new Error(`Provider returned ${response.status}: ${responseText.slice(0, 500)}`);

        let providerResult: Record<string, unknown> = {};
        try {
          providerResult = responseText ? JSON.parse(responseText) : {};
        } catch (_error) {
          providerResult = { raw_response: responseText };
        }

        const externalReferenceId = String(
          providerResult.external_reference_id
          || providerResult.id
          || providerResult.reference
          || `${row.entity_type}:${row.entity_id}`,
        );

        const { error: updateError } = await supabaseClient
          .from('accounting_export_queue')
          .update({
            status: 'synced',
            synced_at: new Date().toISOString(),
            external_reference_id: externalReferenceId,
            error_message: null,
          })
          .eq('id', row.id);
        if (updateError) throw updateError;

        results.push({ id: row.id, status: 'synced', external_reference_id: externalReferenceId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await supabaseClient
          .from('accounting_export_queue')
          .update({ status: 'failed', error_message: message })
          .eq('id', row.id);
        results.push({ id: row.id, status: 'failed', error: message });
      }
    }

    return jsonResponse({
      success: results.every((result) => result.status === 'synced'),
      records_processed: results.length,
      records_synced: results.filter((result) => result.status === 'synced').length,
      records_failed: results.filter((result) => result.status === 'failed').length,
      results,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});