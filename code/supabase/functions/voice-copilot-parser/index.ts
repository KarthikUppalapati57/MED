import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

function normalizeTranscript(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseWithRules(transcript: string) {
  const lower = transcript.toLowerCase();
  const quantityMatch = lower.match(/(?:\b|^)(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|each|unit|units|case|cases)?\b/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
  const unit = quantityMatch?.[2]?.replace(/^pounds?$/, 'lbs').replace(/^ounces?$/, 'oz') || null;
  let intent = 'UNKNOWN';

  if (/\b(threw away|waste|spoiled|expired|discarded)\b/.test(lower)) intent = 'LOG_WASTE';
  else if (/\b(count| counted|on hand|inventory count|stock count)\b/.test(lower)) intent = 'UPDATE_COUNT';
  else if (/\b(prep|prepared|made)\b/.test(lower)) intent = 'LOG_PREP';
  else if (/\b(order|reorder|purchase)\b/.test(lower)) intent = 'CREATE_ORDER_NOTE';

  const withoutLead = lower
    .replace(/\b(i|we)?\s*(threw away|wasted|discarded|counted|count|prepared|prepped|made|order|reorder|purchase)\b/g, '')
    .replace(/\d+(?:\.\d+)?\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|each|unit|units|case|cases)?/g, '')
    .replace(/\b(of|for|to|please|need|needs|the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    intent,
    confidence: intent === 'UNKNOWN' ? 0.25 : 0.62,
    item_name: withoutLead || null,
    quantity,
    unit,
    reason: intent === 'LOG_WASTE' ? 'voice_command' : null,
    action: intent,
    parameters: {
      item_name: withoutLead || null,
      quantity,
      unit,
    },
    source: 'rules',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);
    const supabaseClient = getSupabaseClient(authHeader);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const payload = await req.json();
    const transcript = normalizeTranscript(payload.transcript);

    if (!transcript) {
      throw new Error('Missing required field: transcript');
    }

    const parsed = parseWithRules(transcript);
    const understood = parsed.intent !== 'UNKNOWN';

    return jsonResponse({
      success: true,
      understood,
      transcript,
      parsed,
      message: understood
        ? `Parsed ${parsed.intent.toLowerCase().replace(/_/g, ' ')} command${parsed.item_name ? ` for ${parsed.item_name}` : ''}.`
        : "I couldn't map that voice command to a supported action.",
    });
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, 400);
  }
});