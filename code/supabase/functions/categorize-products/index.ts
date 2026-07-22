// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const AUTO_APPLY_CONFIDENCE = 85;

const ROLE_RANK = {
  ground_staff: 0,
  location_manager: 1,
  manager: 1,
  branch_manager: 2,
  org_manager: 3,
  tenant_super_admin: 4,
  owner: 3,
  admin: 5,
  platform_admin: 5,
};

const CATEGORY_TYPES = ['Food', 'Beer', 'Wine', 'Liquor', 'N/A Bev', 'Retail', 'Other'];
const CATEGORIES = [
  'Produce',
  'Dairy',
  'Poultry',
  'Meat',
  'Seafood',
  'Bakery',
  'Grocery and Dry Goods',
  'Frozen',
  'Beer',
  'Wine',
  'Liquor',
  'N/A Beverage',
  'Cleaning Supplies',
  'Paper and Packaging',
  'Restaurant Supplies',
  'Retail',
  'Uncategorized',
];

const ACCOUNTING_BY_TYPE = {
  Food: '5110',
  Beer: '5230',
  Wine: '5240',
  Liquor: '5220',
  'N/A Bev': '5210',
  Retail: '5300',
  Other: '5100',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

function getClient(authHeader: string | null, serviceRole = false) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const key = serviceRole
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    : Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (serviceRole) {
    return createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader || '' } },
  });
}

function normalizeId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function minRole(role: string, required: string) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[required] ?? 999);
}

function isUncategorized(category: unknown) {
  const value = String(category || '').trim().toLowerCase();
  return !value || value === 'uncategorized';
}

function normalizeCategoryType(value: unknown) {
  const text = String(value || '').trim();
  const match = CATEGORY_TYPES.find((categoryType) => categoryType.toLowerCase() === text.toLowerCase());
  return match || 'Other';
}

function normalizeCategory(value: unknown) {
  const text = String(value || '').trim();
  const match = CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase());
  return match || 'Uncategorized';
}

function normalizeAccounting(value: unknown, categoryType: string) {
  const text = String(value || '').trim();
  if (/^5\d{3}$/.test(text)) return text;
  return ACCOUNTING_BY_TYPE[categoryType] || ACCOUNTING_BY_TYPE.Other;
}

function normalizeConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function extractJson(text: string) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI response was not valid JSON');
  }
}

function getAzureOpenAIConfig() {
  const endpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT')?.trim()?.replace(/\/+$/, '');
  const key = Deno.env.get('AZURE_OPENAI_API_KEY')?.trim();
  const deployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT')?.trim();
  const apiVersion = Deno.env.get('AZURE_OPENAI_API_VERSION')?.trim() || 'v1';

  if (!endpoint || !key || !deployment) {
    throw new Error('Azure OpenAI is not configured in Supabase secrets.');
  }

  return { endpoint, key, deployment, apiVersion };
}

async function callAzureOpenAI(products: unknown[]) {
  const { endpoint, key, deployment, apiVersion } = getAzureOpenAIConfig();
  const promptProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    current_category: product.category,
    current_accounting_category: product.accounting_category,
    report_by_unit: product.report_by_unit,
    base_unit: product.base_unit,
    latest_price: product.latest_price,
  }));

  const prompt = [
    'Categorize restaurant purchasing products for Restops.',
    'Return STRICT JSON only, no markdown.',
    'Use this exact array shape:',
    '[{"id":"uuid","category_type":"Food","category":"Produce","accounting_category":"5110","confidence":95,"reason":"short reason"}]',
    '',
    `Allowed category_type values: ${CATEGORY_TYPES.join(', ')}`,
    `Allowed category values: ${CATEGORIES.join(', ')}`,
    'Accounting category must be a 5xxx COGS code. Prefer 5110 food, 5230 beer, 5240 wine, 5220 liquor, 5210 non-alcoholic beverage, 5300 retail, 5100 other.',
    'If uncertain, use category "Uncategorized" and confidence under 60.',
    '',
    'Products:',
    JSON.stringify(promptProducts, null, 2),
  ].join('\n');

  const body = {
    model: deployment,
    messages: [
      {
        role: 'system',
        content: 'You categorize restaurant purchasing products. Return strict JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.1,
    max_completion_tokens: 3000,
  };

  let url;
  if (apiVersion.toLowerCase() === 'v1') {
    url = endpoint.endsWith('/openai/v1') ? `${endpoint}/chat/completions` : `${endpoint}/openai/v1/chat/completions`;
  } else {
    url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    delete body.model;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure OpenAI product categorization error:', errorText);
    throw new Error(`Azure OpenAI categorization failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '[]';
  const parsed = extractJson(text);
  return Array.isArray(parsed) ? parsed : [];
}

function applyProductScope(query: unknown, { orgId, brandId, locationId, productIds }: Record<string, unknown>) {
  let scoped = query.eq('organization_id', orgId).is('deleted_at', null);

  if (Array.isArray(productIds) && productIds.length > 0) {
    scoped = scoped.in('id', productIds);
  } else {
    scoped = scoped.or('category.is.null,category.eq.Uncategorized,category.ilike.%uncategorized%,category_review_status.eq.pending');
  }

  if (brandId) scoped = scoped.eq('brand_id', brandId);
  if (locationId) scoped = scoped.eq('location_id', locationId);
  return scoped;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    const userClient = getClient(authHeader);
    const admin = getClient(null, true);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const orgId = normalizeId(body.organizationId);
    const brandId = normalizeId(body.brandId);
    const locationId = normalizeId(body.locationId);
    const limit = Math.max(1, Math.min(Number(body.limit || 25), 50));
    const autoApply = body.autoApply !== false;
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map(normalizeId).filter(Boolean).slice(0, 50)
      : [];

    if (!orgId) return jsonResponse({ error: 'Organization context is required' }, 400);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, organization_id, brand_id, location_id, status')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.status === 'inactive') return jsonResponse({ error: 'User profile is not active' }, 403);
    if (!minRole(profile.role, 'location_manager')) return jsonResponse({ error: 'Product categorization requires manager access.' }, 403);
    if (profile.role !== 'platform_admin' && profile.organization_id !== orgId) {
      return jsonResponse({ error: 'Requested organization is outside your access.' }, 403);
    }
    if (profile.brand_id && brandId && profile.brand_id !== brandId) return jsonResponse({ error: 'Requested brand is outside your access.' }, 403);
    if (profile.location_id && locationId && profile.location_id !== locationId) return jsonResponse({ error: 'Requested location is outside your access.' }, 403);

    const productQuery = admin
      .from('products')
      .select('id, name, category, accounting_category, report_by_unit, base_unit, latest_price, brand_id, location_id')
      .order('updated_at', { ascending: false })
      .limit(limit);

    const { data: products, error: productsError } = await applyProductScope(productQuery, {
      orgId,
      brandId: brandId || profile.brand_id || null,
      locationId: locationId || profile.location_id || null,
      productIds,
    });
    if (productsError) throw productsError;
    if (!products?.length) return jsonResponse({ processed: 0, updated: 0, applied: 0, suggestions: [] });

    const suggestions = await callAzureOpenAI(products);
    const byId = new Map(suggestions.map((suggestion) => [String(suggestion.id), suggestion]));
    let updated = 0;
    let applied = 0;
    const output = [];

    for (const product of products) {
      const raw = byId.get(String(product.id));
      if (!raw) continue;

      const categoryType = normalizeCategoryType(raw.category_type);
      const category = normalizeCategory(raw.category);
      const accounting = normalizeAccounting(raw.accounting_category, categoryType);
      const confidence = normalizeConfidence(raw.confidence);
      const shouldApply = autoApply && confidence >= AUTO_APPLY_CONFIDENCE && category !== 'Uncategorized' && isUncategorized(product.category);
      const reason = String(raw.reason || '').slice(0, 500);

      const payload = shouldApply
        ? {
            category,
            accounting_category: accounting,
            category_confidence: confidence,
            category_source: 'ai',
            category_review_status: 'approved',
            suggested_category: category,
            suggested_category_type: categoryType,
            suggested_accounting_category: accounting,
            category_reason: reason,
            category_suggested_at: new Date().toISOString(),
            category_reviewed_at: new Date().toISOString(),
            category_reviewed_by: authData.user.id,
            updated_at: new Date().toISOString(),
          }
        : {
            suggested_category: category,
            suggested_category_type: categoryType,
            suggested_accounting_category: accounting,
            category_confidence: confidence,
            category_source: 'ai',
            category_review_status: category === 'Uncategorized' ? 'rejected' : 'pending',
            category_reason: reason,
            category_suggested_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

      const { error: updateError } = await admin
        .from('products')
        .update(payload)
        .eq('id', product.id)
        .eq('organization_id', orgId);
      if (updateError) throw updateError;

      updated += 1;
      if (shouldApply) applied += 1;
      output.push({
        product_id: product.id,
        product_name: product.name,
        category,
        category_type: categoryType,
        accounting_category: accounting,
        confidence,
        applied: shouldApply,
        reason,
      });
    }

    return jsonResponse({
      processed: products.length,
      updated,
      applied,
      suggestions: output,
    });
  } catch (error) {
    console.error('Product categorization error:', error);
    return jsonResponse({ error: error.message || 'Product categorization failed' }, 500);
  }
});
