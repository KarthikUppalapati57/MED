import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      throw new Error('Supabase function environment is not configured');
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const schedulerSecret = Deno.env.get('DASHBOARD_REPORT_SCHEDULER_SECRET');
    const headers: Record<string, string> = {
      Authorization: req.headers.get('Authorization') || `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    };
    if (schedulerSecret) headers['x-scheduler-secret'] = schedulerSecret;

    const response = await fetch(`${supabaseUrl}/functions/v1/dashboard-report-scheduler`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        date: body.date,
        force: Boolean(body.force),
        report_type: body.report_type || 'both',
      }),
    });

    const responseBody = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = responseBody ? JSON.parse(responseBody) : {};
    } catch {
      parsed = { raw: responseBody };
    }

    if (!response.ok) {
      return jsonResponse({ success: false, error: parsed.error || 'Dashboard report scheduler failed', details: parsed }, response.status);
    }

    return jsonResponse({
      success: true,
      message: 'Scheduled reports evaluated by dashboard-report-scheduler',
      scheduler: parsed,
    });
  } catch (error) {
    return jsonResponse({ error: error.message || String(error) }, 500);
  }
});