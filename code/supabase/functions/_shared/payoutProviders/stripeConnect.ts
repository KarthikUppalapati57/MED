const STRIPE_API = 'https://api.stripe.com/v1'

export const refColumn = 'stripe_transfer_id'

function stripeKey() {
  return Deno.env.get('STRIPE_SECRET_KEY') || ''
}

async function stripePost(path: string, body: URLSearchParams) {
  const key = stripeKey()
  if (!key) throw new Error('Stripe is not configured. STRIPE_SECRET_KEY is required for Connect payouts.')

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Stripe request failed: ${response.status}`)
  }
  return payload
}

export async function preflight(ctx: any) {
  if (!stripeKey()) {
    throw new Error('Stripe is not configured. STRIPE_SECRET_KEY is required for Connect payouts.')
  }

  const { data: bankAccounts, error: bankError } = await ctx.serviceSupabase
    .from('bank_accounts')
    .select('id')
    .eq('owner_type', 'vendor')
    .eq('owner_id', ctx.vendorId)
    .eq('purpose', 'vendor_receiving')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('default_for_owner', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(5)

  if (bankError) {
    console.error('Stripe Connect bank account lookup error:', bankError)
    throw new Error('Unable to resolve vendor Stripe Connect routing information.')
  }

  const bankAccountIds = (bankAccounts || []).map((account: any) => account.id)
  if (bankAccountIds.length === 0) {
    throw new Error('Vendor must submit bank details before Stripe Connect ACH payout.')
  }

  const { data: links, error: linkError } = await ctx.serviceSupabase
    .from('bank_account_provider_links')
    .select('id, bank_account_id, provider_owner_ref, provider_bank_ref, provider_status, payouts_enabled, requirements_due')
    .in('bank_account_id', bankAccountIds)
    .eq('provider', 'stripe_connect_custom')
    .eq('provider_use', 'payout')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (linkError) {
    console.error('Stripe Connect provider link lookup error:', linkError)
    throw new Error('Unable to resolve vendor Stripe Connect account.')
  }

  const link = links?.[0]
  if (!link?.provider_owner_ref) {
    throw new Error('Vendor is missing an active Stripe Connect account. Send the banking setup link first.')
  }
  if (link.payouts_enabled !== true) {
    const requirements = Array.isArray(link.requirements_due?.currently_due) && link.requirements_due.currently_due.length > 0
      ? ` Missing: ${link.requirements_due.currently_due.join(', ')}`
      : ''
    throw new Error(`Vendor Stripe Connect account is not payout-enabled yet.${requirements}`)
  }

  return { connectedAccountId: link.provider_owner_ref, providerLinkId: link.id }
}

export async function initiate(ctx: any, state: any) {
  const amountCents = Math.round(Number(ctx.transferAmount || 0) * 100)
  if (amountCents <= 0) throw new Error('Payout amount must be greater than zero.')

  const body = new URLSearchParams()
  body.set('amount', String(amountCents))
  body.set('currency', 'usd')
  body.set('destination', state.connectedAccountId)
  body.set('description', `Payment for Invoice ${ctx.invoiceNumber || ctx.invoiceId}`)
  body.set('metadata[invoice_id]', ctx.invoiceId || '')
  body.set('metadata[invoice_number]', ctx.invoiceNumber || '')
  body.set('metadata[vendor_id]', ctx.vendorId || '')
  body.set('metadata[payment_account_id]', ctx.paymentAccountId || '')
  body.set('metadata[payout_method]', 'stripe_connect_custom')

  const transfer = await stripePost('/transfers', body)
  return { providerRef: transfer.id }
}
