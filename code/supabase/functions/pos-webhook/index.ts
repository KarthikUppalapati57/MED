import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-toast-signature, x-square-signature, x-clover-signature, x-7shifts-signature, x-pos-signature, x-webhook-signature',
}

const encoder = new TextEncoder()

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeSignature(value: string | null) {
  return (value || '').trim().replace(/^sha256=/i, '').toLowerCase()
}

function timingSafeEqualHex(left: string, right: string) {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false
  const a = new Uint8Array(left.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])
  const b = new Uint8Array(right.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index]
  return diff === 0
}

function providerSignature(req: Request, provider: string) {
  return req.headers.get(`x-${provider}-signature`)
    || req.headers.get('x-pos-signature')
    || req.headers.get('x-webhook-signature')
}

function providerSecret(provider: string) {
  const envKey = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_WEBHOOK_SECRET`
  return Deno.env.get(envKey) || Deno.env.get('POS_WEBHOOK_SECRET') || ''
}

async function verifySignature(req: Request, provider: string, secret: string, rawBody: string) {
  if (!secret) throw new Error('POS webhook secret is required for this active provider configuration')
  const expected = await hmacSha256Hex(secret, rawBody)
  const received = normalizeSignature(providerSignature(req, provider))
  if (!received || !timingSafeEqualHex(received, expected)) throw new Error('Invalid POS webhook signature')
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const url = new URL(req.url)
    const provider = url.searchParams.get('provider')?.trim().toLowerCase()
    if (!provider) throw new Error("Missing 'provider' query parameter. Expected: toast, square, clover, or 7shifts")

    const rawBody = await req.text()
    const payload = JSON.parse(rawBody || '{}')
    const orgId = payload.organization_id
    const locationId = payload.location_id || null
    if (!orgId) throw new Error('Missing organization_id in payload')

    let configQuery = supabaseClient
      .from('pos_configurations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('provider', provider)
      .eq('is_active', true)
      .limit(1)

    if (locationId) configQuery = configQuery.eq('location_id', locationId)
    const { data: configs, error: configError } = await configQuery
    if (configError) throw configError
    const config = configs?.[0]
    if (!config) throw new Error('Invalid or inactive POS configuration')

    await verifySignature(req, provider, config.webhook_secret || providerSecret(provider), rawBody)

    const { error: insertError } = await supabaseClient
      .from('event_logs')
      .insert([{
        organization_id: orgId,
        event_name: `${provider}.${payload.type || payload.event_type || 'unknown_event'}`,
        entity_type: 'pos_webhook',
        entity_id: payload.id || payload.order?.id || null,
        payload,
      }])

    if (insertError) console.warn('Could not log POS webhook event. Proceeding.', insertError)

    let lineItems: Array<{ pos_item_id: string; item_name: string; quantity: number; price: number }> = []
    const eventType = payload.type || payload.event_type

    if (provider === 'toast' || provider === 'square') {
      if (eventType === 'order.completed') {
        const items = payload.order?.line_items || payload.order?.lineItems || []
        lineItems = items.map((item: Record<string, unknown>) => ({
          pos_item_id: String(item.id || item.item_id || item.guid || ''),
          item_name: String(item.name || item.display_name || item.item_name || ''),
          quantity: Number(item.quantity || 1),
          price: Number((item.total_money as { amount?: number })?.amount ? Number((item.total_money as { amount: number }).amount) / 100 : item.price || 0),
        })).filter((item) => item.pos_item_id && item.item_name)
      }
    } else if (provider === 'clover' || provider === '7shifts') {
      return jsonResponse({ received: true, provider, ignored: true, reason: 'Provider event accepted and logged; order-line ingestion is not enabled for this provider.' })
    } else {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    if (lineItems.length > 0) {
      const posOrderId = payload.order?.id || payload.id
      if (!posOrderId) throw new Error('Missing provider order id')

      const { data: posOrder, error: orderError } = await supabaseClient
        .from('pos_orders')
        .upsert({
          organization_id: orgId,
          location_id: locationId,
          pos_provider: provider,
          pos_order_id: String(posOrderId),
          total_amount: lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          order_date: payload.created_at || payload.createdAt || new Date().toISOString(),
          status: 'logged',
        }, { onConflict: 'organization_id, pos_provider, pos_order_id' })
        .select()
        .single()
      if (orderError) throw orderError

      await supabaseClient.from('pos_order_items').delete().eq('order_id', posOrder.id)
      const { error: itemsError } = await supabaseClient
        .from('pos_order_items')
        .insert(lineItems.map((item) => ({
          order_id: posOrder.id,
          pos_item_id: item.pos_item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          price: item.price,
        })))
      if (itemsError) throw itemsError
    }

    return jsonResponse({ received: true, provider, line_items: lineItems.length })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})