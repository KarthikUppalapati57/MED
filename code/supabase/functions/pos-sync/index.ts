import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

function providerSecret(provider: string) {
  const envKey = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_WEBHOOK_SECRET`
  return Deno.env.get(envKey) || Deno.env.get('POS_WEBHOOK_SECRET') || ''
}

async function verifySignature(provider: string, signature: string | null, secret: string, rawBody: string) {
  if (!secret) throw new Error('POS webhook secret is required for this active provider configuration')
  const expectedSignature = await hmacSha256Hex(secret, rawBody)
  if (!timingSafeEqualHex(normalizeSignature(signature), expectedSignature)) throw new Error('Invalid POS webhook signature')
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

    const provider = req.headers.get('x-pos-provider')?.toLowerCase()
    const signature = req.headers.get('x-pos-signature') || req.headers.get('x-webhook-signature')
    const locationId = req.headers.get('x-location-id')

    if (!provider || !locationId) {
      throw new Error('Missing provider or location identity')
    }

    const { data: config, error: configError } = await supabaseClient
      .from('pos_configurations')
      .select('*')
      .eq('location_id', locationId)
      .eq('provider', provider)
      .single()

    if (configError || !config || !config.is_active) {
      throw new Error('Invalid or inactive POS configuration')
    }

    const rawBody = await req.text()
    await verifySignature(provider, signature, config.webhook_secret || providerSecret(provider), rawBody)

    const rawPayload = JSON.parse(rawBody || '{}')
    let standardizedTicket = null

    if (provider === 'toast') {
      standardizedTicket = {
        organization_id: config.organization_id,
        location_id: config.location_id,
        status: 'open',
        total_amount: Number(rawPayload.checks?.[0]?.totalAmount || 0),
        source: 'pos',
      }
    } else if (provider === 'square') {
      standardizedTicket = {
        organization_id: config.organization_id,
        location_id: config.location_id,
        status: 'open',
        total_amount: Number(rawPayload.order?.net_amounts?.total_money?.amount || 0) / 100,
        source: 'pos',
      }
    } else {
      throw new Error(`Unsupported POS provider: ${provider}`)
    }

    const { data: insertedTicket, error: insertError } = await supabaseClient
      .from('sales_tickets')
      .insert(standardizedTicket)
      .select()
      .single()

    if (insertError) throw insertError

    await supabaseClient
      .from('pos_configurations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', config.id)

    return new Response(JSON.stringify({ success: true, ticket_id: insertedTicket.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('POS Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})