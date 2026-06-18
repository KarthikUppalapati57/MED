// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseClient, getSupabaseServiceRoleClient } from '../_shared/supabase.ts';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const ROLE_RANK = {
  ground_staff: 0,
  location_manager: 1,
  manager: 1,
  branch_manager: 2,
  brand_manager: 2,
  org_owner: 3,
  owner: 3,
  admin: 3,
  platform_admin: 4,
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

function normalizeId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function minRole(role: string, required: string) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[required] ?? 999);
}

function applyScope(query: unknown, { orgId, brandId, locationId }: Record<string, string | null>) {
  let scoped = query.eq('organization_id', orgId);
  if (locationId) scoped = scoped.eq('location_id', locationId);
  else if (brandId) scoped = scoped.eq('brand_id', brandId);
  return scoped;
}

function applyOrgScope(query: unknown, { orgId }: Record<string, string | null>) {
  return query.eq('organization_id', orgId);
}

function applyLocationScope(query: unknown, { orgId, locationId, locationIds }: Record<string, unknown>) {
  let scoped = query.eq('organization_id', orgId);
  if (locationId) return scoped.eq('location_id', locationId);
  if (Array.isArray(locationIds) && locationIds.length > 0) return scoped.in('location_id', locationIds);
  return scoped;
}

function summarizeRows(rows: unknown[] | null | undefined, limit = 25) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

async function getScopedContext(supabase: unknown, scope: Record<string, unknown>) {
  const [
    invoices,
    inventory,
    products,
    vendors,
    sales,
    shifts,
    prepPlans,
    insights,
    orders,
  ] = await Promise.all([
    applyScope(
      supabase
        .from('invoices')
        .select('id, invoice_number, vendor_name, total_amount, status, invoice_date, due_date, created_at')
        .order('created_at', { ascending: false })
        .limit(25),
      scope,
    ),
    applyScope(
      supabase
        .from('inventory')
        .select('id, product_name, current_quantity, current_unit, reorder_point, par_level, unit_cost, updated_at')
        .order('updated_at', { ascending: false })
        .limit(35),
      scope,
    ),
    applyScope(
      supabase
        .from('products')
        .select('id, name, category, latest_price, base_unit, updated_at')
        .order('updated_at', { ascending: false })
        .limit(35),
      scope,
    ),
    applyScope(
      supabase
        .from('vendors')
        .select('id, name, status, total_spent, unpaid_ap, default_expense_category, updated_at')
        .order('updated_at', { ascending: false })
        .limit(25),
      scope,
    ),
    applyLocationScope(
      supabase
        .from('pos_sales_data')
        .select('id, organization_id, location_id, date, total_sales, transaction_count, created_at')
        .order('date', { ascending: false })
        .limit(30),
      scope,
    ),
    applyLocationScope(
      supabase
        .from('employee_shifts')
        .select('id, organization_id, location_id, employee_id, start_time, end_time, role, status')
        .order('start_time', { ascending: false })
        .limit(30),
      scope,
    ),
    applyScope(
      supabase
        .from('smart_prep_plans')
        .select('id, name, prep_date, par_quantity, on_hand_quantity, forecast_quantity, prep_quantity, priority, status')
        .order('prep_date', { ascending: false })
        .limit(25),
      scope,
    ),
    applyOrgScope(
      supabase
        .from('ai_insights')
        .select('id, title, description, severity, insight_type, resolved, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(25),
      scope,
    ),
    applyScope(
      supabase
        .from('auto_orders')
        .select('id, order_number, vendor_name, status, total_amount, order_date, expected_delivery_date')
        .order('created_at', { ascending: false })
        .limit(20),
      scope,
    ),
  ]);

  const errors = [
    invoices.error,
    inventory.error,
    products.error,
    vendors.error,
    sales.error,
    shifts.error,
    prepPlans.error,
    insights.error,
    orders.error,
  ].filter(Boolean);
  if (errors.length) {
    console.warn('AI Insights context partial errors:', errors.map((error) => error.message));
  }

  return {
    invoices: summarizeRows(invoices.data),
    inventory: summarizeRows(inventory.data, 35),
    products: summarizeRows(products.data, 35),
    vendors: summarizeRows(vendors.data),
    sales: summarizeRows(sales.data, 30),
    laborShifts: summarizeRows(shifts.data, 30),
    smartPrepPlans: summarizeRows(prepPlans.data),
    aiInsights: summarizeRows(insights.data),
    autoOrders: summarizeRows(orders.data),
  };
}

async function callGemini({ apiKey, message, history, context, scopeLabel }: Record<string, unknown>) {
  const systemInstruction = `You are Restops AI Insights Copilot, a restaurant operations copilot.
You must answer only with the scoped restaurant data provided in CONTEXT.
Never claim access to data outside the current scope.
If the answer cannot be supported by the context, say what data is missing and suggest the next operational check.
Keep answers concise, concrete, and action-oriented. Use bullets when helpful.
Current scope: ${scopeLabel}.`;

  const contents = [
    ...((Array.isArray(history) ? history : []).slice(-8).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(msg.content || '').slice(0, 1200) }],
    }))),
    {
      role: 'user',
      parts: [{
        text: [
          `Question: ${String(message).slice(0, 1500)}`,
          '',
          'CONTEXT:',
          JSON.stringify(context, null, 2).slice(0, 18000),
        ].join('\n'),
      }],
    },
  ];

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Gemini API error:', error);
    throw new Error(error?.error?.message || 'AI engine request failed');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate an answer from the available context.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('VITE_GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'Gemini API key is not configured in Supabase secrets.' }, 500);

    const authHeader = req.headers.get('Authorization');
    const userClient = getSupabaseClient(authHeader);
    const admin = getSupabaseServiceRoleClient();

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || '').trim();
    if (!message) return jsonResponse({ error: 'Message is required' }, 400);

    const requested = body.context || {};
    const orgId = normalizeId(requested.organizationId);
    let brandId = normalizeId(requested.brandId);
    let locationId = normalizeId(requested.locationId);
    if (!orgId) return jsonResponse({ error: 'Organization context is required' }, 400);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, organization_id, brand_id, location_id, status')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status === 'inactive') return jsonResponse({ error: 'User profile is not active' }, 403);
    if (profile.role === 'platform_admin') return jsonResponse({ error: 'Select a tenant organization before using AI Insights Copilot.' }, 403);
    if (!minRole(profile.role, 'manager')) return jsonResponse({ error: 'AI Insights Copilot requires manager access.' }, 403);
    if (profile.organization_id !== orgId) return jsonResponse({ error: 'Requested organization is outside your access.' }, 403);

    if (profile.location_id && !locationId) locationId = profile.location_id;
    if (profile.brand_id && !brandId) brandId = profile.brand_id;

    let brand = null;
    if (brandId) {
      const { data, error } = await admin
        .from('brands')
        .select('brand_id, name, organization_id')
        .eq('brand_id', brandId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: 'Requested brand is outside your organization.' }, 403);
      brand = { id: data.brand_id, name: data.name, organization_id: data.organization_id };
    }

    let location = null;
    if (locationId) {
      const { data, error } = await admin
        .from('locations')
        .select('id, name, organization_id, brand_id')
        .eq('id', locationId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: 'Requested location is outside your organization.' }, 403);
      if (brandId && data.brand_id !== brandId) return jsonResponse({ error: 'Requested location does not belong to the active brand.' }, 403);
      location = data;
    }

    if (profile.location_id && locationId !== profile.location_id) {
      return jsonResponse({ error: 'Requested location is outside your assigned location.' }, 403);
    }
    if (profile.brand_id) {
      if (brandId && brandId !== profile.brand_id) return jsonResponse({ error: 'Requested brand is outside your assigned brand.' }, 403);
      if (location && location.brand_id !== profile.brand_id) return jsonResponse({ error: 'Requested location is outside your assigned brand.' }, 403);
    }

    const { data: organization, error: orgError } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle();
    if (orgError) throw orgError;

    let locationIds = [];
    if (brand?.id && !location?.id) {
      const { data, error } = await admin
        .from('locations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('brand_id', brand.id);
      if (error) throw error;
      locationIds = (data || []).map((row) => row.id);
    }

    const scope = { orgId, brandId: brand?.id || null, locationId: location?.id || null, locationIds };
    const scopedContext = await getScopedContext(admin, scope);
    const scopeLabel = location
      ? `Location: ${location.name}`
      : brand
        ? `Brand: ${brand.name}`
        : `Organization: ${organization?.name || orgId}`;

    const reply = await callGemini({
      apiKey,
      message,
      history: body.history,
      context: {
        scope: {
          label: scopeLabel,
          organization: organization?.name || null,
          brand: brand?.name || null,
          location: location?.name || null,
        },
        data: scopedContext,
      },
      scopeLabel,
    });

    return jsonResponse({ reply, scope: { label: scopeLabel, organizationId: orgId, brandId: scope.brandId, locationId: scope.locationId } });
  } catch (error) {
    console.error('AI Insights chat error:', error);
    return jsonResponse({ error: error.message || 'AI Insights Copilot failed' }, 500);
  }
});
